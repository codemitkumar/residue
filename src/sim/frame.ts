import { chance } from './rng'
import type { Case, Evidence, Keepsake, Minute, Person, ScheduledActivity, World } from './types'
import { fmtTime, inBlock } from './time'
import { addEvidence, addNews, busyError, fullName, housemates, loc, nameOf, person, playerPerson, uid, whereIs } from './world'
import { queueTask, reportEvidence } from './police'

// Framing: take something that carries someone's DNA, leave it at a kill, point the police at them.
// Whether it sticks depends on the truth: where the scapegoat really was when it happened.

/** What you can pocket from someone, depending on where they are. */
function keepsakeAt(w: World, p: Person, locationId: string): [what: string, item: string] {
  if (locationId === p.homeId) return ['a cigarette butt from their trash', 'cigarette butt']
  if (locationId === p.workplaceId) return ['a coffee cup from their desk', 'coffee cup']
  const kind = loc(w, locationId).kind
  if (kind === 'bar' || kind === 'restaurant') return ['the glass they drank from', 'glass']
  if (kind === 'gym') return ['a towel they used', 'towel']
  return ['a tissue they dropped', 'tissue']
}

export function completeLift(w: World, s: ScheduledActivity, personId: string): { headline: string; body: string } {
  const p = person(w, personId)
  if (!p.alive) return { headline: 'Nothing to take', body: `${p.first} is dead.` }
  const where = loc(w, whereIs(p, s.startAt))
  const home = where.id === p.homeId
  const ok = chance(w.rng, (home ? 0.6 : 0.8) * (p.traits.includes('paranoid') ? 0.6 : 1))
  if (!ok) return { headline: `Came back empty-handed`, body: `You watched ${p.first} at ${where.name} for an hour, but there was never a moment to take anything.` }
  const knowsYou = p.relations.some((r) => r.personId === w.player.personId)
  const noticed = chance(w.rng, (p.traits.includes('nosy') || p.traits.includes('paranoid') ? 0.35 : 0.1) * (knowsYou ? 1.5 : 1))
  const [what, item] = keepsakeAt(w, p, where.id)
  const k: Keepsake = { id: uid(w, 'k'), personId: p.id, what, item, at: s.startAt, noticed }
  ;(w.player.keepsakes ??= []).push(k)
  return {
    headline: `Bagged: ${p.first}'s ${item}`,
    body: `${k.what[0].toUpperCase()}${k.what.slice(1)}, sealed in a sandwich bag. Their DNA is on it.${noticed ? ` ${p.first} glanced over just as you took it.` : ''}`,
  }
}

/** During a kill: leave the keepsake at the scene. Forensics will find it. */
export function plantAtScene(w: World, keepsakeId: string, victimId: string, at: Minute): Evidence | null {
  const ks = w.player.keepsakes ?? []
  const k = ks.find((x) => x.id === keepsakeId)
  if (!k) return null
  w.player.keepsakes = ks.filter((x) => x !== k)
  return addEvidence(w, {
    kind: 'dna', via: 'forensics', time: at, victimId, pointsTo: k.personId, strength: 1.0, needsSample: true,
    planted: { keepsakeId: k.id, noticed: k.noticed },
    description: `Foreign DNA on a ${k.item} found at the scene.`,
  })
}

/** Police have this person's prints and DNA. */
export const hasSample = (w: World, personId: string) =>
  person(w, personId).isPlayer ? w.player.samplesOnFile : !!w.samples?.includes(personId)

/** A case the player can call in a tip about: one of their own, with police working it. */
export const tipCases = (w: World) => w.cases.filter((c) => c.status !== 'closed' && w.victims.some((v) => v.personId === c.victimId))

export function callTip(w: World, caseId: string, personId: string, phone: 'own' | 'burner'): string | null {
  const busy = busyError(w)
  if (busy) return busy
  const c = w.cases.find((x) => x.id === caseId)
  const p = w.people.find((x) => x.id === personId)
  if (!c || c.status === 'closed') return 'There is no open case to call about.'
  if (!p || !p.alive || p.isPlayer) return 'Pick someone alive.'
  if (p.id === c.victimId) return 'That’s the victim.'
  if (p.age < 12) return 'Nobody would believe that.'
  if (phone === 'burner' && !(w.player.inventory.burner || w.player.inventory.clean_burner)) return 'You need a burner phone.'
  const key = `tip:${p.id}`
  if (c.done.includes(key)) return 'You already called about them. Calling again would sound wrong.'
  c.done.push(key)
  if (c.status === 'cold') c.status = 'open'
  c.lastProgress = w.time
  const me = playerPerson(w)
  const ids = [addEvidence(w, { kind: 'statement', via: 'canvass', time: w.time, victimId: c.victimId, pointsTo: p.id, strength: 0.35, description: `An anonymous caller named ${fullName(p)} in connection with the ${person(w, c.victimId).last} case.` }).id]
  // The tip line sees caller ID. A clean burner is nobody; a store burner is a lead; your own phone is you.
  if (phone === 'own') ids.push(addEvidence(w, { kind: 'call_log', via: 'canvass', time: w.time, victimId: c.victimId, pointsTo: me.id, strength: 0.2, description: `The tip naming ${fullName(p)} came from ${fullName(me)}'s own phone (${me.phone}). Why do they know so much?` }).id)
  else if (!w.player.inventory.clean_burner) ids.push(addEvidence(w, { kind: 'call_log', via: 'phone_records', time: w.time, victimId: c.victimId, pointsTo: me.id, strength: 0.15, description: `The prepaid phone used for the ${fullName(p)} tip was bought locally by ${fullName(me)}.` }).id)
  // Your own number shows up straight away; a store burner takes a records request to trace.
  reportEvidence(w, c, phone === 'own' ? ids : ids.slice(0, 1))
  if (phone === 'burner') queueTask(w, c, 'phone_records', {}, `phone_records:tip:${p.id}`)
  queueTask(w, c, 'question', { personId: p.id }, `question:${p.id}`)
  addNews(w, 'personal', 'Tip called in', `You gave them ${fullName(p)}'s name${phone === 'own' ? ' — from your own phone' : ''}. Now they'll want to talk to ${p.first}.`)
  return null
}

/** Questioning someone who isn't the player: samples on file, and their real whereabouts checked. */
export function questionInnocent(w: World, c: Case, s: Person): Evidence[] {
  const samples = (w.samples ??= [])
  if (!samples.includes(s.id)) samples.push(s.id)
  const v = w.victims.find((x) => x.personId === c.victimId)
  const at = v?.killedAt ?? c.openedAt
  const where = whereIs(s, at)
  const out: Evidence[] = []
  const add = (strength: number, description: string) =>
    out.push(addEvidence(w, { kind: 'alibi', via: 'canvass', time: w.time, victimId: c.victimId, pointsTo: s.id, strength, description }))
  // Coworkers, a crowded bar, a spouse — or nobody at all.
  const atWork = s.shift && s.workplaceId && inBlock(at, s.shift)
  const company = housemates(w, s).filter((h) => h.alive)
  if (atWork) add(-1.2, `${fullName(s)} was on shift at ${loc(w, s.workplaceId!).name}; coworkers confirm it.`)
  else if (where !== s.homeId && chance(w.rng, 0.8)) add(-1, `${fullName(s)} was at ${loc(w, where).name} at the time; staff remember them.`)
  else if (where === s.homeId && company.length && chance(w.rng, 0.75)) add(-0.8, `${nameOf(w, company[0].id)} says ${s.first} was home all night.`)
  else add(0.35, `${fullName(s)} says they were home${company.length ? '' : ' alone'} around ${fmtTime(at)}. Nobody can confirm it.`)
  // Matches for anything already found.
  for (const e of w.evidence) if (e.discovered && e.pointsTo === s.id) out.push(...sampleMatch(w, e))
  return out
}

/**
 * Found evidence that needs a sample, from someone (not the player) whose sample is on file: a match.
 * Confronted with it, a scapegoat who saw you take their things names you. Returns new evidence for that case.
 */
export function sampleMatch(w: World, e: Evidence): Evidence[] {
  const mc = w.cases.find((x) => x.id === e.caseId)
  if (!mc || !e.needsSample || !e.pointsTo || person(w, e.pointsTo).isPlayer || !hasSample(w, e.pointsTo)) return []
  const key = `match:${e.id}`
  if (mc.done.includes(key)) return []
  mc.done.push(key)
  const s = person(w, e.pointsTo)
  mc.log.push({ time: w.time, text: `MATCH: DNA from the ${nameOf(w, mc.victimId)} scene matches ${fullName(s)}.` })
  if (!e.planted?.noticed) return []
  const me = playerPerson(w)
  const knows = s.relations.some((r) => r.personId === me.id)
  return [addEvidence(w, { kind: 'statement', via: 'canvass', time: w.time, victimId: mc.victimId, pointsTo: me.id, strength: knows ? 0.7 : 0.3, description: knows ? `${fullName(s)} insists ${fullName(me)} took something of theirs days before — "they're setting me up."` : `${fullName(s)} says a stranger took something of theirs days before. Claims they're being framed.` })]
}

/** A new linked killing (at `killedAt`) while the scapegoat sat in a cell: the old case reopens. */
export function doubtCharges(w: World, linkedVictimIds: string[], killedAt: Minute) {
  const at = w.time
  for (const vid of linkedVictimIds) {
    const c = w.cases.find((x) => x.victimId === vid && x.status === 'closed' && x.charged && (x.chargedAt ?? Infinity) < killedAt)
    if (!c) continue
    const s = person(w, c.charged!)
    c.status = 'open'
    c.lastProgress = at
    const e = addEvidence(w, { kind: 'alibi', via: 'canvass', time: at, victimId: c.victimId, pointsTo: s.id, strength: -3, description: `${fullName(s)} was in custody when the same killer struck again.` })
    reportEvidence(w, c, [e.id])
    c.log.push({ time: at, text: `Case reopened: ${fullName(s)} could not have committed the latest killing. Charges dropped.` })
    c.charged = undefined
    addNews(w, 'news', `Charges dropped against ${fullName(s)}`, `Prosecutors released ${fullName(s)} after another killing bearing the same hallmarks. The ${nameOf(w, c.victimId)} case is open again.`, true)
  }
}
