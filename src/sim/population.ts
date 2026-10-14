// The city lives on: couples have children, children grow up and go to school.
import { chance, hashSeed, int, next, pick, type RngState } from './rng'
import type { Location, Minute, Person, World } from './types'
import { DAY, HOUR, SEASON_DAYS, hourOf } from './time'
import * as N from './names'
import { addNews, fullName, housemates, loc, meet, person, playerPerson } from './world'
import { send } from './messages'

/** One year: four seasons. */
export const YEAR = 4 * SEASON_DAYS * DAY
export const CHILD_AGE = 16
export const isChild = (p: Person) => p.age < CHILD_AGE

const SCHOOL_HOURS = { start: 8, end: 15, days: [1, 2, 3, 4, 5] }
const PREGNANCY = 21 * DAY

export const schools = (w: World) => w.locations.filter((l) => l.kind === 'school')

/** Job label and routine for a child of a given age. */
function growUp(w: World, p: Person) {
  if (p.age < 3) p.job = 'Baby'
  else if (p.age < 5) p.job = 'Toddler'
  else p.job = p.age < 11 ? 'Primary school pupil' : 'High school student'
  const school = schools(w)
  if (p.age >= 5 && school.length) {
    // The school nearest home, by district.
    const near = school.find((s) => s.districtId === loc(w, p.homeId).districtId) ?? school[0]
    p.workplaceId = near.id
    p.shift = { ...SCHOOL_HOURS, days: [...SCHOOL_HOURS.days] }
  }
  // Teenagers get a phone, and a park to hang around in after school.
  if (p.age >= 12 && p.phone === '—') p.phone = `555-${int(w.rng, 1000, 9999)}`
}

function makeChild(w: World, r: RngState, parents: Person[], bornAt: Minute): Person {
  const roll = next(r)
  const gender: Person['gender'] = roll < 0.49 ? 'male' : roll < 0.98 ? 'female' : 'nonbinary'
  const age = Math.max(0, Math.floor((w.time - bornAt) / YEAR))
  const kid: Person = {
    id: `p${++w.counter}`, gender, first: N.nameFor(gender, next(r)), last: parents[0].last, age, job: 'Baby', pay: 0,
    homeId: parents[0].homeId, phone: '—', traits: [], relations: [], alive: true, isPlayer: false, bornAt,
    // Pocket money, and a piggy bank.
    cash: age < 6 ? 0 : int(r, 0, 15), savings: age < 6 ? 0 : int(r, 0, 120),
  }
  for (const parent of parents) {
    parent.relations.push({ personId: kid.id, type: 'family', closeness: 1 })
    kid.relations.push({ personId: parent.id, type: 'family', closeness: 1 })
  }
  w.people.push(kid)
  growUp(w, kid)
  if (age >= 9 && chance(r, 0.4)) {
    const parks = w.locations.filter((l) => l.kind === 'park')
    if (parks.length) kid.habit = { locationId: pick(r, parks).id, start: 15.5, end: 18, days: [1, 3, 5, 6] }
  }
  return kid
}

/** Couples living together who could have a child. */
function couples(w: World): [Person, Person][] {
  const out: [Person, Person][] = []
  for (const a of w.people) {
    if (!a.alive || a.isPlayer || a.age < 20 || a.age > 45) continue
    const rel = a.relations.find((r) => r.type === 'partner')
    if (!rel) continue
    const b = person(w, rel.personId)
    if (!b.alive || b.isPlayer || b.homeId !== a.homeId || a.id > b.id || b.age < 20 || b.age > 50) continue
    out.push([a, b])
  }
  return out
}

const kidsOf = (w: World, p: Person) => p.relations.filter((r) => r.type === 'family').map((r) => person(w, r.personId)).filter((k) => k.bornAt !== undefined && k.alive && k.homeId === p.homeId)

function buildSchools(w: World, r: RngState) {
  const homeDistricts = [...new Set(w.locations.filter((l) => l.kind === 'house' || l.kind === 'apartment').map((l) => l.districtId))]
  const n = Math.min(2, homeDistricts.length)
  const traffic = Array.from({ length: 24 }, (_, h) => (h === 8 || h === 15 ? 0.9 : h > 8 && h < 15 ? 0.5 : h >= 7 && h < 17 ? 0.25 : 0.01))
  for (let i = 0; i < n; i++) {
    const school: Location = {
      id: `l${++w.counter}`, name: `${pick(r, N.STREETS).split(' ')[0]} ${i === 0 ? 'Elementary School' : 'High School'}`, kind: 'school',
      districtId: homeDistricts[Math.floor(next(r) * homeDistricts.length)], lighting: 0.6, guard: chance(r, 0.5), traffic,
      cameras: Array.from({ length: int(r, 2, 4) }, () => ({ id: `cam${++w.counter}`, coverage: 0.6 + next(r) * 0.3, hidden: chance(r, 0.3), retentionDays: 14 })),
    }
    w.locations.push(school)
  }
}

/**
 * Give the city its children: schools, and kids for some of the couples.
 * Uses its own RNG so it doesn't reshuffle the rest of the world. Runs once per world (new or old save).
 */
export function seedFamilies(w: World) {
  if (w.families) return
  w.families = true
  const r: RngState = { s: hashSeed(`${w.seed}:families`) }
  if (!schools(w).length) buildSchools(w, r)
  // Babies already in the world (the player's own child) get a birthday.
  for (const p of w.people) if (p.job === 'Baby' && p.bornAt === undefined) p.bornAt = w.time - int(r, 0, 20) * DAY
  for (const [a, b] of couples(w)) {
    if (!chance(r, 0.6)) continue
    const n = chance(r, 0.35) ? 2 : 1
    for (let k = 0; k < n; k++) {
      const age = int(r, 0, Math.min(CHILD_AGE - 1, Math.min(a.age, b.age) - 19))
      makeChild(w, r, [a, b], w.time - age * YEAR - int(r, 0, 111) * DAY)
    }
  }
}

/** Hourly: due dates, and once a day new pregnancies and birthdays. */
export function processPopulation(w: World, t: Minute) {
  for (const p of w.people) if (p.expecting && p.expecting <= t) birth(w, p)
  if (hourOf(t) !== 6) return
  w.outrage = Math.max(0, (w.outrage ?? 0) * 0.93 - 0.005)
  for (const p of w.people) {
    if (p.bornAt === undefined || !p.alive) continue
    const age = Math.floor((t - p.bornAt) / YEAR)
    if (age === p.age) continue
    p.age = age
    if (age < CHILD_AGE) growUp(w, p)
    else if (p.job.includes('student')) {
      p.job = 'Unemployed'
      p.shift = undefined
      p.workplaceId = undefined
    }
  }
  // Fewer babies while children are going missing.
  const scared = 1 - Math.min(0.8, w.outrage ?? 0)
  for (const [a, b] of couples(w)) {
    if (a.expecting || b.expecting || kidsOf(w, a).length >= 3) continue
    if (!chance(w.rng, 0.015 * scared * (a.gender === b.gender ? 0.4 : 1))) continue
    const carrier = a.gender === 'female' ? a : b
    carrier.expecting = t + PREGNANCY + int(w.rng, 0, 23) * HOUR
    announce(w, a, b, 'expecting')
  }
}

function birth(w: World, carrier: Person) {
  carrier.expecting = undefined
  if (!carrier.alive) return
  const partner = carrier.relations.find((r) => r.type === 'partner')
  const other = partner ? person(w, partner.personId) : undefined
  const parents = other?.alive && other.homeId === carrier.homeId && !other.isPlayer ? [carrier, other] : [carrier]
  const kid = makeChild(w, w.rng, parents, w.time)
  // Housemates are family now too.
  for (const h of housemates(w, carrier)) {
    if (parents.includes(h) || h.id === kid.id || h.isPlayer) continue
    h.relations.push({ personId: kid.id, type: 'family', closeness: 0.8 })
    kid.relations.push({ personId: h.id, type: 'family', closeness: 0.8 })
  }
  announce(w, parents[0], parents[1], 'born', kid)
}

function announce(w: World, a: Person, b: Person | undefined, what: 'expecting' | 'born', kid?: Person) {
  const known = w.player.known ?? {}
  const me = playerPerson(w)
  const close = [a, b].find((p) => p && me.relations.some((r) => r.personId === p.id))
  if (what === 'born' && kid && (close || known[a.id] || (b && known[b.id]))) meet(w, kid.id, `${a.first}'s baby`)
  if (close) {
    send(w, close.id, what === 'expecting' ? pick(w.rng, ['big news… we’re having a baby!! 🍼', 'ok I can finally tell you: I’m going to be a parent 😭']) : `${kid!.first} is here!! ${kid!.gender === 'male' ? 'a boy' : kid!.gender === 'female' ? 'a girl' : 'a healthy baby'}, everyone's fine 💛`)
  } else if (known[a.id] || (b && known[b.id])) {
    addNews(w, 'personal', what === 'expecting' ? `${fullName(a)} is expecting` : `${a.first} ${b ? `and ${b.first} ` : ''}had a baby`, what === 'born' && kid ? `They named ${kid.gender === 'female' ? 'her' : kid.gender === 'male' ? 'him' : 'the baby'} ${kid.first}.` : 'Due in three weeks.')
  }
}

export const population = (w: World) => w.people.filter((p) => p.alive && !p.isPlayer).length