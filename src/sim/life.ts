// Real-life pressure: obligations that fill the calendar, and love that complicates everything.
import { chance, int, next, pick } from './rng'
import type { Minute, Obligation, ObligationType, Person, World } from './types'
import { DAY, HOUR, dayOf, fmtDay, hourOf, inBlock } from './time'
import { ITEMS } from './items'
import { addEvidence, addNews, fullName, meet, person, playerLocationAt, playerPerson, uid, busyError } from './world'
import { send } from './messages'
import { schedule } from './actions'
import { reportEvidence } from './police'

const DURATION: Record<ObligationType, number> = {
  family_dinner: 2 * HOUR, birthday: 3 * HOUR, doctor: HOUR, landlord: HOUR, overtime: 2 * HOUR, date: 3 * HOUR, wedding: 4 * HOUR, night_feed: HOUR, pediatrician: HOUR, court: 3 * HOUR,
}
export const obligationDuration = (t: ObligationType) => DURATION[t]

const kindOf = (w: World, k: string) => w.locations.filter((l) => l.kind === k)

/** Try to put an obligation on the calendar at `at`. Returns false if it doesn't fit. */
/** Days before the same kind of thing (with the same person) can come up again. */
const COOLDOWN: Record<ObligationType, number> = { birthday: 365, family_dinner: 6, doctor: 25, landlord: 90, overtime: 4, date: 0, wedding: 0, night_feed: 1, pediatrician: 25, court: 0 }

function book(w: World, o: Obligation, at: Minute, announce: () => void): boolean {
  const me = playerPerson(w)
  const key = `${o.type}:${o.withPersonId ?? ''}`
  const log = (w.player.lifeLog ??= {})
  if (log[key] !== undefined && at - log[key] < COOLDOWN[o.type] * DAY) return false
  const end = at + DURATION[o.type]
  if (o.type !== 'overtime' && w.player.employed && me.shift) {
    for (let t = at; t < end; t += HOUR) if (inBlock(t, me.shift)) return false
  }
  if (schedule(w, { kind: 'obligation', obligation: o }, at)) return false
  const s = w.player.agenda.find((x) => x.activity.kind === 'obligation' && x.startAt === at)
  if (s) s.fixed = true
  log[key] = at
  announce()
  return true
}

/** Each morning, life may hand you something to do in the coming days. */
export function generateObligations(w: World, t: Minute) {
  if (hourOf(t) !== 7) return
  const me = playerPerson(w)
  const r = w.rng
  const dayAhead = (d: number, h: number) => (dayOf(t) + d) * DAY + h * HOUR

  // Dates keep a relationship alive.
  const rom = w.player.romance
  if (rom && (rom.status === 'dating' || rom.status === 'engaged') && chance(r, 0.35)) {
    const p = person(w, rom.personId)
    const place = pick(r, [...kindOf(w, 'restaurant'), ...kindOf(w, 'bar'), ...kindOf(w, 'park')])
    const at = dayAhead(int(r, 1, 4), pick(r, [19, 20]))
    book(w, { type: 'date', title: `Date with ${p.first}`, locationId: place.id, withPersonId: p.id }, at, () =>
      send(w, p.id, `${fmtDay(at)}, ${hourOf(at)}:00 at ${place.name}? ❤️ don't you dare stand me up`))
  }

  // A baby doesn't care what you had planned tonight.
  const baby = w.player.childId ? person(w, w.player.childId) : undefined
  if (baby && chance(r, 0.55)) {
    const at = dayAhead(int(r, 1, 2), 2)
    book(w, { type: 'night_feed', title: `Night feed — ${baby.first}`, locationId: me.homeId, withPersonId: w.player.romance?.personId }, at, () => {})
  }
  if (baby && chance(r, 0.12)) {
    const place = pick(r, kindOf(w, 'hospital'))
    const at = dayAhead(int(r, 2, 6), 10)
    book(w, { type: 'pediatrician', title: `${baby.first}'s check-up`, locationId: place.id }, at, () =>
      addNews(w, 'personal', 'Pediatrician booked', `${place.name}, ${fmtDay(at)} at 10:00.`))
  }

  if (!chance(r, 0.45)) return
  const family = me.relations.filter((x) => x.type === 'family' && person(w, x.personId).alive)
  const friends = me.relations.filter((x) => x.type === 'friend' && person(w, x.personId).alive)
  const roll = next(r)
  for (let tries = 0; tries < 3; tries++) {
    const d = int(r, 1, 6)
    if (roll < 0.3 && family.length) {
      const f = person(w, pick(r, family).personId)
      const place = pick(r, kindOf(w, 'restaurant'))
      const at = dayAhead(d, 19)
      if (book(w, { type: 'family_dinner', title: `Dinner with ${f.first}`, locationId: place.id, withPersonId: f.id }, at, () =>
        send(w, f.id, `Family dinner ${fmtDay(at)} at 7, ${place.name}. You're coming. No excuses this time.`))) return
    } else if (roll < 0.55 && friends.length) {
      const f = person(w, pick(r, friends).personId)
      const place = pick(r, kindOf(w, 'bar'))
      const at = dayAhead(d, 20)
      if (book(w, { type: 'birthday', title: `${f.first}'s birthday`, locationId: place.id, withPersonId: f.id }, at, () =>
        send(w, f.id, `it's my birthday!! 🎂 ${fmtDay(at)} 8pm at ${place.name}, you better be there`))) return
    } else if (roll < 0.7) {
      const place = pick(r, kindOf(w, 'hospital'))
      const at = dayAhead(d, pick(r, [9, 11, 15]))
      if (book(w, { type: 'doctor', title: 'Doctor’s appointment', locationId: place.id }, at, () =>
        addNews(w, 'personal', 'Appointment booked', `${place.name}, ${fmtDay(at)} at ${hourOf(at)}:00. No-shows are charged $60.`))) return
    } else if (roll < 0.82) {
      const at = dayAhead(d, pick(r, [10, 14]))
      if (book(w, { type: 'landlord', title: 'Landlord inspection', locationId: me.homeId }, at, () =>
        send(w, 'landlord', `Annual inspection of your apartment ${fmtDay(at)} at ${hourOf(at)}:00. I'll let myself in if you're not there.`))) return
    } else if (w.player.employed && me.shift && me.workplaceId) {
      // Overtime straight after a shift.
      for (let k = 1; k < 7; k++) {
        const at = dayAhead(k, Math.floor(me.shift.end % 24))
        if (!inBlock(at - HOUR, me.shift)) continue
        if (book(w, { type: 'overtime', title: 'Overtime at work', locationId: me.workplaceId }, at, () =>
          send(w, w.player.bossId ?? `hr:${me.workplaceId}`, `Need you to stay two extra hours on ${fmtDay(at)}. Paid. Not optional.`))) return
      }
      return
    }
  }
}

/** Things at home that a landlord would not want to see. */
function suspiciousAtHome(w: World): string[] {
  const inv = w.player.inventory
  const out: string[] = []
  if (inv.victim_phone) out.push('a stranger’s phone')
  for (const [item, victims] of Object.entries(w.player.tainted)) if (victims?.length && inv[item as keyof typeof inv]) out.push(`a ${ITEMS[item as keyof typeof ITEMS].name.toLowerCase()} with stains`)
  if ((inv.weights ?? 0) && (inv.tarp ?? 0)) out.push('chains and a tarp')
  return out
}

/** Obligation went ahead with the player there. */
export function attendObligation(w: World, o: Obligation) {
  const me = playerPerson(w)
  const rel = o.withPersonId ? me.relations.find((x) => x.personId === o.withPersonId) : undefined
  if (rel) rel.closeness = Math.min(1, rel.closeness + 0.08)
  const rom = w.player.romance
  switch (o.type) {
    case 'doctor':
      w.player.money -= 30
      addNews(w, 'personal', 'Check-up done', 'Co-pay: $30. The doctor says you look tired.')
      break
    case 'overtime':
      w.player.money += 60
      addNews(w, 'personal', 'Overtime done', '+$60.')
      break
    case 'landlord':
      addNews(w, 'personal', 'Inspection passed', suspiciousAtHome(w).length ? 'You kept the landlord out of the bedroom. Close call.' : 'Nothing to report.')
      break
    case 'date':
      if (rom) rom.affection = Math.min(1, rom.affection + 0.15)
      addNews(w, 'personal', o.title, 'It went well.')
      break
    case 'wedding':
      if (rom) marry(w)
      break
    case 'night_feed':
      if (rom) rom.affection = Math.min(1, rom.affection + 0.04)
      break
    case 'court':
      break
    case 'pediatrician':
      w.player.money -= 40
      addNews(w, 'personal', o.title, 'Healthy and growing. Co-pay $40.')
      break
    default:
      for (const p of w.people.filter((x) => x.alive && !x.isPlayer && x.homeId === person(w, o.withPersonId!).homeId)) meet(w, p.id, `Met at ${o.title.toLowerCase()}`)
      addNews(w, 'personal', o.title, 'You showed up. They were happy to see you.')
  }
}

/** Player skipped an obligation (cancelled it). */
export function skipObligation(w: World, o: Obligation) {
  const me = playerPerson(w)
  const rel = o.withPersonId ? me.relations.find((x) => x.personId === o.withPersonId) : undefined
  if (rel) rel.closeness = Math.max(0.05, rel.closeness - 0.2)
  const rom = w.player.romance
  switch (o.type) {
    case 'family_dinner':
      send(w, o.withPersonId!, pick(w.rng, ['We waited an hour. Thanks a lot.', 'Your mother cried. I hope whatever you were doing was worth it.', 'Unbelievable.']))
      break
    case 'birthday':
      send(w, o.withPersonId!, pick(w.rng, ['wow. ok. thanks for coming 🙃', 'everyone asked where you were']))
      break
    case 'doctor':
      w.player.money -= 60
      addNews(w, 'personal', 'No-show fee', 'The clinic charged you $60.')
      break
    case 'overtime': {
      w.player.missedShifts++
      send(w, w.player.bossId ?? `hr:${me.workplaceId}`, 'You walked out on overtime. That’s a strike.')
      break
    }
    case 'landlord': {
      const seen = suspiciousAtHome(w).filter(() => chance(w.rng, 0.6))
      if (seen.length) {
        send(w, 'landlord', `I did the inspection. I saw ${seen.join(' and ')}. I don't want any trouble in my building.`)
        // The landlord talks. If police are looking at anything, it reaches them.
        const e = addEvidence(w, { kind: 'statement', via: 'canvass', time: w.time, locationId: me.homeId, pointsTo: me.id, strength: 0.35, description: `Landlord reports seeing ${seen.join(' and ')} in ${fullName(me)}'s apartment.` })
        const open = [...w.cases].reverse().find((c) => c.status === 'open' && c.type !== 'assault')
        if (open) reportEvidence(w, open, [e.id])
      } else send(w, 'landlord', 'Inspection done. All fine.')
      break
    }
    case 'date':
      if (rom) {
        rom.affection -= 0.25
        send(w, rom.personId, pick(w.rng, ['I sat there alone for an hour.', 'you stood me up. seriously?', 'Forget it.']))
        if (rom.affection <= 0) breakUp(w, 'They ended it. Too many no-shows.')
      }
      break
    case 'wedding':
      if (rom) breakUp(w, 'You didn’t show up to your own wedding.')
      break
    case 'night_feed':
      if (rom) {
        rom.affection -= 0.12
        rom.suspicion += 0.1
        send(w, rom.personId, pick(w.rng, ['The baby screamed for an hour. Where WERE you?', 'I did the night feed alone. Again.', 'You weren’t in bed. You weren’t in the house. Explain.']))
      }
      break
    case 'court':
      addNews(w, 'personal', 'You skipped your trial', 'They will come looking.')
      break
    case 'pediatrician':
      w.player.money -= 60
      addNews(w, 'personal', 'Missed the pediatrician', 'No-show fee $60.')
      break
  }
}

// ---------------------------------------------------------------- romance

export function canAskOut(w: World, p: Person): string | null {
  const me = playerPerson(w)
  if (w.player.romance && w.player.romance.status !== 'asked') return 'You’re already seeing someone.'
  if (w.player.romance?.status === 'asked') return 'You’re waiting on an answer.'
  if (!p.alive || p.isPlayer) return 'Not possible.'
  if (p.age < 21) return 'Too young.'
  if (Math.abs(p.age - me.age) > 14) return 'The age gap is too big.'
  if (me.relations.some((x) => x.personId === p.id && x.type === 'family')) return 'That’s family.'
  return null
}

export function askOut(w: World, personId: string): string | null {
  const busy = busyError(w)
  if (busy) return busy
  const p = person(w, personId)
  const err = canAskOut(w, p)
  if (err) return err
  w.player.romance = { personId, status: 'asked', affection: 0, suspicion: 0, since: w.time, replyAt: w.time + int(w.rng, 1, 5) * HOUR }
  w.player.messages.push({ id: uid(w, 'm'), thread: personId, from: 'me', text: 'Would you like to get a drink with me sometime? Just the two of us.', time: w.time, read: true })
  return null
}

export function propose(w: World): string | null {
  const busy = busyError(w)
  if (busy) return busy
  const rom = w.player.romance
  if (!rom || rom.status !== 'dating') return 'You need to be dating someone.'
  const p = person(w, rom.personId)
  if (w.player.money < 500) return 'You can’t afford a ring and a wedding ($500).'
  const days = (w.time - rom.since) / DAY
  if (days >= 10 && chance(w.rng, rom.affection)) {
    rom.status = 'engaged'
    w.player.money -= 200
    const place = pick(w.rng, [...kindOf(w, 'park'), ...kindOf(w, 'restaurant')])
    let at = (dayOf(w.time) + 7) * DAY + 15 * HOUR
    while (!book(w, { type: 'wedding', title: `Wedding with ${p.first}`, locationId: place.id, withPersonId: p.id }, at, () => {})) at += DAY
    send(w, p.id, `YES!!! 💍 ${fmtDay(at)}, 3pm at ${place.name}. I love you.`)
  } else {
    rom.affection -= 0.2
    send(w, p.id, days < 10 ? 'Whoa. That’s… way too fast. I need some space.' : 'I’m sorry. I’m not ready for that.')
  }
  return null
}

function marry(w: World) {
  const rom = w.player.romance!
  const me = playerPerson(w)
  const p = person(w, rom.personId)
  rom.status = 'married'
  rom.affection = Math.min(1, rom.affection + 0.2)
  w.player.money -= 300
  // Old household ties loosen; the spouse moves in.
  p.relations = p.relations.filter((x) => x.type !== 'partner')
  for (const o of w.people) o.relations = o.relations.filter((x) => !(x.personId === p.id && x.type === 'partner'))
  p.homeId = me.homeId
  const set = (a: Person, b: Person) => {
    a.relations = a.relations.filter((x) => x.personId !== b.id)
    a.relations.push({ personId: b.id, type: 'partner', closeness: 0.95 })
  }
  set(me, p)
  set(p, me)
  w.player.personIntel[p.id] = { researched: true, tailed: true, knowsHabit: true, knowsShift: true, knowsHome: true, knowsLivesAlone: true }
  addNews(w, 'personal', `You married ${fullName(p)}`, `${p.first} moved in with you. Someone is home every night now.`, true)
}

function breakUp(w: World, why: string) {
  const rom = w.player.romance
  if (!rom) return
  const p = person(w, rom.personId)
  if (rom.status === 'married') {
    // They move out.
    const homes = w.locations.filter((l) => l.kind === 'apartment' && l.id !== p.homeId)
    p.homeId = pick(w.rng, homes).id
    const me = playerPerson(w)
    me.relations = me.relations.filter((x) => x.personId !== p.id)
    p.relations = p.relations.filter((x) => x.personId !== me.id)
  }
  w.player.romance = undefined
  addNews(w, 'personal', `It's over with ${p.first}`, why, true)
}

// ---------------------------------------------------------------- hourly

export function processLife(w: World, t: Minute) {
  generateObligations(w, t)
  if (w.player.babyDue && t >= w.player.babyDue) birth(w)
  const rom = w.player.romance
  if (!rom) return
  const p = person(w, rom.personId)
  if (!p.alive) {
    w.player.romance = undefined
    return
  }
  if (rom.status === 'asked' && rom.replyAt && t >= rom.replyAt) {
    const me = playerPerson(w)
    const rel = me.relations.find((x) => x.personId === p.id)
    const taken = p.relations.some((x) => x.type === 'partner')
    const odds = (taken ? 0.08 : 0.35) + (rel ? rel.closeness * 0.4 : 0)
    if (chance(w.rng, odds)) {
      Object.assign(rom, { status: 'dating', affection: 0.45, since: t })
      send(w, p.id, pick(w.rng, ['I’d love that 😊', 'Took you long enough. Yes.', 'ok yes!! when?']))
      if (!rel) me.relations.push({ personId: p.id, type: 'friend', closeness: 0.5 })
    } else {
      w.player.romance = undefined
      send(w, p.id, taken ? 'I’m seeing someone, sorry.' : pick(w.rng, ['That’s sweet, but I don’t think so.', 'I don’t really see you that way. Sorry.']))
    }
    return
  }
  if (hourOf(t) === 0) rom.affection = Math.max(0, rom.affection - 0.01)

  // A spouse notices when you're not in bed.
  if (rom.status === 'married') {
    const h = hourOf(t)
    const out = w.player.agenda.find((s) => s.started && t >= s.startAt && t < s.endAt && s.activity.kind !== 'obligation')
    if (out && (h >= 23 || h < 5)) {
      rom.suspicion = Math.min(1.2, rom.suspicion + (w.player.childId ? 0.15 : 0.1)) // up with the baby, they notice
      rom.noticedNightOut = true
    }
    if (h === 8 && rom.noticedNightOut) {
      rom.noticedNightOut = false
      send(w, p.id, pick(w.rng, ['Where were you last night? I woke up and you were gone.', 'You came home at 4am. Again. Talk to me.', 'Why does the car smell like bleach?']), {
        choices: [
          { id: 'drive', label: 'Couldn’t sleep. Went for a drive.' },
          { id: 'work', label: 'Work stuff. Don’t worry about it.' },
          { id: 'angry', label: 'Stop checking up on me.' },
        ],
        action: { kind: 'spouse' },
      })
    }
    if (rom.suspicion >= 1) {
      // They've seen enough.
      const e = addEvidence(w, { kind: 'statement', via: 'canvass', time: t, locationId: p.homeId, pointsTo: w.player.personId, strength: 0.5, description: `${fullName(p)} told police their spouse disappears at night and comes back acting strange.` })
      const open = [...w.cases].reverse().find((c) => c.status === 'open' && c.type !== 'assault')
      if (open) reportEvidence(w, open, [e.id])
      breakUp(w, `${p.first} packed a bag and left. They said they were scared of you.`)
    }
  }
}

export function answerSpouse(w: World, choice: string) {
  const rom = w.player.romance
  if (!rom) return
  if (choice === 'drive') rom.suspicion += 0.05
  if (choice === 'work') rom.suspicion += w.player.employed ? 0 : 0.15
  if (choice === 'angry') {
    rom.suspicion += 0.15
    rom.affection -= 0.15
  }
  send(w, rom.personId, choice === 'angry' ? 'Fine.' : pick(w.rng, ['ok…', 'I just worry about you.', 'Ok. Come to bed earlier, please.']))
}

/** Would the spouse back up "I was home"? */
export function spouseAlibi(w: World, truthAt: Minute): { strength: number; text: string } | null {
  const rom = w.player.romance
  if (!rom || rom.status !== 'married') return null
  const p = person(w, rom.personId)
  // Out at night during the crime: a loving, trusting spouse covers for you; anyone else tells the truth.
  if (playerLocationAt(w, truthAt) === playerPerson(w).homeId) return { strength: -0.3, text: `${fullName(p)} confirms their spouse was home.` }
  if (rom.affection > 0.75 && rom.suspicion < 0.3) return { strength: -0.35, text: `${fullName(p)} insists their spouse was home all night.` }
  return { strength: 0.5, text: `${fullName(p)} says their spouse was NOT home that night.` }
}

export function startFamily(w: World): string | null {
  const busy = busyError(w)
  if (busy) return busy
  const rom = w.player.romance
  if (rom?.status !== 'married') return 'You need to be married first.'
  if (w.player.childId || w.player.babyDue) return 'One is plenty for now.'
  if (rom.affection < 0.5) return 'Things aren’t good enough between you two for that.'
  w.player.babyDue = w.time + 21 * DAY
  send(w, rom.personId, 'I’m pregnant!!! 😭❤️ three weeks to go, can you believe it')
  return null
}

function birth(w: World) {
  const me = playerPerson(w)
  const rom = w.player.romance
  const id = `p${++w.counter}`
  const gender = chance(w.rng, 0.5) ? 'male' : 'female'
  const first = pick(w.rng, gender === 'male' ? ['Noah', 'Leo', 'Kai', 'Finn'] : ['Lily', 'Ava', 'Mila', 'Ella'])
  w.people.push({ id, gender, first, last: me.last, age: 0, job: 'Baby', pay: 0, homeId: me.homeId, phone: '—', traits: [], relations: [], alive: true, isPlayer: false, bornAt: w.time, cash: 0, savings: 0 })
  const baby = person(w, id)
  for (const parent of [me, ...(rom ? [person(w, rom.personId)] : [])]) {
    parent.relations.push({ personId: id, type: 'family', closeness: 1 })
    baby.relations.push({ personId: parent.id, type: 'family', closeness: 1 })
  }
  meet(w, id, 'Your child')
  w.player.childId = id
  w.player.babyDue = undefined
  addNews(w, 'personal', `${first} is born`, 'Someone in the house who wakes at every sound. Childcare is $450 a month.', true)
}

/** Hand someone flowers or wine. Only people in your life notice the gesture. */
export function giveGift(w: World, personId: string, item: 'flowers' | 'wine'): string | null {
  const busy = busyError(w)
  if (busy) return busy
  if (!(w.player.inventory[item] ?? 0)) return `You don’t have any ${ITEMS[item].name.toLowerCase()}.`
  const me = playerPerson(w)
  const rel = me.relations.find((x) => x.personId === personId)
  const rom = w.player.romance?.personId === personId ? w.player.romance : undefined
  if (!rel && !rom) return 'You don’t know them well enough for that.'
  w.player.inventory[item]! -= 1
  if (rel) rel.closeness = Math.min(1, rel.closeness + 0.1)
  if (rom) {
    rom.affection = Math.min(1, rom.affection + 0.15)
    rom.suspicion = Math.max(0, rom.suspicion - 0.05)
  }
  send(w, personId, pick(w.rng, item === 'flowers' ? ['omg these are beautiful 🌷', 'What’s the occasion? Thank you!!', 'You remembered I like these ❤'] : ['Ooh, opening this tonight 🍷', 'You shouldn’t have! Thanks.']))
  return null
}
