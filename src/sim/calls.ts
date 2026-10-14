import { chance, int } from './rng'
import type { World } from './types'
import { DAY, hourOf } from './time'
import { loc, person, playerLocationAt, uid, whereIs } from './world'

const CALL_ACTIVITY = [0.1, 0.05, 0.02, 0, 0, 0, 0.1, 0.4, 0.7, 0.8, 0.8, 0.9, 1, 0.9, 0.8, 0.8, 0.9, 1, 1, 1, 0.9, 0.7, 0.5, 0.25]

/** Simulate one hour of phone calls between people who know each other. */
export function generateCalls(w: World, t: number) {
  const h = hourOf(t)
  for (const p of w.people) {
    if (!p.alive || p.isPlayer || p.phone === '—') continue
    const act = CALL_ACTIVITY[h] * (p.traits.includes('night_owl') && (h >= 22 || h < 2) ? 2 : 1)
    for (const rel of p.relations) {
      if (!chance(w.rng, rel.closeness * 0.03 * act)) continue
      const callee = person(w, rel.personId)
      if (callee.phone === '—') continue
      const answered = callee.alive && chance(w.rng, 0.85)
      const callerLoc = loc(w, whereIs(p, t)).districtId
      w.calls.push({
        id: uid(w, 'c'), from: p.id, to: callee.id, time: t + int(w.rng, 0, 59), answered,
        durationMin: answered ? int(w.rng, 1, 25) : 0, towerDistrictId: callerLoc,
      })
      if (!callee.alive) {
        // Unanswered calls make people worry.
        const v = w.victims.find((x) => x.personId === callee.id)
        if (v) v.worry[p.id] = (v.worry[p.id] ?? 0) + rel.closeness * 0.35
      }
    }
  }
  if (h === 0) w.calls = w.calls.filter((c) => c.time > t - 21 * DAY)
}

/** District the player's own phone is connected to at time t. */
export const playerTower = (w: World, t: number) => loc(w, playerLocationAt(w, t)).districtId
