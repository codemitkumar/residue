// The thing underneath the cover life: the urge, the blackouts, and what the press calls you.
import { chance, pick } from './rng'
import type { Minute, OperationPlan, ScheduledActivity, Victim, World } from './types'
import { DAY, HOUR, dayOf, fmtTime } from './time'
import { addNews, districtName, fullName, loc, meet, peopleAt, playerLocationAt, playerPerson, uid } from './world'
import { activityLabel, completeActivity, startActivity } from './actions'
import { isOpen } from './geo'

/** Per hour without a kill. ~12 days from calm to breaking point. */
const GROWTH = 0.0035

const LINES: [number, string, string][] = [
  [0.55, 'Restless', 'You keep looking at people a second too long.'],
  [0.7, 'You can’t sleep', 'Three nights now. Every face on the street is a possibility.'],
  [0.85, 'It’s getting loud', 'Your hands won’t stop shaking. You need to do something. Soon.'],
  [0.95, 'Last chance', 'You can feel yourself slipping. If you don’t choose, it will choose for you.'],
]

export function processUrge(w: World, t: Minute) {
  const before = w.player.urge ?? 0.2
  // Having a kill planned keeps it on a leash; nothing planned and it builds fast.
  const planned = w.player.agenda.some((s) => s.activity.kind === 'operation' && !s.done)
  const after = Math.min(1, before + GROWTH * (planned ? 0.25 : 1))
  w.player.urge = after
  for (const [th, headline, body] of LINES) if (before < th && after >= th) addNews(w, 'personal', headline, body, th >= 0.85)
  if (after >= 1) blackout(w, t)
}

/** The urge wins. Someone nearby dies, and you remember almost none of it. */
function blackout(w: World, t: Minute) {
  const me = playerPerson(w)
  const here = loc(w, playerLocationAt(w, t))
  // Wherever you are, whoever is closest and alone enough.
  const spots = w.locations.filter((l) => l.districtId === here.districtId && l.id !== me.homeId)
  const candidates = spots.filter((l) => isOpen(l.kind, t)).flatMap((l) => peopleAt(w, l.id, t).filter((p) => p.age >= 16).map((p) => ({ p, l, crowd: peopleAt(w, l.id, t).length })))
  if (!candidates.length) return // nobody around — it gnaws at you another hour
  candidates.sort((a, b) => a.crowd - b.crowd)
  const { p: victim, l } = pick(w.rng, candidates.slice(0, 3))

  // Whatever you were doing, you stopped.
  for (const s of w.player.agenda.filter((x) => !x.started && x.departAt < t + 3 * HOUR)) w.player.agenda = w.player.agenda.filter((x) => x !== s)

  meet(w, victim.id, 'You don’t remember meeting them')
  const op: OperationPlan = {
    targetId: victim.id, locationId: l.id, at: t, weapon: 'hands', disposalLocationId: 'none', disposal: 'leave',
    victimPhone: chance(w.rng, 0.5) ? 'left' : 'kept', bringOwnPhone: true, vehicle: 'foot', gloves: false, mask: false,
    bleach: false, tarp: false, lure: 'none', frenzy: true,
  }
  const s: ScheduledActivity = { id: uid(w, 'act'), activity: { kind: 'operation', op }, label: '', departAt: t, startAt: t, endAt: t + HOUR, returnAt: t + 2 * HOUR, started: false }
  s.label = `Blackout — ${activityLabel(w, s.activity).replace('Kill: ', '')}`
  w.player.agenda.push(s)
  w.player.agenda.sort((a, b) => a.departAt - b.departAt)
  startActivity(w, s)
  const killed = !victim.alive
  s.report = killed
    ? { headline: 'You lost time', body: `You come to at ${l.name} with ${victim.first} ${victim.last} at your feet and your hands aching. You don't remember choosing them. Your phone was in your pocket the whole time.` }
    : { headline: 'You lost time', body: `You come to running from ${l.name}. ${victim.first} got away. They saw your face.` }
  w.player.urge = killed ? 0 : 0.6
  completeActivity(w, s)
  s.done = true
  w.pauseRequested = true
}

// ---------------------------------------------------------------- the press

const NOUN: Record<Victim['weapon'], string[]> = {
  knife: ['Ripper', 'Butcher', 'Blade'],
  rope: ['Strangler', 'Garrotter'],
  hands: ['Choker', 'Strangler'],
  pistol: ['Gunman', 'Shooter'],
}
const BY_DISPOSAL: Partial<Record<Victim['disposal'], string>> = { sink: 'Drowner', bury: 'Gravedigger', foundation: 'Mason', dump: 'Binman' }

/** Once deaths are linked, the papers give the killer a name. */
export function nameTheKiller(w: World, victims: Victim[]) {
  if (w.killerName) return
  const last = victims[victims.length - 1]
  const district = districtName(w, loc(w, last.bodyLocationId).districtId)
  const disposal = victims.map((v) => BY_DISPOSAL[v.disposal]).find(Boolean)
  const noun = disposal && chance(w.rng, 0.5) ? disposal : pick(w.rng, NOUN[last.weapon])
  w.killerName = `The ${district} ${noun}`
  addNews(w, 'news', `Police hunt “${w.killerName}”`, `With ${victims.length} deaths now linked, the city has a name for whoever is responsible. Residents are urged to stay vigilant.`, true)
}

// ---------------------------------------------------------------- the end

export function surrender(w: World, how: 'station' | 'call') {
  const me = playerPerson(w)
  const n = w.victims.length
  w.gameOver = {
    at: w.time,
    kind: 'surrendered',
    reason: `${fullName(me)} ${how === 'call' ? 'confessed over the phone to detectives' : 'walked into the police station'} on ${fmtTime(w.time)} and confessed to ${n === 0 ? 'nothing anyone could prove' : `${n} killing${n === 1 ? '' : 's'}`}${w.killerName ? ` as ${w.killerName}` : ''}.`,
  }
  w.pauseRequested = true
}

export const daysFree = (w: World) => dayOf(w.time) - 3 + (w.time % DAY) / DAY
