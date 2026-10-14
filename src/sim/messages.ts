import { chance, pick } from './rng'
import type { Case, Choice, Message, MessageAction, Minute, World } from './types'
import { DAY, HOUR, dayOf, fmtDay, hourOf, inBlock, nextOccurrence } from './time'
import { FIRST_NAMES, LAST_NAMES } from './names'
import { busyWith, districtName, fullName, loc, nameOf, person, playerPerson, uid } from './world'
import { queueTask, reportEvidence } from './police'
import { schedule } from './actions'
import { addEvidence } from './world'
import { answerSpouse, spouseAlibi } from './life'
import { surrender } from './urge'

export function send(w: World, thread: string, text: string, opts: Partial<Pick<Message, 'call' | 'choices' | 'expiresAt' | 'action'>> = {}): Message {
  const m: Message = { id: uid(w, 'm'), thread, from: 'them', text, time: w.time, read: false, ...opts }
  ;(w.player.messages ??= []).push(m)
  if (opts.call || opts.choices) w.pauseRequested = true
  return m
}

export function threadName(w: World, thread: string): string {
  if (thread === 'police') return `Det. ${w.player.detective ?? 'Unknown'}`
  if (thread === 'work') return 'Work'
  if (thread === 'landlord') return 'Landlord'
  if (thread === 'bank') return 'City Bank'
  if (thread === 'dealer') return 'Unknown number'
  if (thread === 'court') return 'County Court'
  if (thread.startsWith('hr:')) return `${w.locations.find((l) => l.id === thread.slice(3))?.name ?? 'Employer'} (HR)`
  return w.people.find((p) => p.id === thread) ? nameOf(w, thread) : 'Unknown number'
}

export function detective(w: World): string {
  return (w.player.detective ??= `${pick(w.rng, FIRST_NAMES)} ${pick(w.rng, LAST_NAMES)}`)
}

// ---------------------------------------------------------------- ambient life

const CHAT: Record<string, string[]> = {
  friend: ['you alive? haven’t heard from you in ages', 'lol did you see that video I sent', 'my car broke down AGAIN', 'we should catch up soon', 'ugh, this week is never ending'],
  family: ['Call your mother, she worries.', 'Sunday dinner this week?', 'Did you eat something today?', 'Your cousin got engaged!!'],
  partner: ['miss you', 'what do you want for dinner?'],
  coworker: ['did you see the email from upstairs?', 'meeting moved to 10 tomorrow', 'boss is in a MOOD today', 'can you cover for me friday?'],
  boss: ['Need that report by end of week.', 'Good work this week.'],
}

/** Friends and family text the player; sometimes with invitations. */
export function ambientMessages(w: World, t: Minute) {
  const h = hourOf(t)
  if (h < 9 || h > 22) return
  const me = playerPerson(w)
  for (const r of me.relations) {
    const p = person(w, r.personId)
    if (!p.alive || !chance(w.rng, r.closeness * 0.03)) continue
    const bars = w.locations.filter((l) => l.kind === 'bar' || l.kind === 'restaurant')
    if (r.type === 'friend' && chance(w.rng, 0.45) && bars.length) {
      const place = pick(w.rng, bars)
      const at = h < 19 ? nextOccurrence(t, 21) : nextOccurrence(t, 21) + (h >= 21 ? 0 : DAY)
      send(w, p.id, `${pick(w.rng, ['drinks', 'food', 'a couple beers'])} at ${place.name} ${dayOf(at) === dayOf(t) ? 'tonight' : 'tomorrow'} around 9? 🍻`, {
        choices: [{ id: 'yes', label: 'I’m in' }, { id: 'no', label: 'Can’t, sorry' }],
        action: { kind: 'invite', locationId: place.id, at },
        expiresAt: at,
      })
      continue
    }
    // Gossip about the news.
    const body = w.victims.find((v) => v.foundAt && t - v.foundAt < 2 * DAY)
    if (body && chance(w.rng, 0.5)) {
      send(w, p.id, pick(w.rng, [`did you hear about ${nameOf(w, body.personId)}?? that’s so messed up`, `they found a body at ${loc(w, body.bodyLocationId).name}. I’m locking my doors tonight`, `who would do that to ${person(w, body.personId).first}…`]))
      continue
    }
    send(w, p.id, pick(w.rng, CHAT[r.type] ?? CHAT.friend))
  }
}

/** Friends of a missing person reach out if the player knows them. */
export function worriedMessages(w: World, victimId: string) {
  const v = person(w, victimId)
  const me = playerPerson(w)
  const mutual = me.relations.filter((r) => v.relations.some((x) => x.personId === r.personId) && person(w, r.personId).alive)
  const direct = me.relations.some((r) => r.personId === victimId)
  for (const r of mutual.slice(0, 2)) {
    send(w, r.personId, `have you heard from ${v.first}? nobody can reach them and the police are involved now`, {
      choices: [{ id: 'no', label: 'No, nothing. That’s scary.' }, { id: 'saw', label: 'Saw them a few days ago, they seemed fine' }],
      action: { kind: 'smalltalk' },
    })
  }
  if (direct && !mutual.length) send(w, 'work', `Has anyone heard from ${v.first}? Please let us know.`)
}

// ---------------------------------------------------------------- police contact

/** Detectives call the player to ask where they were. */
export function policeCall(w: World, c: Case) {
  const name = detective(w)
  const v = w.victims.find((x) => x.personId === c.victimId)
  const about = c.todEstimate ? Math.round((c.todEstimate.from + c.todEstimate.to) / 2 / HOUR) * HOUR : (v?.killedAt ?? c.openedAt)
  const what = c.type === 'missing' ? 'disappearance' : c.type === 'assault' ? 'an attack on' : 'death'
  const subject = c.type === 'assault' ? nameOf(w, c.victimId) : `${person(w, c.victimId).first} ${person(w, c.victimId).last}'s`
  w.player.questioned = true
  w.player.samplesOnFile = true
  send(w, 'police', `This is Detective ${name}, ${w.cityName} PD. We're looking into ${c.type === 'assault' ? `${what} ${subject}` : `${subject} ${what}`}. Routine questions. Where were you on ${fmtDay(about)}, around ${String(hourOf(about)).padStart(2, '0')}:00? We'll also need you to stop by for prints and a swab — to rule you out.`, {
    call: true,
    choices: ALIBI_CHOICES,
    action: { kind: 'alibi', caseId: c.id, about },
    expiresAt: w.time + 12 * HOUR,
  })
}

const ALIBI_CHOICES: Choice[] = [
  { id: 'home', label: 'I was at home.' },
  { id: 'work', label: 'I was at work.' },
  { id: 'friends', label: 'I was out with friends.' },
  { id: 'forgot', label: 'I honestly don’t remember.' },
  { id: 'lawyer', label: 'I’m not answering without a lawyer.' },
  { id: 'confess', label: '…It was me. I did it.' },
]

function resolveAlibi(w: World, a: Extract<MessageAction, { kind: 'alibi' }>, choice: string) {
  const c = w.cases.find((x) => x.id === a.caseId)
  if (!c) return
  const me = playerPerson(w)
  const v = w.victims.find((x) => x.caseId === c.id)
  const truthAt = v?.killedAt ?? c.openedAt
  const where = v ? districtName(w, loc(w, v.killLocationId).districtId) : 'the area'
  let strength = 0
  let text = ''
  switch (choice) {
    case 'home':
      if (v?.playerPhone) { strength = 0.6; text = `${fullName(me)} claims to have been home, but phone records place them in ${where}.` }
      else { strength = -0.25; text = `${fullName(me)} says they were home. Phone records are consistent with that.` }
      break
    case 'work': {
      const scheduled = me.shift && inBlock(truthAt, me.shift)
      strength = scheduled ? 0.7 : 0.55
      text = scheduled ? `${fullName(me)} claims to have been at work — the employer says they never showed up.` : `${fullName(me)} claims to have been at work, but had no shift at that time.`
      break
    }
    case 'friends': strength = 0.45; text = `${fullName(me)} says they were out with friends. Nobody backs this up.`; break
    case 'forgot': strength = 0.2; text = `${fullName(me)} was vague about their whereabouts.`; break
    case 'lawyer': strength = 0.3; text = `${fullName(me)} refused to answer questions without a lawyer.`; break
    default: strength = 0.35; text = `${fullName(me)} ignored repeated attempts to make contact.`
  }
  const e = addEvidence(w, { kind: 'alibi', via: 'canvass', time: w.time, victimId: c.victimId, pointsTo: me.id, strength, description: text })
  const ids = [e.id]
  // Police ask whoever you live with.
  const spouse = choice === 'home' ? spouseAlibi(w, truthAt) : null
  if (spouse) ids.push(addEvidence(w, { kind: 'statement', via: 'canvass', time: w.time, victimId: c.victimId, pointsTo: me.id, strength: spouse.strength, description: spouse.text }).id)
  reportEvidence(w, c, ids)
  queueTask(w, c, 'employer_check', { personId: me.id })
  queueTask(w, c, 'bank_records', { personId: me.id })
  const reply = choice === 'silent' ? `We've been trying to reach you, ${me.first}. Don't make this harder than it needs to be.` : choice === 'lawyer' ? 'That’s your right. We’ll be in touch.' : 'Thanks. We’ll be in touch if we have more questions.'
  send(w, 'police', reply)
}

export function answer(w: World, messageId: string, choiceId: string): string | null {
  const m = w.player.messages.find((x) => x.id === messageId)
  if (!m || !m.choices || m.answered) return 'Already answered.'
  const choice = m.choices.find((c) => c.id === choiceId)
  if (!choice) return 'Invalid choice.'
  // Mid-kill, the phone stays in your pocket.
  if (busyWith(w)?.activity.kind === 'operation' && busyWith(w)!.started) return 'Not now. Your hands are full.'
  m.answered = choiceId
  m.read = true
  w.player.messages.push({ id: uid(w, 'm'), thread: m.thread, from: 'me', text: choice.label, time: w.time, read: true })
  const a = m.action
  if (a?.kind === 'invite' && choiceId === 'yes') {
    const err = schedule(w, { kind: 'visit', locationId: a.locationId }, Math.max(w.time, a.at))
    if (err) send(w, m.thread, 'wait you already have plans? nvm then 🙄')
    else send(w, m.thread, pick(w.rng, ['nice! see you there', 'yesss', '👍']))
  } else if (a?.kind === 'invite') {
    send(w, m.thread, pick(w.rng, ['boo. next time', 'you never come out anymore', 'ok :(']))
  } else if (a?.kind === 'spouse') {
    answerSpouse(w, choiceId)
  } else if (a?.kind === 'alibi' && choiceId === 'confess') {
    surrender(w, 'call')
  } else if (a?.kind === 'alibi') {
    resolveAlibi(w, a, choiceId)
  } else if (a?.kind === 'interview') {
    const app = w.player.applications?.find((x) => x.id === a.appId)
    if (!app) return null
    const err = choiceId === 'yes' ? schedule(w, { kind: 'interview', appId: app.id, locationId: app.listing.workplaceId }, Math.max(w.time, a.at)) : 'declined'
    if (err) {
      app.status = 'rejected'
      send(w, m.thread, choiceId === 'yes' ? 'Looks like that time doesn’t work for you. We’ll pass, thanks.' : 'Understood. Best of luck.')
    } else send(w, m.thread, 'Great, see you then.')
  }
  return null
}

export function decline(w: World, messageId: string) {
  const m = w.player.messages.find((x) => x.id === messageId)
  if (!m) return
  m.call = false // rings no more; the question stays in the thread
  if (m.thread === 'police') send(w, 'police', 'Missed call. Please call us back as soon as possible.')
}

/** Hourly: unanswered police questions count against you. */
export function processMessages(w: World, t: Minute) {
  for (const m of w.player.messages ?? []) {
    if (m.answered || !m.expiresAt || m.expiresAt > t) continue
    m.answered = 'expired'
    m.call = false
    if (m.action?.kind === 'alibi') resolveAlibi(w, m.action, 'silent')
  }
  ambientMessages(w, t)
}
