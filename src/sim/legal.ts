// Arrest is not the end: custody, lawyers, bail, and a trial that decides whether it is.
import { chance } from './rng'
import { anger, angerJury } from './anger'
import type { Minute, World } from './types'
import { DAY, HOUR, fmtTime } from './time'
import { addNews, fullName, loc, nameOf, playerPerson, uid } from './world'
import { send } from './messages'
import { playerHeat } from './police'

export type LawyerTier = 'public' | 'standard' | 'elite'

export const LAWYERS: Record<LawyerTier, { name: string; fee: number; skill: number; blurb: string }> = {
  public: { name: 'Public defender', fee: 0, skill: 0, blurb: 'Free. Forty other cases this week.' },
  standard: { name: 'Criminal defence attorney', fee: 4000, skill: 0.35, blurb: 'Competent, returns your calls.' },
  elite: { name: 'Top defence lawyer', fee: 15000, skill: 0.75, blurb: 'Gets juries to doubt their own eyes.' },
}

/** Days from arrest to trial. */
const TRIAL_AFTER = 7

/** Take the player into custody. `extra` is evidence weight on top of the cases (e.g. caught in the act). */
export function arrestPlayer(w: World, charge: string, extra: number, caseId?: string) {
  if (w.player.custody) return
  const me = playerPerson(w)
  const victims = w.victims.length
  const caughtInAct = extra >= 1
  // Bail: denied for multiple killings or a red-handed arrest, otherwise steep.
  const childVictim = w.victims.some((v) => w.cases.some((c) => c.child && c.victimId === v.personId))
  const bail = caughtInAct || victims > 1 || childVictim ? undefined : 20000 + victims * 15000
  w.player.custody = { since: w.time, charge, extra, caseId, inCustody: true, trialAt: w.time + TRIAL_AFTER * DAY, bail, bailPosted: false }
  // Everything you had planned is off.
  w.player.agenda = w.player.agenda.filter((s) => s.started && !s.done)
  addNews(w, 'news', `Arrest made: ${fullName(me)}`, `${fullName(me)}, ${me.age}, has been arrested and charged with ${charge}. A trial is set for ${fmtTime(w.player.custody.trialAt)}.`, true)
  send(w, 'court', `You are charged with ${charge}. Trial: ${fmtTime(w.player.custody.trialAt)}. ${bail ? `Bail is set at $${bail.toLocaleString()}.` : 'Bail is denied.'} You have the right to an attorney.`)
}

export function hireLawyer(w: World, tier: LawyerTier): string | null {
  const c = w.player.custody
  if (!c) return 'You haven’t been charged with anything.'
  const l = LAWYERS[tier]
  if (c.lawyer && LAWYERS[c.lawyer].skill >= l.skill) return 'You already have that level of representation.'
  if (w.player.money < l.fee) return `${l.name} wants $${l.fee.toLocaleString()} up front.`
  w.player.money -= l.fee
  c.lawyer = tier
  send(w, 'court', tier === 'public' ? 'A public defender has been assigned to your case.' : `${l.name} retained. “Don’t say a word to anyone. I mean anyone.”`)
  return null
}

export function postBail(w: World): string | null {
  const c = w.player.custody
  if (!c?.inCustody) return 'You’re not in custody.'
  if (!c.bail) return 'Bail was denied.'
  if (w.player.money < c.bail) return `Bail is $${c.bail.toLocaleString()}.`
  w.player.money -= c.bail
  c.inCustody = false
  c.bailPosted = true
  addNews(w, 'personal', 'Out on bail', `Don't miss your trial: ${fmtTime(c.trialAt)}, at ${courthouse(w).name}. Don't leave town.`, true)
  return null
}

export const courthouse = (w: World) => w.locations.find((l) => l.kind === 'police') ?? w.locations[0]

/** How likely a jury is to convict, given the evidence and your lawyer. */
export function convictionChance(w: World): number {
  const c = w.player.custody
  if (!c) return 0
  // More evidence → likelier guilty; a good lawyer shaves that down but cannot erase it.
  // Jurors in a child murder want someone to pay — more for every child.
  const child = w.cases.some((x) => x.child && (x.suspicion[w.player.personId] ?? 0) > 0)
  const evidence = playerHeat(w) + c.extra + (child ? angerJury(w) : 0)
  const base = 1 - Math.exp(-evidence * 1.2)
  const skill = LAWYERS[c.lawyer ?? 'public'].skill
  return Math.max(0.03, Math.min(0.97, base * (1 - skill * 0.55)))
}

function trial(w: World, t: Minute) {
  const c = w.player.custody!
  const me = playerPerson(w)
  const p = convictionChance(w)
  // Out on bail and nowhere near the courthouse? That's a warrant, and no more bail.
  if (c.bailPosted && !c.inCustody && !w.player.agenda.some((s) => s.activity.kind === 'obligation' && s.activity.obligation.type === 'court' && s.started)) {
    if (!c.missedCourt) {
      c.missedCourt = true
      c.inCustody = true
      c.bail = undefined
      c.extra += 0.4
      c.trialAt = t + 3 * DAY
      addNews(w, 'personal', 'Bench warrant', 'You didn’t show up to court. Officers picked you up. No bail this time.', true)
      return
    }
  }
  if (chance(w.rng, p)) {
    w.gameOver = { at: t, kind: 'convicted', childKiller: anger(w) > 0 || undefined, reason: `Found guilty of ${c.charge}${w.victims.length > 1 ? ` — and the jury heard about the others` : ''}. ${LAWYERS[c.lawyer ?? 'public'].name} couldn't save you. Life without parole.` }
    w.pauseRequested = true
    return
  }
  w.player.custody = undefined
  w.player.acquitted = (w.player.acquitted ?? 0) + 1
  addNews(w, 'news', `${fullName(me)} acquitted`, `A jury found ${fullName(me)} not guilty of ${c.charge}. ${c.lawyer === 'elite' ? 'Their lawyer called it "a triumph of reasonable doubt."' : 'Prosecutors say they are reviewing the case.'}`, true)
  send(w, 'court', 'Not guilty. You are free to go. (For now — the detectives in the back row didn’t look convinced.)')
}

/** Hourly: court dates, and the job you can't go to from a cell. */
export function processLegal(w: World, t: Minute) {
  const c = w.player.custody
  if (!c) return
  // The court date goes on your calendar once you're out on bail.
  if (!c.inCustody && !w.player.agenda.some((s) => s.activity.kind === 'obligation' && s.activity.obligation.type === 'court')) {
    const at = c.trialAt - HOUR
    if (at > t) w.player.agenda.push({ id: uid(w, 'act'), activity: { kind: 'obligation', obligation: { type: 'court', title: 'Your trial', locationId: courthouse(w).id } }, label: 'Your trial', departAt: at - 30, startAt: at, endAt: at + 3 * HOUR, returnAt: at + 3 * HOUR + 30, started: false, fixed: true })
  }
  if (t >= c.trialAt) trial(w, t)
}

export const inCustody = (w: World) => !!w.player.custody?.inCustody

/** A short line for the custody screen about who is waiting for you outside. */
export function custodyNotes(w: World): string[] {
  const out: string[] = []
  const rom = w.player.romance
  if (rom?.status === 'married') out.push(`${nameOf(w, rom.personId)} hasn't visited.`)
  if (w.player.employed) out.push('Work has been calling.')
  out.push(`You're held at ${loc(w, courthouse(w).id).name}.`)
  return out
}
