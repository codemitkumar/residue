import type { Evidence, Location, NewsItem, Person, World } from './types'
import { fmtClock, inBlock } from './time'

export const uid = (w: World, prefix: string) => `${prefix}${++w.counter}`

export const person = (w: World, id: string): Person => w.people.find((p) => p.id === id)!
export const loc = (w: World, id: string): Location => w.locations.find((l) => l.id === id)!
export const districtName = (w: World, id: string) => w.districts.find((d) => d.id === id)?.name ?? '?'
export const fullName = (p: Person) => `${p.first} ${p.last}`
export const nameOf = (w: World, id: string) => fullName(person(w, id))
/** How a stranger describes someone: "a man", "a woman", "a person". */
export const aPerson = (p: Person) => (p.gender === 'male' ? 'a man' : p.gender === 'female' ? 'a woman' : 'a person')
export const GENDER_LABEL = { male: 'Man', female: 'Woman', nonbinary: 'Non-binary' } as const
export const GENDER_ICON = { male: '♂', female: '♀', nonbinary: '⚧' } as const

export const describeJob = (p: Person) =>
  p.job === 'Unemployed' ? 'unemployed resident' : p.job === 'Retired' ? 'retiree' : p.job.toLowerCase()
export const playerPerson =(w: World) => person(w, w.player.personId)

/** Truth: where an NPC is at time t according to their routine. */
export function whereIs(p: Person, t: number): string {
  if (p.shift && p.workplaceId && inBlock(t, p.shift)) return p.workplaceId
  if (p.habit && inBlock(t, p.habit)) return p.habit.locationId
  return p.homeId
}

/** Where the player physically is at time t (busy with an activity, at work, or home). */
export function playerLocationAt(w: World, t: number): string {
  const s = w.player.agenda.find((x) => t >= (x.departAt ?? x.startAt) && t < (x.returnAt ?? x.endAt))
  if (s) {
    const a = s.activity
    if (a.kind === 'scout' || a.kind === 'visit' || a.kind === 'shop' || a.kind === 'dispose_item' || a.kind === 'interview') return a.locationId
    if (a.kind === 'tail' || a.kind === 'lift') return whereIs(person(w, a.personId), t)
    if (a.kind === 'operation') return a.op.locationId
    if (a.kind === 'obligation') return a.obligation.locationId
  }
  const p = playerPerson(w)
  if (!w.player.employed) return p.homeId
  const sick = w.player.shifts[Math.floor(t / 1440)] === 'sick'
  return sick ? p.homeId : whereIs(p, t)
}

/** What the player is in the middle of right now (from leaving home until back), if anything. */
export const busyWith = (w: World, t = w.time) => w.player.agenda.find((s) => t >= s.departAt && t < s.returnAt)

/** One thing at a time: an error if the player is out doing something else. */
export function busyError(w: World): string | null {
  const s = busyWith(w)
  return s ? `You’re busy — ${s.label} — until ${fmtClock(s.returnAt)}. Plan it for later.` : null
}

/** The player learns someone exists. Returns true if they're new. */
export function meet(w: World, personId: string, how: string): boolean {
  const known = (w.player.known ??= {})
  if (known[personId] || personId === w.player.personId) return false
  known[personId] = { how, at: w.time }
  return true
}

/** Starting acquaintances: everyone the player has a relationship with, plus building neighbours. */
export function initKnown(w: World) {
  const me = playerPerson(w)
  w.player.known ??= {}
  for (const r of me.relations) {
    meet(w, r.personId, `Your ${r.type}`)
    // You know the people in your life: their job, home and friends.
    w.player.personIntel[r.personId] = { ...w.player.personIntel[r.personId], researched: true, knowsHome: r.type !== 'coworker' && r.type !== 'boss' }
  }
  for (const id of Object.keys(w.player.personIntel)) meet(w, id, 'Someone you looked into')
  for (const p of w.people) if (p.homeId === me.homeId) meet(w, p.id, `Neighbour at ${loc(w, me.homeId).name}`)
}

export function peopleAt(w: World, locationId: string, t: number): Person[] {
  return w.people.filter((p) => p.alive && !p.isPlayer && whereIs(p, t) === locationId)
}

export function housemates(w: World, p: Person): Person[] {
  return w.people.filter((o) => o.id !== p.id && o.homeId === p.homeId && p.relations.some((r) => r.personId === o.id && (r.type === 'partner' || r.type === 'family')))
}

export function addNews(w: World, kind: NewsItem['kind'], headline: string, body = '', pause = false) {
  w.news.unshift({ id: uid(w, 'n'), time: w.time, headline, body, kind })
  if (w.news.length > 300) w.news.length = 300
  if (pause) w.pauseRequested = true
}

export function addEvidence(w: World, e: Omit<Evidence, 'id' | 'discovered'>): Evidence {
  const ev: Evidence = { ...e, id: uid(w, 'e'), discovered: false }
  w.evidence.push(ev)
  return ev
}
