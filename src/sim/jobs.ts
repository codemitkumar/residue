import { chance, int, next, pick, shuffle } from './rng'
import type { Application, JobListing, Minute, ScheduledActivity, World } from './types'
import { DAY, HOUR, dayOf, dowOf, fmtDay, fmtHourRange, fmtDays, hourOf, inBlock } from './time'
import { JOBS } from './worldgen'
import { addEvidence, addNews, fullName, loc, meet, person, playerPerson, uid } from './world'
import { send } from './messages'
import { workplaceClosed } from './environment'
import { commute } from './car'

/** How hard each kind of workplace is to get into. */
const HIRE_ODDS: Record<string, number> = {
  grocery: 0.8, restaurant: 0.75, hardware: 0.75, warehouse: 0.7, factory: 0.7, construction: 0.65, bar: 0.6,
  gym: 0.5, pharmacy: 0.45, office: 0.4, hospital: 0.3,
}

export const hrThread = (locationId: string) => `hr:${locationId}`

// ---------------------------------------------------------------- listings

/** Drop expired listings and post new ones (called at start and every Monday). */
export function refreshListings(w: World) {
  const r = w.rng
  w.jobListings = (w.jobListings ?? []).filter((l) => l.expiresAt > w.time)
  const places = shuffle(r, w.locations.filter((l) => JOBS[l.kind]))
  for (const l of places.slice(0, int(r, 4, 6))) {
    const tpl = JOBS[l.kind]!
    const shift = tpl.shift(r)
    const perShift = int(r, tpl.pay[0], tpl.pay[1])
    w.jobListings.push({
      id: uid(w, 'job'), workplaceId: l.id, title: pick(r, tpl.titles), shift, salary: Math.round((perShift * shift.days.length) / 10) * 10,
      odds: HIRE_ODDS[l.kind] ?? 0.6, postedAt: w.time, expiresAt: w.time + 7 * DAY,
    })
  }
}

/** The player's real chance of landing a job, given their history. */
export function hireChance(w: World, l: JobListing): number {
  let p = l.odds * Math.pow(0.65, w.player.firedCount ?? 0)
  if (w.player.questioned) p *= 0.8 // word gets around
  return Math.max(0.05, Math.min(0.95, p))
}

export function applyFor(w: World, listingId: string): string | null {
  const listing = w.jobListings?.find((l) => l.id === listingId)
  if (!listing) return 'That job is no longer listed.'
  const apps = (w.player.applications ??= [])
  if (apps.some((a) => a.listing.id === listingId)) return 'You already applied.'
  if (playerPerson(w).workplaceId === listing.workplaceId && w.player.employed) return 'You already work there.'
  apps.push({ id: uid(w, 'app'), listing, status: 'applied', appliedAt: w.time, replyAt: w.time + int(w.rng, 10, 36) * HOUR })
  return null
}

// ---------------------------------------------------------------- employment

function leaveJob(w: World) {
  const me = playerPerson(w)
  // Work relationships end with the job.
  const ex = me.relations.filter((r) => r.type === 'boss' || r.type === 'coworker').map((r) => r.personId)
  me.relations = me.relations.filter((r) => !ex.includes(r.personId))
  for (const id of ex) {
    const o = person(w, id)
    o.relations = o.relations.filter((r) => r.personId !== me.id)
  }
  me.workplaceId = undefined
  me.shift = undefined
  me.job = 'Unemployed'
  me.pay = 0
  w.player.employed = false
  w.player.salary = undefined
  w.player.bossId = undefined
}

export function quitJob(w: World, fired = false): string | null {
  if (!w.player.employed) return 'You don’t have a job.'
  const me = playerPerson(w)
  const place = loc(w, me.workplaceId!).name
  payOut(w) // whatever is owed
  leaveJob(w)
  if (fired) w.player.firedCount = (w.player.firedCount ?? 0) + 1
  else addNews(w, 'personal', `You quit ${place}`, 'No more paychecks until you find something else.')
  return null
}

function hire(w: World, app: Application) {
  const me = playerPerson(w)
  if (w.player.employed) {
    const old = me.workplaceId!
    send(w, w.player.bossId ?? hrThread(old), 'Sorry to hear you’re leaving. Good luck.')
    payOut(w)
    leaveJob(w)
  }
  const l = app.listing
  const place = loc(w, l.workplaceId)
  me.workplaceId = l.workplaceId
  me.job = l.title
  me.shift = l.shift
  me.pay = Math.round(l.salary / l.shift.days.length)
  Object.assign(w.player, { employed: true, salary: l.salary, missedShifts: 0, unpaidShifts: 0, shiftsDue: 0 })
  app.status = 'hired'

  // A boss and a couple of coworkers come with the job.
  const staff = shuffle(w.rng, w.people.filter((p) => p.alive && !p.isPlayer && p.workplaceId === l.workplaceId))
  const relate = (id: string, type: 'boss' | 'coworker', back: 'coworker', closeness: number) => {
    const o = person(w, id)
    if (me.relations.some((r) => r.personId === id)) return
    me.relations.push({ personId: id, type, closeness })
    o.relations.push({ personId: me.id, type: back, closeness })
  }
  if (staff[0]) {
    w.player.bossId = staff[0].id
    relate(staff[0].id, 'boss', 'coworker', 0.35)
    meet(w, staff[0].id, `Your boss at ${place.name}`)
    w.player.personIntel[staff[0].id] = { ...w.player.personIntel[staff[0].id], researched: true }
  }
  for (const c of staff.slice(1, 3)) {
    relate(c.id, 'coworker', 'coworker', 0.3)
    meet(w, c.id, `Your coworker at ${place.name}`)
    w.player.personIntel[c.id] = { ...w.player.personIntel[c.id], researched: true }
  }
  send(w, hrThread(place.id), `Congratulations! You're our new ${l.title}. Shifts are ${fmtHourRange(l.shift.start, l.shift.end)}, ${fmtDays(l.shift.days)}. Salary is $${l.salary}/week, paid Fridays. Don't be late.`)
}

const owed = (w: World) => {
  const me = playerPerson(w)
  if (!w.player.employed || !me.shift || !w.player.salary) return 0
  const perShift = w.player.salary / me.shift.days.length
  return Math.max(0, Math.round(perShift * ((w.player.shiftsDue ?? 0) - (w.player.unpaidShifts ?? 0))))
}

function payOut(w: World) {
  const amount = owed(w)
  if (amount > 0) {
    w.player.money += amount
    addNews(w, 'personal', `Payday: $${amount}`, w.player.unpaidShifts ? `Docked for ${w.player.unpaidShifts} shift(s) you didn't work.` : 'Full week, full pay.')
  }
  w.player.shiftsDue = 0
  w.player.unpaidShifts = 0
}

/** Start time of the player's next shift, if they have a job. */
export function nextShift(w: World, from: Minute = w.time): Minute | null {
  const me = playerPerson(w)
  if (!w.player.employed || !me.shift) return null
  for (let t = Math.ceil(from / HOUR) * HOUR; t < from + 8 * DAY; t += HOUR) {
    if (inBlock(t, me.shift) && !inBlock(t - HOUR, me.shift)) return t
  }
  return null
}

const shiftDayOf = (w: World, t: Minute) => {
  const s = playerPerson(w).shift!
  return hourOf(t) < s.start && s.end > 24 ? dayOf(t) - 1 : dayOf(t)
}

export function callInSick(w: World): string | null {
  const t = nextShift(w)
  if (t === null) return 'You don’t have a job.'
  const recent = Object.entries(w.player.shifts).filter(([d, v]) => v === 'sick' && +d > dayOf(w.time) - 7).length
  if (recent >= 1) return 'You already called in sick this week. Your boss won’t buy it again.'
  const d = shiftDayOf(w, t)
  if (w.player.shifts[d]) return 'Too late for that shift.'
  w.player.shifts[d] = 'sick'
  w.player.messages.push({ id: uid(w, 'm'), thread: w.player.bossId ?? hrThread(playerPerson(w).workplaceId!), from: 'me', text: `Not feeling well, can't make it in on ${fmtDay(t)}. Sorry.`, time: w.time, read: true })
  send(w, w.player.bossId ?? hrThread(playerPerson(w).workplaceId!), pick(w.rng, ['Ok. Feel better.', 'Fine. Unpaid, you know that.', 'Again? ...Ok.']))
  return null
}

// ---------------------------------------------------------------- hourly

export function processJobs(w: World, t: Minute) {
  if (dowOf(t) === 0 && hourOf(t) === 8) refreshListings(w)
  if (dowOf(t) === 4 && hourOf(t) === 18 && w.player.employed) payOut(w)

  for (const app of w.player.applications ?? []) {
    const l = app.listing
    const place = loc(w, l.workplaceId)
    const thread = hrThread(place.id)
    if (app.status === 'applied' && app.replyAt <= t) {
      if (chance(w.rng, Math.min(0.95, hireChance(w, l) + 0.2))) {
        const at = (dayOf(t) + 1) * DAY + (next(w.rng) < 0.5 ? 10 : 14) * HOUR
        app.status = 'interview'
        app.interviewAt = at
        send(w, thread, `Hi ${playerPerson(w).first}, thanks for applying for ${l.title}. Can you come in for an interview ${fmtDay(at)} at ${hourOf(at)}:00?`, {
          choices: [{ id: 'yes', label: 'I’ll be there.' }, { id: 'no', label: 'Sorry, I’m no longer interested.' }],
          action: { kind: 'interview', appId: app.id, at },
          expiresAt: at,
        })
      } else {
        app.status = 'rejected'
        send(w, thread, `Thank you for your interest in ${l.title}. Unfortunately we've decided to move forward with other candidates.`)
      }
    } else if (app.status === 'interview' && app.interviewAt !== undefined && t > app.interviewAt + HOUR) {
      app.status = 'rejected'
      send(w, thread, 'You missed your interview. We won’t be rescheduling.')
    } else if (app.status === 'interviewed' && app.replyAt <= t) {
      if (chance(w.rng, hireChance(w, l))) hire(w, app)
      else {
        app.status = 'rejected'
        send(w, thread, `Thanks for coming in. We've offered the ${l.title} position to someone else.`)
      }
    }
  }
}

/** You can't slip out of work unnoticed: any activity during a shift is an absence on record. */
export function noteAbsence(w: World, s: ScheduledActivity) {
  const pl = w.player
  const me = playerPerson(w)
  if (!pl.employed || !me.shift || !me.workplaceId) return
  const a = s.activity
  if (a.kind === 'obligation' && a.obligation.type === 'overtime') return
  if (workplaceClosed(w, loc(w, me.workplaceId), s.startAt)) return // public holiday
  for (let t = s.departAt; t < s.returnAt; t += 10) {
    if (!inBlock(t, me.shift)) continue
    const d = shiftDayOf(w, t)
    if (pl.shifts[d]) return // already sick / already marked
    const whole = s.returnAt - s.departAt >= 6 * HOUR
    pl.shifts[d] = 'missed'
    pl.missedShifts++
    pl.unpaidShifts = (pl.unpaidShifts ?? 0) + 1
    const place = loc(w, me.workplaceId)
    addEvidence(w, { kind: 'absence', via: 'employer', time: t, locationId: place.id, pointsTo: me.id, strength: 0.12, description: `${fullName(me)} ${whole ? 'did not show up for' : 'walked out during'} a scheduled shift at ${place.name} (${fmtDay(t)} ${hourOf(t)}:00).` })
    const boss = pl.bossId ?? hrThread(me.workplaceId)
    if (pl.missedShifts >= 3) {
      send(w, boss, 'That’s three strikes. Don’t bother coming back. HR will mail your last check.')
      quitJob(w, true)
      addNews(w, 'personal', 'You were fired', 'Too many absences.', true)
      return
    }
    send(w, boss, whole ? (pl.missedShifts === 1 ? 'Where are you?? Your shift started.' : 'Again?? Last warning.') : 'You just walked out in the middle of your shift?! That’s going on your record.')
    return
  }
}

/** Shift bookkeeping: pay accounting and meeting coworkers. Runs hourly. */
export function processShifts(w: World, t: Minute) {
  const pl = w.player
  const me = playerPerson(w)
  if (!pl.employed || !me.shift) return
  const shift = me.shift
  const d = shiftDayOf(w, inBlock(t, shift) ? t : t - HOUR)

  if (inBlock(t, shift) && !inBlock(t - HOUR, shift)) {
    pl.shiftsDue = (pl.shiftsDue ?? 0) + 1
    if (pl.shifts[d] === 'sick') pl.unpaidShifts = (pl.unpaidShifts ?? 0) + 1
    else if (pl.custody?.inCustody && !pl.shifts[d]) {
      pl.shifts[d] = 'missed'
      pl.missedShifts++
      pl.unpaidShifts = (pl.unpaidShifts ?? 0) + 1
      if (pl.missedShifts >= 3) {
        send(w, pl.bossId ?? hrThread(me.workplaceId!), 'We saw the news. Don’t come back.')
        quitJob(w, true)
        return
      }
    }
    // Off to work (unless you're off sick, already gone elsewhere, or it's a holiday).
    else if (!pl.shifts[d] && !workplaceClosed(w, loc(w, me.workplaceId!), t)) commute(w, me.workplaceId!)
  }
  // Shift finished: you were there, and you get to know people.
  if (inBlock(t - HOUR, shift) && !inBlock(t, shift) && !pl.shifts[d]) {
    pl.shifts[d] = 'paid'
    const staff = w.people.filter((p) => p.alive && !p.isPlayer && p.workplaceId === me.workplaceId && !pl.known?.[p.id])
    if (staff.length && chance(w.rng, 0.5)) {
      const p = pick(w.rng, staff)
      meet(w, p.id, `Works with you at ${loc(w, me.workplaceId!).name}`)
      addNews(w, 'personal', 'New face at work', `You got talking to ${fullName(p)} on your shift.`)
    }
  }
}
