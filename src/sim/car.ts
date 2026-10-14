// Your car: it gets you there, it needs gas and care, and it has your name on the plate.
import { chance, int, pick } from './rng'
import type { Minute, ScheduledActivity, World } from './types'
import { DAY } from './time'
import { addNews, loc, playerPerson, uid } from './world'
import { travelMinutes } from './geo'
import { recordBank } from './money'

/** % of a tank burned per minute of driving. */
const BURN = 0.25

export function newCar(w: World) {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ'
  w.player.car = { plate: `${pick(w.rng, [...L])}${pick(w.rng, [...L])}${pick(w.rng, [...L])}-${int(w.rng, 100, 999)}`, fuel: 70, condition: 80 }
}

export function carUsable(w: World, t: Minute): boolean {
  const c = w.player.car
  return !!c && (c.inShopUntil ?? 0) <= t && c.fuel > 0
}

/** Fuel (in %) a round trip of `minutes` each way needs. */
export const fuelFor = (minutes: number) => Math.ceil(minutes * 2 * BURN)

/** Dollars per % of a tank. */
export const FUEL_PRICE = 1
/** Bus fare each way when the car can't take you. */
export const BUS_FARE = 3

/** Burn fuel and wear the car down (warns when the tank gets low). */
function burnFuel(w: World, amount: number) {
  const c = w.player.car
  if (!c) return
  const before = c.fuel
  c.fuel = Math.max(0, c.fuel - amount)
  if (before >= 15 && c.fuel < 15) addNews(w, 'personal', 'Low on gas', `${Math.round(c.fuel)}% left in the tank. Fill up before you need the car.`)
  c.condition = Math.max(0, c.condition - 0.6)
}

export interface Commute {
  /** Minutes each way by car. */
  minutes: number
  /** % of a tank for the round trip. */
  fuel: number
  /** Fuel cost per working day. */
  costPerDay: number
  costPerWeek: number
  /** Working days a full tank covers. */
  daysPerTank: number
}

/** The numbers for driving from home to a workplace and back on every shift. */
export function commuteFor(w: World, workplaceId: string, shiftsPerWeek: number): Commute {
  const minutes = travelMinutes(w, playerPerson(w).homeId, workplaceId)
  const fuel = fuelFor(minutes)
  const costPerDay = Math.round(fuel * FUEL_PRICE)
  return { minutes, fuel, costPerDay, costPerWeek: costPerDay * shiftsPerWeek, daysPerTank: fuel ? Math.floor(100 / fuel) : Infinity }
}

/** Start of a shift: drive in (and back later) if the car can, otherwise take the bus. */
export function commute(w: World, workplaceId: string) {
  const c = w.player.car
  const { fuel } = commuteFor(w, workplaceId, 1)
  if (!fuel) return
  if (c && carUsable(w, w.time) && c.fuel >= fuel) return burnFuel(w, fuel)
  w.player.money -= BUS_FARE * 2
  addNews(w, 'personal', 'Took the bus to work', `${!c ? 'No car.' : (c.inShopUntil ?? 0) > w.time ? 'The car is in the garage.' : 'Not enough gas for the drive.'} ${BUS_FARE * 2} return fare.`)
}

/** Called when a driven activity starts: burn fuel, wear the car, maybe break it. */
export function useCar(w: World, s: ScheduledActivity) {
  const c = w.player.car
  if (!c || !s.drive) return
  burnFuel(w, fuelFor(s.startAt - s.departAt))
  if (c.condition < 35 && chance(w.rng, (35 - c.condition) / 120)) {
    c.inShopUntil = w.time + 2 * DAY
    ;(w.player.bills ??= []).push({ id: uid(w, 'bill'), kind: 'repair', label: 'Car repair', amount: 350, dueAt: w.time + 3 * DAY })
    addNews(w, 'personal', 'Your car broke down', 'Towed to the garage: two days and $350. You’ll have to walk.', true)
  }
}

export function completeRefuel(w: World, locationId: string, at: Minute) {
  const c = w.player.car
  if (!c) return
  const cost = Math.round(100 - c.fuel)
  if (w.player.money < cost) return addNews(w, 'personal', 'Card declined at the pump', `A full tank is $${cost}.`)
  w.player.money -= cost
  c.fuel = 100
  recordBank(w, `Card payment of $${cost} at ${loc(w, locationId).name}`, locationId, at) // the pump is in the bank records too
  addNews(w, 'personal', `Filled up — $${cost}`, `${loc(w, locationId).name}.`)
}

export function completeService(w: World, locationId: string) {
  const c = w.player.car
  if (!c) return
  if (w.player.money < 120) return addNews(w, 'personal', 'Can’t pay for the service', '$120.')
  w.player.money -= 120
  c.condition = 100
  addNews(w, 'personal', 'Car serviced — $120', `${loc(w, locationId).name}. Runs like new.`)
}
