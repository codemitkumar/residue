import { chance, pick } from './rng'
import type { Victim, World } from './types'
import { DAY, HOUR, dayOf, dowOf, hourOf } from './time'
import { fullName, housemates, loc, peopleAt, person } from './world'
import { bodyFound, fileMissingReport } from './police'
import { trafficAt, weatherOn } from './environment'

/** Pour time for a construction site; bodies placed before it are sealed in concrete. */
export const pourAt = (pourDay: number) => pourDay * DAY + 7 * HOUR

/** Dumpsters are emptied every third morning. */
const dumpsterCollected = (v: Victim, t: number) => {
  for (let d = dayOf(v.killedAt); d <= dayOf(t); d++) {
    const pickup = d * DAY + 6 * HOUR
    if (d % 3 === 0 && pickup > v.killedAt && pickup <= t) return true
  }
  return false
}

const sealed = (w: World, v: Victim, t: number) => {
  const l = loc(w, v.bodyLocationId)
  return v.disposal === 'foundation' && l.pourDay !== undefined && t >= pourAt(l.pourDay)
}

/** How well hidden a body is right now (0 = in plain sight, 1 = never found by searching). */
export function concealmentNow(w: World, v: Victim): number {
  const t = w.time
  switch (v.disposal) {
    case 'leave': return 0.05
    case 'hide': return 0.5
    case 'dump': return dumpsterCollected(v, t) ? 0.95 : 0.55
    case 'bury': return v.concealment
    case 'sink': return v.concealment
    case 'foundation': return sealed(w, v, t) ? 0.98 : 0.7
    case 'cleaned': return 0.995
  }
}

/** Chance per hour that someone stumbles on the body. */
function hourlyDiscovery(w: World, v: Victim, t: number): number {
  const l = loc(w, v.bodyLocationId)
  const h = hourOf(t)
  const days = (t - v.killedAt) / DAY
  switch (v.disposal) {
    case 'leave': return 0.02 + trafficAt(w, l, t) * 0.4
    case 'hide': return (0.003 + trafficAt(w, l, t) * 0.03) * (days > (weatherOn(w, t).kind === 'heat' ? 2 : 4) ? 3 : 1) // the smell, sooner in a heatwave
    case 'dump': return dumpsterCollected(v, t) ? 0.0002 : 0.01
    case 'bury': return (v.concealment > 0.6 ? 0.0006 : 0.006) * (1 + days * 0.05) * (l.traffic[h] > 0.05 ? 2 : 1)
    case 'sink': return v.concealment > 0.8 ? 0.0004 : days < 2.5 ? 0.001 : 0.05 // bodies float
    case 'cleaned': return 0.000005
    case 'foundation': {
      if (sealed(w, v, t)) return 0.00002
      const working = dowOf(t) < 5 && h >= 7 && h < 15
      return working ? 0.012 : 0.0005
    }
  }
}

const FIND_TEXT: Record<Victim['disposal'], string[]> = {
  leave: ['a passer-by found the body', 'a delivery driver spotted the body'],
  hide: ['a security guard noticed a smell', 'teenagers exploring the building found the body'],
  dump: ['a sanitation worker found the body in a dumpster'],
  bury: ['a dog walker’s dog dug up remains', 'hikers noticed disturbed soil'],
  sink: ['the body surfaced and was spotted by a fisherman', 'kayakers found the body near the shore'],
  foundation: ['construction workers noticed the disturbed ground', 'a site inspector found remains'],
  cleaned: ['remains turned up somewhere nobody could explain'],
}

export function processBodies(w: World, t: number) {
  const h = hourOf(t)
  for (const v of w.victims) {
    const p = person(w, v.personId)

    // Missing-person pressure from people around the victim.
    if (!v.reportedAt && !v.foundAt) {
      if (h >= 22 || h < 2) for (const m of housemates(w, p)) v.worry[m.id] = (v.worry[m.id] ?? 0) + 0.12
      // Parents notice a missing child within hours, any time of day.
      if (p.age < 16 && (p.age < 6 || h >= 16 || h < 7)) for (const m of housemates(w, p)) v.worry[m.id] = (v.worry[m.id] ?? 0) + 0.55
      if (p.shift && p.workplaceId && h === Math.floor(p.shift.start) && p.shift.days.includes(dowOf(t))) {
        // Missed a shift: the boss notices.
        const boss = p.relations.find((r) => r.type === 'boss')
        if (boss) v.worry[boss.personId] = (v.worry[boss.personId] ?? 0) + 0.4
      }
      const [reporter, worry] = Object.entries(v.worry).sort((a, b) => b[1] - a[1])[0] ?? []
      if (reporter && worry >= 1 && person(w, reporter).alive) fileMissingReport(w, v, reporter)
      else if (t - v.killedAt > 12 * DAY) fileMissingReport(w, v, undefined) // landlord, unpaid rent
    }

    if (!v.foundAt && chance(w.rng, hourlyDiscovery(w, v, t))) {
      const finders = peopleAt(w, v.bodyLocationId, t)
      const finder = finders.length ? `${fullName(pick(w.rng, finders))} — ${pick(w.rng, FIND_TEXT[v.disposal])}` : pick(w.rng, FIND_TEXT[v.disposal])
      bodyFound(w, v, `${finder} at ${loc(w, v.bodyLocationId).name}`)
    }
  }
}
