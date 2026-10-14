// Weather, seasons and the city's calendar of events — and how they bend everything else.
import { chance, int, next, pick } from './rng'
import type { EventKind, Location, Minute, Weather, WeatherKind, World } from './types'
import { DAY, SEASON_DAYS, dayOf, fmtDay, hourOf, isNight, seasonOf, type Season } from './time'
import { addNews, districtName, loc, uid } from './world'
import { isOpen } from './geo'

export const OUTDOOR = new Set(['park', 'lake', 'forest', 'alley', 'construction', 'parking'])
const isOutdoor = (l: Location) => OUTDOOR.has(l.kind)

// ---------------------------------------------------------------- weather

const CLIMATE: Record<Season, [WeatherKind, number][]> = {
  Spring: [['clear', 3], ['cloudy', 3], ['rain', 3], ['storm', 1], ['fog', 1]],
  Summer: [['clear', 5], ['heat', 3], ['cloudy', 1], ['storm', 1]],
  Autumn: [['cloudy', 3], ['rain', 4], ['fog', 3], ['storm', 1], ['clear', 2]],
  Winter: [['snow', 4], ['cloudy', 3], ['fog', 2], ['clear', 2], ['rain', 1]],
}
const TEMP: Record<Season, [number, number]> = { Spring: [8, 18], Summer: [20, 34], Autumn: [5, 15], Winter: [-8, 4] }

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', storm: 'Thunderstorm', fog: 'Fog', snow: 'Snow', heat: 'Heatwave',
}
export const WEATHER_ICON: Record<WeatherKind, string> = { clear: '☀', cloudy: '☁', rain: '🌧', storm: '⛈', fog: '🌫', snow: '❄', heat: '🔥' }

function rollWeather(w: World, day: number): Weather {
  const season = seasonOf(day * DAY)
  const table = CLIMATE[season]
  let roll = next(w.rng) * table.reduce((a, [, n]) => a + n, 0)
  let kind: WeatherKind = table[0][0]
  for (const [k, n] of table) if ((roll -= n) < 0) { kind = k; break }
  const [lo, hi] = TEMP[season]
  const temp = kind === 'heat' ? hi + int(w.rng, 0, 4) : kind === 'snow' ? Math.min(lo + int(w.rng, 0, 6), 0) : int(w.rng, lo, hi)
  return { day, kind, temp }
}

export function weatherOn(w: World, t: Minute): Weather {
  const d = dayOf(t)
  return w.weather?.find((x) => x.day === d) ?? { day: d, kind: 'cloudy', temp: 10 }
}

// ---------------------------------------------------------------- events

/** Fixed yearly events by season day, plus the odd concert or street fair. */
const YEARLY: { season: Season; day: number; kind: EventKind; name: string }[] = [
  { season: 'Autumn', day: 12, kind: 'masks', name: 'Night of Masks' },
  { season: 'Autumn', day: 24, kind: 'holiday', name: 'Harvest Day' },
  { season: 'Winter', day: 6, kind: 'holiday', name: 'Midwinter' },
  { season: 'Winter', day: 28, kind: 'fireworks', name: 'New Year’s Eve' },
  { season: 'Spring', day: 1, kind: 'holiday', name: 'New Year’s Day' },
  { season: 'Spring', day: 14, kind: 'festival', name: 'Founders’ Fair' },
  { season: 'Summer', day: 7, kind: 'marathon', name: 'City Marathon' },
  { season: 'Summer', day: 20, kind: 'festival', name: 'Summer Street Festival' },
]

export function ensureEvents(w: World) {
  const events = (w.events ??= [])
  const today = dayOf(w.time)
  for (let d = today; d < today + SEASON_DAYS; d++) {
    const t = d * DAY
    for (const y of YEARLY) {
      if (seasonOf(t) !== y.season || (d % SEASON_DAYS) + 1 !== y.day || events.some((e) => e.day === d && e.name === y.name)) continue
      const districtId = y.kind === 'festival' || y.kind === 'marathon' ? pick(w.rng, w.districts).id : undefined
      events.push({ id: uid(w, 'ev'), kind: y.kind, name: y.name, day: d, districtId })
    }
  }
  // Random concerts in the park, decided a couple of weeks ahead.
  const horizon = today + 14
  if (!events.some((e) => e.kind === 'concert' && e.day >= horizon - 12) && chance(w.rng, 0.15)) {
    const park = pick(w.rng, w.locations.filter((l) => l.kind === 'park'))
    events.push({ id: uid(w, 'ev'), kind: 'concert', name: `Open-air concert at ${park.name}`, day: horizon - int(w.rng, 0, 6), locationId: park.id, districtId: park.districtId })
  }
  w.events = events.filter((e) => e.day >= today - 1)
}

export const eventsOn = (w: World, t: Minute) => (w.events ?? []).filter((e) => e.day === dayOf(t) || (e.kind === 'fireworks' && e.day === dayOf(t) - 1 && hourOf(t) < 3))
export const isHoliday = (w: World, t: Minute) => eventsOn(w, t).some((e) => e.kind === 'holiday')

/** Shops, offices and factories close for public holidays. */
const HOLIDAY_CLOSED = new Set(['grocery', 'pharmacy', 'hardware', 'office', 'factory', 'warehouse', 'construction', 'school'])
export function isOpenAt(w: World, l: Location, t: Minute): boolean {
  if (isHoliday(w, t) && HOLIDAY_CLOSED.has(l.kind)) return false
  return isOpen(l.kind, t)
}
export const workplaceClosed = (w: World, l: Location, t: Minute) => isHoliday(w, t) && HOLIDAY_CLOSED.has(l.kind)

// ---------------------------------------------------------------- effects

/** How busy a place is right now: base foot traffic bent by weather and events. */
export function trafficAt(w: World, l: Location, t: Minute): number {
  let v = l.traffic[hourOf(t)]
  const wx = weatherOn(w, t).kind
  if (isOutdoor(l)) v *= { clear: 1.15, cloudy: 1, rain: 0.5, storm: 0.2, fog: 0.8, snow: 0.4, heat: 0.75 }[wx]
  else if ((l.kind === 'bar' || l.kind === 'restaurant') && (wx === 'rain' || wx === 'storm' || wx === 'snow')) v *= 1.25
  for (const e of eventsOn(w, t)) {
    if (e.kind === 'holiday') v *= HOLIDAY_CLOSED.has(l.kind) ? 0.1 : isOutdoor(l) || l.kind === 'bar' ? 1.4 : 1
    if ((e.kind === 'festival' || e.kind === 'marathon') && e.districtId === l.districtId && (isOutdoor(l) || l.kind === 'bar' || l.kind === 'restaurant')) v *= e.kind === 'festival' ? 2.2 : 1.6
    if (e.kind === 'concert' && e.locationId === l.id && hourOf(t) >= 18 && hourOf(t) < 23) v = Math.max(v, 0.9)
    if (e.kind === 'masks' && hourOf(t) >= 18 && l.kind === 'bar') v *= 1.5
  }
  return Math.min(1, v)
}

/** How likely a bystander is to notice something. */
export function noticeMult(w: World, l: Location, t: Minute): number {
  let m = 1
  const wx = weatherOn(w, t).kind
  if (isOutdoor(l)) m *= { clear: 1, cloudy: 1, rain: 0.8, storm: 0.55, fog: 0.5, snow: 0.85, heat: 1 }[wx]
  for (const e of eventsOn(w, t)) {
    if (e.kind === 'fireworks' && (isNight(t) || hourOf(t) < 3)) m *= 0.55 // nobody hears a thing
    if (e.kind === 'festival' && e.districtId === l.districtId) m *= 0.85
  }
  return m
}

/** Fog and storms ruin footage. */
export function cameraMult(w: World, l: Location, t: Minute): number {
  const wx = weatherOn(w, t).kind
  if (!isOutdoor(l) && l.kind !== 'parking') return 1
  return wx === 'fog' ? 0.55 : wx === 'storm' ? 0.7 : wx === 'snow' ? 0.85 : 1
}

/** On mask night, a covered face is just a costume. */
export const masksNormal = (w: World, t: Minute) => eventsOn(w, t).some((e) => e.kind === 'masks') && hourOf(t) >= 17

/** Extra travel minutes from weather and closed roads. */
export function travelExtra(w: World, toDistrictId: string, t: Minute, minutes: number): number {
  const wx = weatherOn(w, t).kind
  let extra = wx === 'snow' ? minutes * 0.5 : wx === 'storm' ? minutes * 0.3 : 0
  if (eventsOn(w, t).some((e) => e.kind === 'marathon' && e.districtId === toDistrictId && hourOf(t) >= 7 && hourOf(t) < 15)) extra += 20
  return Math.round(extra / 5) * 5
}

// ---------------------------------------------------------------- hourly

export function processEnvironment(w: World, t: Minute) {
  const d = dayOf(t)
  if (hourOf(t) === 0 || !w.weather?.length) {
    w.weather = (w.weather ?? []).filter((x) => x.day >= d)
    for (let k = d; k <= d + 3; k++) if (!w.weather.some((x) => x.day === k)) w.weather.push(rollWeather(w, k))
    w.weather.sort((a, b) => a.day - b.day)
    ensureEvents(w)
    for (const e of w.events ?? []) {
      const where = e.districtId ? ` in ${districtName(w, e.districtId)}` : ''
      if (e.day === d + 3) addNews(w, 'news', `Coming up: ${e.name}`, `${e.name}${where} on ${fmtDay(e.day * DAY)}.${e.kind === 'holiday' ? ' Shops and most offices will be closed.' : e.kind === 'marathon' ? ' Expect road closures.' : ''}`)
      if (e.day === d) addNews(w, 'news', `Today: ${e.name}`, e.kind === 'festival' ? `Crowds expected${where}.` : e.kind === 'masks' ? 'Costumes and masks all over town tonight.' : e.kind === 'fireworks' ? 'Fireworks from 10pm until late.' : `${e.name}${where}.`)
    }
    const wx = weatherOn(w, t)
    if (wx.kind === 'storm' || wx.kind === 'snow' || wx.kind === 'heat' || wx.kind === 'fog') addNews(w, 'news', `Weather: ${WEATHER_LABEL[wx.kind]}`, `${wx.temp}°C. ${wx.kind === 'snow' ? 'Roads slow.' : wx.kind === 'storm' ? 'Stay indoors if you can.' : wx.kind === 'fog' ? 'Visibility very poor.' : 'Stay hydrated.'}`)
  }
  // Rain washes away what an outdoor scene left behind.
  const wx = weatherOn(w, t).kind
  if (wx === 'rain' || wx === 'storm') {
    for (const v of w.victims) {
      if (v.foundAt || t - v.killedAt > DAY || !isOutdoor(loc(w, v.bodyLocationId))) continue
      w.evidence = w.evidence.filter((e) => !(e.victimId === v.personId && !e.discovered && (e.kind === 'fingerprint' || e.kind === 'dna' || e.kind === 'footprint') && chance(w.rng, wx === 'storm' ? 0.3 : 0.15)))
    }
  }
}

