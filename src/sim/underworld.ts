// The other economy: black-market deals, trophies, and a storage unit nobody knows about.
import { chance, int, next, pick } from './rng'
import { FEMALE_NAMES, LAST_NAMES, MALE_NAMES, NEUTRAL_NAMES, nameFor } from './names'
import type { ItemId, Minute, OperationPlan, Person, ScheduledActivity, Trophy, TrophyKind, World } from './types'
import { DAY, HOUR } from './time'
import { ITEMS } from './items'
import { addEvidence, addNews, fullName, loc, meet, nameOf, playerPerson, uid, busyError } from './world'
import { runFight } from './actions'
import { recordBank, recordWithdrawal } from './money'
import { send } from './messages'
import { reportEvidence } from './police'

export const TROPHY_LABEL: Record<Exclude<TrophyKind, 'none'>, string> = {
  jewelry: 'a piece of their jewellery', hair: 'a lock of their hair', id: 'their ID card', photo: 'a photo you took of them',
}

/** Where deals happen: an alley after dark. */
export const dealSpots = (w: World) => w.locations.filter((l) => l.kind === 'alley')

/** Chance the "dealer" is an undercover cop. */
const STING = 0.05

/** Your contact: a real person who works one alley every night. A new one turns up if the last is gone. */
export function ensureDealer(w: World): Person | null {
  const cur = w.player.dealerId ? w.people.find((p) => p.id === w.player.dealerId) : undefined
  if (cur?.alive) return cur
  if ((w.player.marketClosedUntil ?? 0) > w.time) return null
  const r = w.rng
  const gender: Person['gender'] = chance(r, 0.8) ? 'male' : 'female'
  const alley = pick(r, dealSpots(w))
  const p: Person = {
    id: `p${++w.counter}`, gender, first: nameFor(gender, next(r)), last: pick(r, LAST_NAMES), age: int(r, 24, 45), job: 'Unemployed', pay: 0,
    homeId: pick(r, w.locations.filter((l) => l.kind === 'apartment')).id, phone: `555-${int(r, 1000, 9999)}`, traits: ['loner', 'paranoid'],
    habit: { locationId: alley.id, start: 21, end: 27, days: [0, 1, 2, 3, 4, 5, 6] }, relations: [], alive: true, isPlayer: false,
  }
  w.people.push(p)
  w.player.dealerId = p.id
  return p
}

export const dealerSpot = (w: World) => {
  const d = ensureDealer(w)
  return d?.habit ? loc(w, d.habit.locationId) : null
}

export function completeDeal(w: World, item: ItemId, price: number, locationId: string, at: Minute) {
  const dealer = ensureDealer(w)
  if (!dealer) return addNews(w, 'personal', 'Nobody showed', 'You waited in the alley. Your contact never came.')
  meet(w, dealer.id, 'Your black-market contact')
  if (w.player.money < price) return shortOnCash(w, dealer, item, price, locationId, at)
  w.player.money -= price
  recordWithdrawal(w, price, locationId, at - 30)
  if (chance(w.rng, STING)) {
    const e = addEvidence(w, { kind: 'statement', via: 'canvass', time: at, locationId, pointsTo: w.player.personId, strength: 0.35, description: `Undercover officers recorded ${fullName(playerPerson(w))} buying ${ITEMS[item].name.toLowerCase()} on the black market.` })
    const open = [...w.cases].reverse().find((c) => c.status === 'open')
    if (open) reportEvidence(w, open, [e.id])
    addNews(w, 'personal', 'It was a setup', `The "dealer" took your $${price} and photographed you. You ran. Police know your face now.`, true)
    return
  }
  w.player.inventory[item] = (w.player.inventory[item] ?? 0) + 1
  if (item === 'fake_id_cheap' || item === 'fake_id_good') {
    const me = playerPerson(w)
    w.player.alias = { first: pick(w.rng, (me.gender === 'male' ? MALE_NAMES : me.gender === 'female' ? FEMALE_NAMES : NEUTRAL_NAMES).filter((n) => n !== me.first)), last: pick(w.rng, LAST_NAMES.filter((n) => n !== me.last)), age: me.age + int(w.rng, -3, 3), quality: item === 'fake_id_good' ? 'good' : 'cheap', since: at }
  }
  addNews(w, 'personal', `Got it: ${ITEMS[item].name}`, `$${price}, cash. Nobody saw. Probably.${w.player.alias && item.startsWith('fake_id') ? ` From now on, when you need to, you're ${w.player.alias.first} ${w.player.alias.last}.` : ''}`)
}

const hospitalBill = (w: World, amount: number) =>
  (w.player.bills ??= []).push({ id: uid(w, 'bill'), kind: 'medical', label: 'Hospital (ER visit)', amount, dueAt: w.time + 10 * DAY })

function beaten(w: World, days: number, bill: number, why: string) {
  w.player.injuredUntil = Math.max(w.player.injuredUntil ?? 0, w.time + days * DAY)
  hospitalBill(w, bill)
  addNews(w, 'personal', 'You got hurt', `${why} Cracked ribs, a split lip. You'll be slow for ${days} days. ER bill: $${bill}.`, true)
}

/** You showed up to a deal without the money. It goes one of three ways. */
function shortOnCash(w: World, dealer: Person, item: ItemId, price: number, locationId: string, at: Minute) {
  const roll = next(w.rng)
  if (roll < 0.4) {
    beaten(w, 3, 350, `${dealer.first} counted the cash, looked at you, and didn't say a word before the first punch.`)
    send(w, 'dealer', 'Come back when you can count.')
  } else if (roll < 0.8) {
    const taken = Math.max(0, Math.min(w.player.money, price))
    w.player.money -= taken
    if (taken) recordWithdrawal(w, taken, locationId, at - 30)
    const owed = Math.round((price - taken) * 1.5)
    w.player.streetDebt = { amount: owed, dueAt: at + 7 * DAY, stage: 0 }
    w.player.inventory[item] = (w.player.inventory[item] ?? 0) + 1
    send(w, 'dealer', `You took the goods and you're $${owed} short with interest. You've got a week. I know where you live.`)
    addNews(w, 'personal', `You owe the dealer $${owed}`, 'Seven days. Nobody will sell to you until it’s paid.', true)
  } else {
    // It turns into a fight, and you don't hold back.
    addNews(w, 'personal', 'It turned into a fight', `${dealer.first} pulled a blade when you came up short. You didn't think. You just moved.`, true)
    const op: OperationPlan = {
      targetId: dealer.id, locationId, at, weapon: 'hands', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'left',
      bringOwnPhone: true, vehicle: 'foot', gloves: false, mask: false, bleach: false, tarp: false, lure: 'none', frenzy: true, quiet: true,
    }
    const s: ScheduledActivity = { id: uid(w, 'act'), activity: { kind: 'operation', op }, label: `Fight with ${dealer.first}`, departAt: at, startAt: at, endAt: at + 30, returnAt: at + HOUR, started: true }
    runFight(w, s)
    if (!dealer.alive) {
      w.player.marketClosedUntil = at + 5 * DAY
      s.report = { headline: `${dealer.first} is dead`, body: `Your hands won't stop shaking. ${dealer.first} ${dealer.last} is on the ground in the alley, and your only contact is gone with them. Your fingerprints are all over this.` }
    }
    if (s.report) addNews(w, 'personal', s.report.headline, s.report.body, true)
  }
}

// ---------------------------------------------------------------- street debt

export function payStreetDebt(w: World): string | null {
  const d = w.player.streetDebt
  if (!d) return 'You don’t owe them anything.'
  if (w.player.money < d.amount) return `You need $${d.amount} in cash.`
  w.player.money -= d.amount
  const spot = dealerSpot(w)
  if (spot) recordWithdrawal(w, d.amount, spot.id, w.time)
  w.player.streetDebt = undefined
  send(w, 'dealer', 'We’re square. Don’t make me wait again.')
  return null
}

/** Hourly: what happens when you don't pay. */
export function processUnderworld(w: World, t: Minute) {
  const d = w.player.streetDebt
  if (!d || t < d.dueAt) return
  const car = w.player.car
  if (d.stage === 0) {
    if (car) {
      car.condition = 0
      car.inShopUntil = t + 3 * DAY
      ;(w.player.bills ??= []).push({ id: uid(w, 'bill'), kind: 'repair', label: 'Car repair (vandalism)', amount: 600, dueAt: t + 7 * DAY })
    }
    send(w, 'dealer', `Nice car. Was. $${d.amount}. Four days.`)
    addNews(w, 'personal', 'Your car was smashed', 'Windows, lights, tyres. Nothing was taken. It was a message.', true)
    Object.assign(d, { stage: 1, dueAt: t + 4 * DAY })
  } else if (d.stage === 1) {
    beaten(w, 4, 500, 'Two of them were waiting outside your building.')
    send(w, 'dealer', `Last chance. $${d.amount}.`)
    Object.assign(d, { stage: 2, dueAt: t + 4 * DAY })
  } else {
    // They write you off — and make sure the police know your name.
    const e = addEvidence(w, { kind: 'statement', via: 'canvass', time: t, pointsTo: w.player.personId, strength: 0.4, description: `Anonymous tip: ${fullName(playerPerson(w))} buys guns and fake IDs, and "isn't what they look like".` })
    const open = [...w.cases].reverse().find((c) => c.status === 'open')
    if (open) reportEvidence(w, open, [e.id])
    w.player.streetDebt = undefined
    w.player.marketClosedUntil = t + 14 * DAY
    send(w, 'dealer', 'You’re done. Forget this number.')
    addNews(w, 'personal', 'Burned', 'The black market has cut you off — and someone just called the police about you.', true)
  }
}

// ---------------------------------------------------------------- fake IDs

/** Use a fake ID somewhere official. Returns true if it passed. */
export function presentFakeId(w: World, where: string): { ok: boolean; used?: ItemId } {
  const inv = w.player.inventory
  const id: ItemId | undefined = inv.fake_id_good ? 'fake_id_good' : inv.fake_id_cheap ? 'fake_id_cheap' : undefined
  if (!id) return { ok: false }
  const pass = chance(w.rng, id === 'fake_id_good' ? 0.95 : 0.5)
  if (!pass) {
    inv[id] = 0 // confiscated
    if (!inv.fake_id_cheap && !inv.fake_id_good) w.player.alias = undefined // that name is burned
    const e = addEvidence(w, { kind: 'statement', via: 'canvass', time: w.time, pointsTo: w.player.personId, strength: 0.2, description: `Staff at ${where} reported someone presenting a forged ID — description matches ${fullName(playerPerson(w))}.` })
    const open = [...w.cases].reverse().find((c) => c.status === 'open')
    if (open) reportEvidence(w, open, [e.id])
  }
  return { ok: pass, used: id }
}

// ---------------------------------------------------------------- storage

export const storageLocations = (w: World) => w.locations.filter((l) => l.kind === 'storage')

export function rentStorage(w: World, locationId: string, alias: 'real' | 'fake'): string | null {
  const busy = busyError(w)
  if (busy) return busy
  if (w.player.storage) return 'You already rent a unit.'
  if (w.player.money < 160) return 'They want two months up front: $160.'
  const l = loc(w, locationId)
  if (alias === 'fake') {
    const r = presentFakeId(w, l.name)
    if (!r.used) return 'You don’t have a fake ID.'
    if (!r.ok) {
      addNews(w, 'personal', 'The clerk wasn’t fooled', 'They kept the ID and reached for the phone. You left fast.', true)
      return null
    }
  }
  w.player.money -= 160
  const unit = int(w.rng, 10, 240)
  w.player.storage = { locationId, alias, unit }
  if (alias === 'real') recordBank(w, `Payment to ${l.name}, unit #${unit}`, locationId, w.time, 0.05)
  ;(w.player.bills ??= []).push({ id: uid(w, 'bill'), kind: 'storage', label: `Storage unit #${unit}`, amount: 80, dueAt: w.time + 56 * DAY })
  const a = w.player.alias
  addNews(w, 'personal', `Unit #${unit} is yours`, `${l.name}, rented under ${alias === 'real' || !a ? 'your own name' : `the name ${a.first} ${a.last}`}.`)
  return null
}

export function completeStorageTrip(w: World, move: 'stash' | 'retrieve') {
  const st = w.player.storage
  if (!st) return
  let n = 0
  for (const t of w.player.trophies ?? []) {
    if (move === 'stash' && t.where === 'home') { t.where = 'storage'; n++ }
    if (move === 'retrieve' && t.where === 'storage') { t.where = 'home'; n++ }
  }
  addNews(w, 'personal', move === 'stash' ? `Moved ${n} item(s) to the unit` : `Brought ${n} item(s) home`, `${loc(w, st.locationId).name}, unit #${st.unit}.`)
}

// ---------------------------------------------------------------- trophies

export function takeTrophy(w: World, victimId: string, kind: TrophyKind | undefined, at: Minute) {
  if (!kind || kind === 'none') return
  const t: Trophy = { id: uid(w, 'tr'), victimId, kind, where: 'home', takenAt: at }
  ;(w.player.trophies ??= []).push(t)
}

/** A search finds every trophy kept in the searched place. */
export function trophiesFound(w: World, where: 'home' | 'storage'): string[] {
  const out: string[] = []
  for (const t of (w.player.trophies ?? []).filter((x) => x.where === where)) {
    addEvidence(w, { kind: 'search_find', via: 'search', time: w.time, victimId: t.victimId, pointsTo: w.player.personId, strength: 1.3, description: `${TROPHY_LABEL[t.kind][0].toUpperCase()}${TROPHY_LABEL[t.kind].slice(1)} — belonging to ${nameOf(w, t.victimId)} — found in the suspect’s ${where === 'home' ? 'home' : 'storage unit'}.` })
    out.push(`${t.kind} of ${nameOf(w, t.victimId)}`)
  }
  return out
}

/** Police only know about a unit rented in your own name, once they've seen your bank records. */
export const storageKnownToPolice = (w: World) =>
  !!w.player.storage && w.player.storage.alias === 'real' && w.evidence.some((e) => e.discovered && e.kind === 'bank' && e.locationId === w.player.storage!.locationId)

export function cleanerMightTalk(w: World) {
  // Professionals don't talk. Mostly.
  if (chance(w.rng, 0.03)) send(w, 'unknown', 'Heard the cops are asking around about my work. Wasn’t me who talked. Yet.')
}

export const DEAL_HOURS = [21, 22, 23, 0, 1, 2]
export const nextDealTime = (now: Minute) => {
  for (let t = Math.ceil(now / HOUR) * HOUR + HOUR; ; t += HOUR) if (DEAL_HOURS.includes((t / HOUR) % 24)) return t
}
