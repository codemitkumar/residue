// Uniforms on the street: routine patrols, crackdowns after a body turns up, roadblocks —
// and what happens when a patrol car rolls up in the middle of something.
import { chance } from './rng'
import type { Location, Minute, OperationPlan, World } from './types'
import { DAY, HOUR, hourOf, isNight } from './time'
import { addEvidence, addNews, aPerson, districtName, fullName, loc, playerPerson } from './world'
import { eventsOn } from './environment'
import { reportEvidence } from './police'
import { arrestPlayer } from './legal'
import { angerPatrol } from './anger'

/** Baseline chance per hour that a patrol passes a place, by kind. */
const BASE: Partial<Record<string, number>> = {
  police: 0.6, hospital: 0.06, bar: 0.05, parking: 0.05, office: 0.04, grocery: 0.04, restaurant: 0.04, pharmacy: 0.04,
  hardware: 0.03, gas: 0.04, park: 0.03, alley: 0.03, apartment: 0.03, house: 0.02, warehouse: 0.02, storage: 0.02,
  construction: 0.015, lake: 0.01, forest: 0.008, factory: 0.02, gym: 0.03, school: 0.04,
}

/** Police presence at a place right now: chance per hour a patrol comes by. */
export function patrolAt(w: World, l: Location, t: Minute): number {
  let p = BASE[l.kind] ?? 0.03
  if (isNight(t) && (l.kind === 'bar' || l.kind === 'alley' || l.kind === 'parking')) p *= 1.4
  if (hourOf(t) >= 2 && hourOf(t) < 5) p *= 0.7 // the quiet hours
  const heat = w.patrolHeat?.[l.districtId]
  if (heat && heat.until > t) p += heat.level * ((heat.until - t) / (heat.until - heat.since))
  if (w.taskForce) p += 0.02
  // A child taken: every car in the city is out looking.
  p += (w.outrage ?? 0) * 0.12 + angerPatrol(w)
  if (eventsOn(w, t).some((e) => (e.kind === 'festival' || e.kind === 'marathon' || e.kind === 'fireworks') && (!e.districtId || e.districtId === l.districtId))) p += 0.05
  return Math.min(0.9, p)
}

export const presenceLabel = (p: number) => (p < 0.03 ? 'Rarely see police here' : p < 0.07 ? 'The odd patrol car' : p < 0.15 ? 'Regular patrols' : 'Heavy police presence')

export const roadblockIn = (w: World, districtId: string, t: Minute) => (w.roadblocks ?? []).find((r) => r.districtId === districtId && r.from <= t && r.until > t)

/** A body was found: flood the district with patrols and block the roads in and out. */
export function crackdown(w: World, districtId: string, caseId: string) {
  ;(w.patrolHeat ??= {})[districtId] = { level: 0.14, since: w.time, until: w.time + 4 * DAY }
  ;(w.roadblocks ??= []).push({ districtId, from: w.time + 2 * HOUR, until: w.time + 38 * HOUR, caseId })
  w.roadblocks = w.roadblocks.filter((r) => r.until > w.time)
  addNews(w, 'news', `Roadblocks in ${districtName(w, districtId)}`, 'Police are stopping vehicles in and out of the area and patrols have been stepped up. Expect delays.')
}

/** Your plate is written down at a checkpoint. */
export function logPlate(w: World, districtId: string, t: Minute, strength: number, victimId?: string) {
  const r = roadblockIn(w, districtId, t)
  if (!r) return
  const c = w.cases.find((x) => x.id === r.caseId)
  const plate = w.player.car?.plate ?? 'unknown'
  const e = addEvidence(w, { kind: 'witness', via: 'canvass', time: t, districtId, victimId, pointsTo: w.player.personId, strength, description: `Roadblock log: ${fullName(playerPerson(w))}'s car (${plate}) passed the checkpoint in ${districtName(w, districtId)} at ${hourOf(t)}:00.` })
  if (c) reportEvidence(w, c, [e.id])
}

export type Flight = 'run' | 'hide' | 'surrender'

/** Real minutes the player has to react: 10 real minutes = 60 game minutes at 6x. */
export const ENCOUNTER_GAME_MINUTES = 60

/** A patrol shows up mid-job. The player has to choose — the clock is running. */
export function startEncounter(w: World, l: Location, t: Minute, op: OperationPlan, caseId: string | undefined, victimId: string, phase: 'struggle' | 'after') {
  w.player.encounter = { at: t, deadline: Math.max(t, w.time) + ENCOUNTER_GAME_MINUTES, locationId: l.id, caseId, victimId, phase, mask: op.mask, vehicle: op.vehicle, stolenPlates: op.stolenPlates }
  addNews(w, 'personal', 'POLICE', `Blue lights at ${l.name}. Run, hide, or give up — decide now.`, true)
}

/** The player decided (or didn't). Returns true if they were arrested. */
export function resolveEncounter(w: World, how: Flight | 'froze'): boolean {
  const e = w.player.encounter
  if (!e) return false
  w.player.encounter = undefined
  const l = loc(w, e.locationId)
  const me = playerPerson(w)
  const t = w.time
  const hurt = (w.player.injuredUntil ?? 0) > t
  const dark = isNight(e.at) ? 1 - l.lighting : 0
  const charge = e.phase === 'struggle' ? 'attempted murder' : 'murder'
  if (how === 'froze' || how === 'surrender') {
    arrestPlayer(w, charge, how === 'froze' ? 1.1 : 1.0, e.caseId)
    addNews(w, 'personal', how === 'froze' ? 'You froze' : 'Hands where we can see them', how === 'froze' ? 'You stood there too long. They had you on the ground before you could think.' : 'You raised your hands. Cold cuffs, a hand on your head, the back seat.', true)
    return true
  }
  const odds = how === 'run' ? (e.vehicle === 'foot' ? 0.55 : 0.75) - (hurt ? 0.2 : 0) : 0.25 + dark * 0.55 - (hurt ? 0.1 : 0)
  if (!chance(w.rng, Math.max(0.05, odds))) {
    arrestPlayer(w, charge, 1.0, e.caseId)
    addNews(w, 'personal', 'Caught', how === 'run' ? 'They ran you down two streets later.' : 'A flashlight found you behind the bins.', true)
    return true
  }
  // Got away — but an officer saw something.
  const c = e.caseId ? w.cases.find((x) => x.id === e.caseId) : undefined
  const plate = how === 'run' && e.vehicle !== 'foot' && chance(w.rng, 0.4)
  const ids = [addEvidence(w, {
    kind: 'witness', via: 'canvass', time: e.at, locationId: l.id, districtId: l.districtId, victimId: e.victimId, pointsTo: me.id,
    strength: (e.mask ? 0.25 : 0.65) * (how === 'hide' ? 0.5 : 1),
    description: `A patrol officer interrupted ${e.mask ? 'a masked figure' : aPerson(me)} at ${l.name} and gave chase${how === 'hide' ? ', but lost them in the dark' : ''}.`,
  }).id]
  if (plate) {
    ids.push(addEvidence(w, {
      kind: 'witness', via: 'canvass', time: e.at, locationId: l.id, victimId: e.victimId, pointsTo: me.id, strength: e.stolenPlates ? 0 : 0.5,
      description: e.stolenPlates ? 'The officer radioed in a plate — it belongs to a stolen set.' : `The officer radioed in the fleeing car's plate: ${w.player.car?.plate ?? '—'}.`,
    }).id)
  }
  if (c) reportEvidence(w, c, ids)
  if (chance(w.rng, 0.4)) w.player.injuredUntil = Math.max(w.player.injuredUntil ?? 0, t + DAY)
  addNews(w, 'personal', 'You got away', how === 'run' ? 'Sirens behind you, then fewer, then none.' : 'Footsteps. A flashlight sweep. Then nothing. You waited an hour before moving.', true)
  return false
}

/** Every step: an unanswered encounter becomes an arrest when the deadline passes. */
export function checkEncounter(w: World) {
  if (w.player.encounter && w.time >= w.player.encounter.deadline) resolveEncounter(w, 'froze')
}

/** When during a job of `minutes` on site a patrol turns up, or null if it never does. */
export function interruptionAt(w: World, l: Location, t: Minute, minutes: number): number | null {
  const perMin = patrolAt(w, l, t) / 60
  for (let m = 0; m < minutes; m++) if (chance(w.rng, perMin)) return m
  return null
}
