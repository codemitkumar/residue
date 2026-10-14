import { chance, hashSeed, int, next, pick, shuffle, type RngState } from './rng'
import { seedFamilies } from './population'
import * as N from './names'
import type { Camera, District, Habit, Location, LocationKind, Person, RelationType, Shift, Trait, World } from './types'
import { DAY, HOUR } from './time'
import { generateCalls } from './calls'
import { initKnown } from './world'
import { refreshListings } from './jobs'
import { newCar } from './car'
import { processEnvironment } from './environment'

const WEEKDAYS = [0, 1, 2, 3, 4]

/** How many of each non-residential location the city gets. */
const CITY_MIX: [LocationKind, number][] = [
  ['office', 3], ['factory', 2], ['bar', 3], ['restaurant', 3], ['hardware', 2], ['pharmacy', 2], ['grocery', 2],
  ['gym', 1], ['hospital', 1], ['park', 2], ['construction', 2], ['lake', 2], ['forest', 2], ['warehouse', 2],
  ['alley', 3], ['parking', 2], ['police', 1], ['gas', 2], ['storage', 1],
]

/** Typical foot traffic by hour for each kind of place. */
function trafficProfile(r: RngState, kind: LocationKind): number[] {
  const out: number[] = []
  for (let h = 0; h < 24; h++) {
    let v: number
    const day = h >= 7 && h < 19
    const evening = h >= 18 && h < 24
    switch (kind) {
      case 'bar': v = evening || h < 2 ? 0.7 : h >= 12 ? 0.2 : 0.02; break
      case 'restaurant': v = (h >= 11 && h < 14) || (h >= 18 && h < 22) ? 0.6 : h >= 10 && h < 23 ? 0.25 : 0.01; break
      case 'office': v = h >= 8 && h < 18 ? 0.6 : 0.03; break
      case 'factory': v = h >= 6 && h < 22 ? 0.4 : 0.05; break
      case 'hospital': case 'police': v = day ? 0.7 : 0.35; break
      case 'park': v = (h >= 7 && h < 9) || (h >= 16 && h < 20) ? 0.5 : day ? 0.3 : 0.04; break
      case 'construction': v = h >= 7 && h < 15 ? 0.5 : 0.02; break
      case 'lake': v = day ? 0.15 : 0.02; break
      case 'forest': v = day ? 0.1 : 0.01; break
      case 'warehouse': v = h >= 6 && h < 14 ? 0.3 : 0.03; break
      case 'alley': v = evening ? 0.15 : day ? 0.1 : 0.04; break
      case 'parking': v = day ? 0.4 : 0.08; break
      case 'house': case 'apartment': v = h >= 7 && h < 23 ? 0.25 : 0.05; break
      default: v = h >= 8 && h < 21 ? 0.5 : 0.02 // shops, gym
    }
    out.push(Math.max(0, Math.min(1, v * (0.75 + next(r) * 0.5))))
  }
  return out
}

const CAMERA_RANGE: Partial<Record<LocationKind, [number, number]>> = {
  office: [2, 3], factory: [1, 2], bar: [1, 3], restaurant: [1, 2], hardware: [2, 3], pharmacy: [2, 3], grocery: [2, 3],
  gym: [1, 2], hospital: [2, 3], police: [2, 3], parking: [1, 2], apartment: [0, 1], warehouse: [0, 1], alley: [0, 1],
  park: [0, 1], construction: [0, 1], gas: [1, 2], storage: [1, 2],
}

const LIGHTING: Partial<Record<LocationKind, number>> = {
  forest: 0.02, lake: 0.08, alley: 0.25, construction: 0.3, warehouse: 0.3, park: 0.35, parking: 0.6,
}

function makeCameras(w: World, kind: LocationKind): Camera[] {
  const r = w.rng
  const [min, max] = CAMERA_RANGE[kind] ?? [0, 0]
  let n = int(r, min, max)
  if (kind === 'house' && chance(r, 0.25)) n = 1 // doorbell cam
  if ((kind === 'forest' || kind === 'lake') && chance(r, 0.2)) n = 1 // trail cam
  const cams: Camera[] = []
  for (let i = 0; i < n; i++) {
    const hidden = kind === 'forest' || kind === 'lake' || chance(r, 0.2)
    cams.push({ id: `cam${++w.counter}`, coverage: 0.45 + next(r) * 0.45, hidden, retentionDays: pick(r, [3, 5, 7, 7, 14, 30]) })
  }
  return cams
}

function locationName(r: RngState, kind: LocationKind, used: Set<string>): string {
  const pool: Partial<Record<LocationKind, string[]>> = {
    bar: N.BAR_NAMES, restaurant: N.RESTAURANT_NAMES, office: N.COMPANY_NAMES, factory: N.FACTORY_NAMES,
    park: N.PARK_NAMES, lake: N.LAKE_NAMES, forest: N.FOREST_NAMES,
  }
  for (let tries = 0; tries < 20; tries++) {
    const street = pick(r, N.STREETS)
    let name: string
    const named = pool[kind]
    if (named) name = pick(r, named)
    else if (kind === 'house') name = `${int(r, 2, 220)} ${street}`
    else if (kind === 'apartment') name = `${street.split(' ')[0]} Court Apartments`
    else if (kind === 'construction') name = `Construction site, ${street}`
    else if (kind === 'alley') name = `Alley behind ${street}`
    else if (kind === 'parking') name = `${street.split(' ')[0]} St Parking Garage`
    else if (kind === 'warehouse') name = `Warehouse, ${street}`
    else if (kind === 'hardware') name = `${pick(r, ['Ace', 'Handy', 'Foster'])} Hardware`
    else if (kind === 'pharmacy') name = `${pick(r, ['CityCare', 'Medix', 'Corner'])} Pharmacy`
    else if (kind === 'grocery') name = `${pick(r, ['FreshMart', 'ValuFoods', 'QuickStop'])}`
    else if (kind === 'gym') name = 'IronWorks Gym'
    else if (kind === 'storage') name = `SafeKeep Self Storage, ${street}`
    else if (kind === 'gas') name = `${pick(r, ['QuickGas', 'Metro Fuel', 'Fuel Stop', 'Northway Gas'])}, ${street}`
    else if (kind === 'hospital') name = 'St. Agnes Hospital'
    else name = 'Central Police Station'
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  return `${kind} ${int(r, 100, 999)}`
}

export interface JobTemplate {
  titles: string[]
  shift: (r: RngState) => Shift
  /** Pay per shift for NPCs; the player's weekly salary is derived from it. */
  pay: [number, number]
}

export const randomDays = (r: RngState, n: number) => shuffle(r, [0, 1, 2, 3, 4, 5, 6]).slice(0, n).sort()

export const JOBS: Partial<Record<LocationKind, JobTemplate>> = {
  office: { titles: ['Analyst', 'Accountant', 'Office Clerk', 'Sales Rep', 'Developer'], shift: () => ({ start: 9, end: 17, days: WEEKDAYS }), pay: [140, 220] },
  factory: { titles: ['Machine Operator', 'Line Worker', 'Technician'], shift: (r) => (chance(r, 0.5) ? { start: 6, end: 14, days: WEEKDAYS } : { start: 14, end: 22, days: WEEKDAYS }), pay: [110, 150] },
  bar: { titles: ['Bartender', 'Bouncer'], shift: (r) => ({ start: 18, end: 26, days: randomDays(r, 4) }), pay: [90, 130] },
  restaurant: { titles: ['Cook', 'Server', 'Dishwasher'], shift: (r) => ({ start: 11, end: 21, days: randomDays(r, 5) }), pay: [80, 120] },
  hardware: { titles: ['Store Clerk'], shift: (r) => ({ start: 8, end: 16, days: randomDays(r, 5) }), pay: [90, 110] },
  pharmacy: { titles: ['Pharmacist', 'Cashier'], shift: (r) => ({ start: 8, end: 16, days: randomDays(r, 5) }), pay: [100, 200] },
  grocery: { titles: ['Cashier', 'Stocker'], shift: (r) => (chance(r, 0.5) ? { start: 7, end: 15, days: randomDays(r, 5) } : { start: 15, end: 23, days: randomDays(r, 5) }), pay: [80, 100] },
  gym: { titles: ['Personal Trainer'], shift: (r) => ({ start: 6, end: 14, days: randomDays(r, 5) }), pay: [100, 140] },
  hospital: { titles: ['Nurse', 'Orderly', 'Doctor'], shift: (r) => (chance(r, 0.6) ? { start: 7, end: 19, days: randomDays(r, 4) } : { start: 19, end: 31, days: randomDays(r, 4) }), pay: [130, 300] },
  construction: { titles: ['Construction Worker', 'Site Foreman'], shift: () => ({ start: 7, end: 15, days: WEEKDAYS }), pay: [120, 170] },
  warehouse: { titles: ['Night Guard'], shift: (r) => ({ start: 22, end: 30, days: randomDays(r, 5) }), pay: [100, 120] },
}

const TRAITS: Trait[] = ['night_owl', 'loner', 'social', 'fit', 'paranoid', 'nosy']

export function generateWorld(seed: string): World {
  const r: RngState = { s: hashSeed(seed) }
  const w: World = {
    version: 1, seed, rng: r, cityName: `${pick(r, N.CITY_PREFIX)}${pick(r, N.CITY_SUFFIX)}`,
    time: 0, districts: [], locations: [], people: [], calls: [], evidence: [], victims: [], cases: [], news: [], counter: 0,
    player: {
      personId: '', money: 900, inventory: {}, tainted: {}, agenda: [], missedShifts: 0, employed: false,
      questioned: false, searched: false, samplesOnFile: false, carTraces: [], food: 3, urge: 0.2, shifts: {}, locIntel: {}, personIntel: {}, known: {}, messages: [],
    },
  }

  // Districts
  const dNames = shuffle(r, [...N.DISTRICT_NAMES]).slice(0, int(r, 4, 6))
  w.districts = dNames.map((name, i): District => ({ id: `d${i}`, name }))

  // Locations
  const used = new Set<string>()
  const addLoc = (kind: LocationKind, districtId: string) => {
    const l: Location = {
      id: `l${++w.counter}`, name: locationName(r, kind, used), kind, districtId, cameras: makeCameras(w, kind),
      traffic: trafficProfile(r, kind), lighting: LIGHTING[kind] ?? 0.7 + next(r) * 0.3,
      guard: (kind === 'warehouse' || kind === 'construction' || kind === 'office') && chance(r, 0.3),
    }
    if (kind === 'construction') l.pourDay = int(r, 5, 20)
    w.locations.push(l)
    return l
  }
  for (const [kind, n] of CITY_MIX) for (let i = 0; i < n; i++) addLoc(kind, pick(r, w.districts).id)
  const homes: Location[] = []
  for (const d of w.districts) {
    for (let i = 0, n = int(r, 3, 5); i < n; i++) homes.push(addLoc('house', d.id))
    for (let i = 0, n = int(r, 1, 2); i < n; i++) homes.push(addLoc('apartment', d.id))
  }

  // Workplaces with open positions
  const slots: { loc: Location; tpl: JobTemplate }[] = []
  for (const l of w.locations) {
    const tpl = JOBS[l.kind]
    if (!tpl) continue
    const n = l.kind === 'office' || l.kind === 'factory' || l.kind === 'hospital' ? int(r, 4, 7) : int(r, 1, 3)
    for (let i = 0; i < n; i++) slots.push({ loc: l, tpl })
  }
  shuffle(r, slots)

  const rollGender = (): Person['gender'] => { const x = next(r); return x < 0.48 ? 'male' : x < 0.96 ? 'female' : 'nonbinary' }
  const makePerson = (homeId: string, last: string, age: number, gender = rollGender()): Person => ({
    id: `p${++w.counter}`, gender, first: N.nameFor(gender, next(r)), last, age, job: 'Unemployed', pay: 0, homeId,
    phone: `555-${int(r, 1000, 9999)}`, traits: shuffle(r, [...TRAITS]).slice(0, int(r, 0, 2)), relations: [],
    alive: true, isPlayer: false,
  })
  const relate = (a: Person, b: Person, type: RelationType, closeness: number, back: RelationType = type) => {
    if (a.id === b.id || a.relations.some((x) => x.personId === b.id)) return
    a.relations.push({ personId: b.id, type, closeness })
    b.relations.push({ personId: a.id, type: back, closeness })
  }

  // Households
  for (const home of homes) {
    const households = home.kind === 'apartment' ? int(r, 3, 5) : 1
    for (let h = 0; h < households; h++) {
      const last = pick(r, N.LAST_NAMES)
      const roll = next(r)
      const size = roll < 0.35 ? 1 : roll < 0.7 ? 2 : int(r, 3, 4)
      const members: Person[] = []
      const a = makePerson(home.id, last, int(r, 22, 68))
      members.push(a)
      if (size >= 2) {
        const partnerGender = a.gender === 'nonbinary' || chance(r, 0.12) ? rollGender() : a.gender === 'male' ? 'female' : 'male'
        const b = makePerson(home.id, chance(r, 0.6) ? last : pick(r, N.LAST_NAMES), Math.max(20, a.age + int(r, -6, 6)), partnerGender)
        relate(a, b, 'partner', 0.8 + next(r) * 0.2)
        members.push(b)
      }
      for (let k = 2; k < size; k++) {
        const c = makePerson(home.id, last, int(r, 18, 26))
        for (const m of members) relate(c, m, 'family', 0.7 + next(r) * 0.3)
        members.push(c)
      }
      w.people.push(...members)
    }
  }

  // The player: lives alone in an apartment, between jobs. Finding one is up to them.
  const playerHome = pick(r, homes.filter((h) => h.kind === 'apartment'))
  const player = makePerson(playerHome.id, pick(r, N.LAST_NAMES), int(r, 28, 42))
  player.isPlayer = true
  player.traits = []
  w.people.push(player)
  w.player.personId = player.id
  w.player.employed = false
  w.player.money = 900

  // Jobs for everyone else
  const workers = shuffle(r, w.people.filter((p) => !p.isPlayer && p.age < 66))
  const bossOf = new Map<string, Person>()
  for (const p of workers) {
    if (chance(r, 0.12)) continue // unemployed / student
    if (!slots.length) break
    const { loc: l, tpl } = slots.splice(0, 1)[0]
    p.workplaceId = l.id
    p.job = pick(r, tpl.titles)
    p.shift = tpl.shift(r)
    p.pay = int(r, tpl.pay[0], tpl.pay[1])
    const boss = bossOf.get(l.id)
    if (!boss) bossOf.set(l.id, p)
    else relate(p, boss, 'boss', 0.35, 'coworker')
    for (const o of w.people) if (o !== p && o !== boss && o.workplaceId === l.id && chance(r, 0.5)) relate(p, o, 'coworker', 0.2 + next(r) * 0.3)
  }
  for (const p of w.people) if (p.job === 'Unemployed' && p.age >= 66) p.job = 'Retired'
  for (const p of w.people) {
    p.cash = int(r, 0, 60) + (chance(r, 0.3) ? int(r, 50, 400) : 0)
    p.savings = Math.round((p.pay || 40) * int(r, 3, 60) * (1 + p.age / 60))
  }

  // Friends and out-of-house family
  for (const p of w.people) {
    const loner = p.traits.includes('loner')
    const n = loner ? int(r, 0, 1) : p.traits.includes('social') ? int(r, 3, 5) : int(r, 1, 3)
    for (let i = 0; i < n; i++) relate(p, pick(r, w.people), 'friend', 0.3 + next(r) * 0.5)
    if (chance(r, 0.3)) {
      const other = pick(r, w.people)
      if (other.homeId !== p.homeId) relate(p, other, 'family', 0.5 + next(r) * 0.4)
    }
  }

  // Habits: regular places people go outside work
  const byKind = (k: LocationKind) => w.locations.filter((l) => l.kind === k)
  for (const p of w.people) {
    if (p.isPlayer || chance(r, 0.3)) continue
    let habit: Habit
    const roll = next(r)
    if (roll < 0.35 || p.traits.includes('night_owl')) habit = { locationId: pick(r, byKind('bar')).id, start: int(r, 20, 22), end: int(r, 24, 26), days: randomDays(r, int(r, 2, 4)) }
    else if (roll < 0.55) habit = { locationId: pick(r, byKind('gym')).id, start: pick(r, [6, 18, 19]), end: 0, days: randomDays(r, 3) }
    else if (roll < 0.8) habit = { locationId: pick(r, [...byKind('park'), ...byKind('lake')]).id, start: pick(r, [6, 7, 17, 18, 21]), end: 0, days: randomDays(r, int(r, 3, 6)) }
    else habit = { locationId: pick(r, byKind('restaurant')).id, start: 19, end: 21, days: randomDays(r, 2) }
    if (habit.end === 0) habit.end = habit.start + (chance(r, 0.5) ? 1 : 2)
    p.habit = habit
  }

  // Start on Day 4 morning, with three days of phone history already on record.
  for (let t = 0; t < 3 * DAY + 8 * HOUR; t += HOUR) {
    w.time = t
    generateCalls(w, t)
  }
  w.time = 3 * DAY + 8 * HOUR
  seedFamilies(w)
  initKnown(w)
  refreshListings(w)
  newCar(w)
  Object.assign(w.player, { credit: 650, autopay: true, bills: [], loans: [] })
  processEnvironment(w, w.time)
  w.news.push({
    id: `n${++w.counter}`, time: w.time, kind: 'system', headline: `Welcome to ${w.cityName}`,
    body: `${w.people.length - 1} residents, ${w.locations.length} places. Nobody knows what you are. Keep it that way.`,
  })
  return w
}
