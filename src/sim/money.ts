// Rent, bills, the bank, debt — the paperwork of a normal life.
import { pick } from './rng'
import type { BillKind, Loan, Minute, World } from './types'
import { DAY, HOUR, dayOf, fmtDay, hourOf } from './time'
import { ITEMS } from './items'
import { addEvidence, addNews, districtName, fullName, loc, playerPerson, uid } from './world'
import { send } from './messages'
import { reportEvidence } from './police'

/** A month is 28 days. Bills are issued a week ahead of the due date. */
export const MONTH = 28
const MONTHLY: { kind: BillKind; label: string; amount: (w: World) => number; dueDay: number }[] = [
  { kind: 'rent', label: 'Rent', amount: () => 1100, dueDay: 1 },
  { kind: 'utilities', label: 'Electricity & water', amount: () => 140, dueDay: 8 },
  { kind: 'phone', label: 'Phone bill', amount: () => 55, dueDay: 15 },
  { kind: 'insurance', label: 'Car insurance', amount: () => 90, dueDay: 20 },
  { kind: 'childcare', label: 'Childcare', amount: (w) => (w.player.childId ? 450 : 0), dueDay: 22 },
]

export const credit = (w: World) => w.player.credit ?? 650
const adjustCredit = (w: World, d: number) => (w.player.credit = Math.max(300, Math.min(850, credit(w) + d)))

function issue(w: World, kind: BillKind, label: string, amount: number, dueAt: Minute) {
  ;(w.player.bills ??= []).push({ id: uid(w, 'bill'), kind, label, amount, dueAt })
}

export function payBill(w: World, billId: string): string | null {
  const b = w.player.bills?.find((x) => x.id === billId)
  if (!b || b.paidAt) return 'Already paid.'
  if (w.player.money < b.amount) return `Not enough money ($${b.amount}).`
  w.player.money -= b.amount
  b.paidAt = w.time
  if (!b.late) adjustCredit(w, 2)
  if (b.kind === 'loan') {
    const loan = w.player.loans?.find((l) => b.label.endsWith(l.id))
    if (loan) {
      loan.balance = Math.max(0, loan.balance - b.amount)
      if (loan.balance === 0) w.player.loans = w.player.loans!.filter((l) => l !== loan)
    }
  }
  return null
}

// ---------------------------------------------------------------- loans

export function loanOffer(w: World, amount: number): string | null {
  const c = credit(w)
  if (c < 520) return 'The bank won’t lend to you. Your credit is too poor.'
  if (!w.player.employed && amount > 800) return 'Without a job, the most they’ll lend is $800.'
  const owed = (w.player.loans ?? []).reduce((a, l) => a + l.balance, 0)
  if (owed + amount > (c - 400) * 12) return `They won’t lend you that much. Try less.`
  return null
}

export function takeLoan(w: World, amount: number): string | null {
  const err = loanOffer(w, amount)
  if (err) return err
  const rate = credit(w) > 700 ? 1.12 : credit(w) > 600 ? 1.22 : 1.35
  const loan: Loan = { id: `L${++w.counter}`, principal: amount, balance: Math.round(amount * rate), weekly: Math.round((amount * rate) / 12), takenAt: w.time }
  ;(w.player.loans ??= []).push(loan)
  w.player.money += amount
  adjustCredit(w, -10)
  addNews(w, 'personal', `Loan approved: $${amount}`, `Repay $${loan.weekly}/week for 12 weeks (total $${loan.balance}).`)
  return null
}

// ---------------------------------------------------------------- bank records

/** Paying cash means taking cash out first. The bank remembers where and when. */
export function recordBank(w: World, what: string, locationId: string, t: Minute, strength = 0.08, victimId?: string) {
  const l = loc(w, locationId)
  addEvidence(w, { kind: 'bank', via: 'bank_records', time: t, locationId, districtId: l.districtId, victimId, pointsTo: w.player.personId, strength, description: `${what} — ${districtName(w, l.districtId)}, ${fmtDay(t)} ${hourOf(t)}:00.` })
}

export const recordWithdrawal = (w: World, amount: number, locationId: string, t: Minute) =>
  recordBank(w, `ATM withdrawal of $${Math.ceil(amount / 20) * 20}`, locationId, t)

// ---------------------------------------------------------------- eviction

function evict(w: World) {
  const me = playerPerson(w)
  const old = loc(w, me.homeId)
  const inv = w.player.inventory
  // The landlord clears the apartment — everything you kept there is gone, and seen.
  const seen = Object.entries(inv).filter(([k, n]) => n && ITEMS[k as keyof typeof ITEMS] && !ITEMS[k as keyof typeof ITEMS].home).map(([k]) => k)
  const bad = seen.filter((k) => k === 'victim_phone' || w.player.tainted[k as keyof typeof inv]?.length)
  if (bad.length) {
    const e = addEvidence(w, { kind: 'statement', via: 'canvass', time: w.time, locationId: old.id, pointsTo: me.id, strength: 0.45, description: `Landlord clearing ${fullName(me)}'s evicted apartment found ${bad.map((b) => ITEMS[b as keyof typeof ITEMS].name.toLowerCase()).join(', ')} and called the police.` })
    const open = [...w.cases].reverse().find((c) => c.status === 'open')
    if (open) reportEvidence(w, open, [e.id])
  }
  w.player.inventory = {}
  w.player.tainted = {}
  const homes = w.locations.filter((l) => l.kind === 'apartment' && l.id !== old.id)
  me.homeId = pick(w.rng, homes).id
  const rom = w.player.romance
  if (rom?.status === 'married') w.people.find((p) => p.id === rom.personId)!.homeId = me.homeId
  if (w.player.childId) w.people.find((p) => p.id === w.player.childId)!.homeId = me.homeId
  adjustCredit(w, -80)
  addNews(w, 'personal', 'Evicted', `The locks at ${old.name} were changed. Everything you kept there is gone. You found a room at ${loc(w, me.homeId).name}.`, true)
}

// ---------------------------------------------------------------- hourly

export function processMoney(w: World, t: Minute) {
  if (hourOf(t) !== 9) return
  const d = dayOf(t)
  const pl = w.player

  // Issue next month's bills a week ahead.
  for (const b of MONTHLY) {
    if (b.kind === 'insurance' && !pl.car) continue
    const amount = b.amount(w)
    if (!amount) continue
    for (let due = Math.ceil((d - b.dueDay) / MONTH) * MONTH + b.dueDay; due <= d + 7; due += MONTH) {
      const dueAt = due * DAY + 9 * HOUR
      if (due < d || pl.bills?.some((x) => x.kind === b.kind && x.dueAt === dueAt)) continue
      issue(w, b.kind, b.label, amount, dueAt)
    }
  }
  // Weekly loan instalments.
  for (const loan of pl.loans ?? []) {
    const weeks = Math.floor((t - loan.takenAt) / (7 * DAY))
    const dueAt = loan.takenAt + (weeks + 1) * 7 * DAY
    if (!pl.bills?.some((x) => x.kind === 'loan' && x.dueAt === dueAt && x.label.endsWith(loan.id))) issue(w, 'loan', `Loan repayment ${loan.id}`, Math.min(loan.weekly, loan.balance), dueAt)
  }

  for (const b of pl.bills ?? []) {
    if (b.paidAt) continue
    const overdue = (t - b.dueAt) / DAY
    if (overdue >= 0 && overdue < 1 && pl.autopay !== false && pl.money >= b.amount) {
      payBill(w, b.id)
      continue
    }
    if (overdue >= 1 && !b.late) {
      b.late = true
      b.amount = Math.round(b.amount * 1.1)
      adjustCredit(w, -20)
      send(w, b.kind === 'rent' ? 'landlord' : 'bank', b.kind === 'rent' ? `Rent is late. A 10% fee has been added: $${b.amount} now. Don't make me come up there.` : `${b.label} is overdue. A late fee has been added ($${b.amount}).`)
    }
    if (b.kind === 'rent' && overdue >= 10 && !b.warned) {
      b.warned = true
      send(w, 'landlord', `EVICTION NOTICE. Pay $${b.amount} within 10 days or you're out and the locks get changed.`)
      addNews(w, 'personal', 'Eviction notice', 'Ten days to pay the rent.', true)
    }
    if (b.kind === 'rent' && overdue >= 20) {
      b.paidAt = t // written off — with you
      evict(w)
    }
    if (b.kind !== 'rent' && overdue >= 21 && !b.warned) {
      b.warned = true
      adjustCredit(w, -40)
      send(w, 'bank', `Your ${b.label.toLowerCase()} account has been passed to a debt collection agency.`)
    }
  }
  pl.bills = (pl.bills ?? []).filter((b) => !b.paidAt || t - b.paidAt < 30 * DAY)

  // Overdraft: weekly fee while the account is negative.
  if (pl.money < 0) {
    pl.overdraftSince ??= d
    if ((d - pl.overdraftSince) % 7 === 0) {
      pl.money -= 35
      adjustCredit(w, -10)
      send(w, 'bank', `Your account is overdrawn ($${pl.money}). A $35 overdraft fee has been charged.`)
    }
  } else pl.overdraftSince = undefined
}

export const unpaidBills = (w: World) => (w.player.bills ?? []).filter((b) => !b.paidAt)
