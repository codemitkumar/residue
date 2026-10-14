import type { Minute } from './types'

export const HOUR = 60
export const DAY = 1440
export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const dayOf = (t: Minute) => Math.floor(t / DAY)
export const hourOf = (t: Minute) => Math.floor((t % DAY) / HOUR)
export const dowOf = (t: Minute) => dayOf(t) % 7
/** A year is four 28-day seasons. Day 0 is the first day of autumn. */
export const SEASON_DAYS = 28
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const
export type Season = (typeof SEASONS)[number]
export const seasonOf = (t: Minute): Season => SEASONS[(2 + Math.floor(dayOf(t) / SEASON_DAYS)) % 4]
export const dayOfSeason = (t: Minute) => (dayOf(t) % SEASON_DAYS) + 1
/** Dark from dusk to dawn, which depends on the season. */
export const DARK_HOURS: Record<Season, [number, number]> = { Spring: [20, 6], Summer: [22, 5], Autumn: [19, 7], Winter: [17, 8] }
export const isNight = (t: Minute) => {
  const h = hourOf(t)
  const [dusk, dawn] = DARK_HOURS[seasonOf(t)]
  return h >= dusk || h < dawn
}

const pad = (n: number) => String(n).padStart(2, '0')

export const fmtClock = (t: Minute) => `${pad(hourOf(t))}:${pad(Math.floor(t % HOUR))}`
export const fmtDay = (t: Minute) => `Day ${dayOf(t) + 1} (${DOW[dowOf(t)]})`
export const fmtTime = (t: Minute) => `${fmtDay(t)} ${fmtClock(t)}`

export function fmtDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  if (min < DAY) return `${Math.round(min / 60)}h`
  return `${Math.round(min / DAY)}d`
}

export function fmtAgo(now: Minute, t: Minute): string {
  return `${fmtDuration(now - t)} ago`
}

/** Next time (>= now) that the clock reads `hour`:00. */
export function nextOccurrence(now: Minute, hour: number): Minute {
  const base = dayOf(now) * DAY + hour * HOUR
  return base >= now ? base : base + DAY
}

/** True if time t falls in a recurring block. Blocks may run past midnight (end > 24). */
export function inBlock(t: Minute, block: { start: number; end: number; days: number[] }): boolean {
  const d = dayOf(t)
  const h = (t % DAY) / HOUR
  if (block.days.includes(d % 7) && h >= block.start && h < Math.min(block.end, 24)) return true
  if (block.end > 24 && block.days.includes((d + 6) % 7) && h < block.end - 24) return true
  return false
}

export const fmtHourRange = (start: number, end: number) => `${pad(start % 24)}:00–${pad(end % 24)}:00`
export const fmtDays = (days: number[]) =>
  days.length === 7 ? 'daily' : days.length === 5 && !days.includes(5) && !days.includes(6) ? 'Mon–Fri' : days.map((d) => DOW[d]).join(', ')
