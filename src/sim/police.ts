import { chance, int, next, pick } from './rng'
import type { Case, CaseType, Evidence, Minute, PoliceTask, TaskKind, Victim, World } from './types'
import { DAY, HOUR, fmtTime } from './time'
import { ITEMS } from './items'
import { addEvidence, addNews, describeJob, fullName, meet, loc, nameOf, peopleAt, person, uid, whereIs } from './world'
import { concealmentNow } from './bodies'
import { policeCall, send, worriedMessages } from './messages'
import { nameTheKiller } from './urge'
import { crackdown } from './patrol'
import { arrestPlayer } from './legal'
import { storageKnownToPolice, trophiesFound } from './underworld'
import { doubtCharges, hasSample, questionInnocent, sampleMatch } from './frame'
import { isChild } from './population'
import { anger, angerColdDays, angerFade, angerHeat, angerSpeed, angerTips, camerasInTheNews } from './anger'

/** Base hours each investigative step takes. */
const TASK_HOURS: Record<TaskKind, number> = {
  employer_check: 24, bank_records: 36, interview: 3, phone_records: 20, canvass: 10, cctv_pull: 8, search_area: 12, autopsy: 36, forensics: 60,
  tower_dump: 40, purchase_check: 60, question: 16, search_warrant: 24, arrest: 4, go_cold: 24 * 10,
}

const THRESHOLD = { question: 0.5, warrant: 1.1, arrest: 1.7, innocentQuestion: 0.9, innocentArrest: 1.6 }

function log(w: World, c: Case, text: string, scanner?: string) {
  c.log.push({ time: w.time, text, scanner })
  if (scanner && (w.player.inventory.scanner ?? 0) > 0) addNews(w, 'scanner', scanner)
}

function queue(w: World, c: Case, kind: TaskKind, opts: Partial<PoliceTask> = {}, key?: string) {
  const k = key ?? `${kind}:${opts.locationId ?? ''}:${opts.districtId ?? ''}:${opts.personId ?? ''}`
  if (c.done.includes(k)) return
  c.done.push(k)
  // A task force works faster; every child you've killed makes every detective faster still.
  const speed = kind === 'go_cold' ? 1 : (w.taskForce ? 0.6 : 1) * angerSpeed(w)
  const hours = TASK_HOURS[kind] * speed * (0.8 + next(w.rng) * 0.4)
  c.tasks.push({ id: uid(w, 't'), kind, dueAt: w.time + Math.round(hours * HOUR), ...opts })
}

export function openCase(w: World, victimId: string, type: CaseType, reason: string): Case {
  const c: Case = {
    id: uid(w, 'case'), victimId, type, openedAt: w.time, status: 'open', log: [], tasks: [], done: [],
    suspicion: {}, lastProgress: w.time, child: isChild(person(w, victimId)),
  }
  w.cases.push(c)
  log(w, c, reason, `Dispatch: new ${type} case — ${nameOf(w, victimId)}.`)
  queue(w, c, 'go_cold')
  return c
}

export function caseFor(w: World, victimId: string) {
  return w.cases.find((c) => c.victimId === victimId)
}

// ---------------------------------------------------------------- missing persons

export function fileMissingReport(w: World, v: Victim, reporterId: string | undefined) {
  v.reportedAt = w.time
  v.reporterId = reporterId
  const p = person(w, v.personId)
  const who = reporterId ? `${nameOf(w, reporterId)} (${p.relations.find((r) => r.personId === reporterId)?.type ?? 'acquaintance'})` : 'the building landlord'
  if (reporterId) meet(w, reporterId, `In the news (reported ${p.first} missing)`)
  const c = openCase(w, v.personId, 'missing', `Missing person report filed by ${who}.`)
  v.caseId = c.id
  queue(w, c, 'interview')
  queue(w, c, 'phone_records')
  worriedMessages(w, v.personId)
  if (c.child) {
    // Amber alert: every district, every patrol car, every phone in the city buzzing.
    outrage(w, 0.15 + 0.12 * anger(w))
    camerasInTheNews(w)
    addNews(w, 'news', `AMBER ALERT: ${fullName(p)}, ${p.age}`, `${p.first} has not been seen since ${fmtTime(v.killedAt)}. Police have cancelled all leave. Volunteers are searching parks, woods and waterways across ${w.cityName}.`, true)
    return
  }
  addNews(w, 'news', `Search underway for missing ${fullName(p)}, ${p.age}`, `${fullName(p)}, ${/^[aeiou]/i.test(describeJob(p)) ? 'an' : 'a'} ${describeJob(p)} from ${loc(w, p.homeId).name}, was reported missing by ${who}. Police are asking anyone with information to come forward.`, true)
}

// ---------------------------------------------------------------- bodies

export function bodyFound(w: World, v: Victim, how: string) {
  v.foundAt = w.time
  const p = person(w, v.personId)
  const where = loc(w, v.bodyLocationId)
  let c = v.caseId ? w.cases.find((x) => x.id === v.caseId) : undefined
  if (c) {
    c.type = 'homicide'
    c.status = 'open'
    log(w, c, `Body found: ${how}. Case upgraded to homicide.`, `All units: body located at ${where.name}. Crime scene unit en route.`)
  } else {
    c = openCase(w, v.personId, 'homicide', `Body found: ${how}.`)
    v.caseId = c.id
  }
  c.lastProgress = w.time
  crackdown(w, where.districtId, c.id)
  queue(w, c, 'autopsy')
  queue(w, c, 'forensics')
  queue(w, c, 'canvass', { locationId: where.id, around: w.time, windowMin: 3 * DAY })
  if (!c.done.some((k) => k.startsWith('phone_records'))) queue(w, c, 'phone_records')
  if (v.phone === 'left') discoverWhere(w, c, (e) => e.kind === 'phone_ping' && e.victimId === v.personId)
  if (c.child) {
    outrage(w, 0.2 + 0.12 * anger(w))
    if (!v.reportedAt) camerasInTheNews(w)
    addNews(w, 'news', `${w.cityName} in mourning: ${p.first}, ${p.age}`, `The body of ${fullName(p)} was found at ${where.name}. The mayor has offered a $50,000 reward. Police say they will not stop until someone is in custody.`, true)
    return
  }
  addNews(w, 'news', `Body found at ${where.name}`, `The body of ${fullName(p)} (${p.age}) was discovered — ${how}. Police are treating the death as suspicious.`, true)
}

// ---------------------------------------------------------------- suspicion

export function recomputeSuspicion(w: World, c: Case) {
  // Several pieces of the same kind (e.g. seven witnesses) corroborate each other with
  // diminishing returns; different kinds of evidence add up.
  const miss: Record<string, Record<string, number>> = {}
  const flat: Record<string, number> = {}
  for (const e of w.evidence) {
    if (!e.discovered || e.caseId !== c.id || !e.pointsTo) continue
    if (e.needsSample && !hasSample(w, e.pointsTo)) continue
    if (e.strength < 0) {
      flat[e.pointsTo] = (flat[e.pointsTo] ?? 0) + e.strength
      continue
    }
    const byKind = (miss[e.pointsTo] ??= {})
    byKind[e.kind] = (byKind[e.kind] ?? 1) * (1 - Math.min(0.95, e.strength / 1.5))
  }
  const s: Record<string, number> = { ...flat }
  for (const [pid, byKind] of Object.entries(miss)) {
    for (const m of Object.values(byKind)) s[pid] = (s[pid] ?? 0) + (1 - m) * 1.5
  }
  c.suspicion = s
}

/** Total police suspicion on the player across every case. */
export function playerHeat(w: World): number {
  const pid = w.player.personId
  // The more children you've killed, the less benefit of the doubt you get — on every case.
  const vals = w.cases.filter((c) => c.status !== 'closed').map((c) => (c.suspicion[pid] ?? 0) * angerHeat(w)).filter((v) => v > 0)
  const sum = vals.reduce((a, b) => a + b, 0)
  return vals.length >= 2 ? sum * 1.25 : sum
}

function escalate(w: World, c: Case) {
  if (c.status !== 'open') return
  const pid = w.player.personId
  const heat = playerHeat(w)
  const pending = (kind: TaskKind) => w.cases.some((x) => x.tasks.some((t) => t.kind === kind && t.personId === pid))
  if (heat >= THRESHOLD.question && !w.player.questioned && !pending('question')) queue(w, c, 'question', { personId: pid }, `question:${pid}:${w.time}`)
  else if (heat >= THRESHOLD.warrant && w.player.questioned && !w.player.searched && !pending('search_warrant')) queue(w, c, 'search_warrant', { personId: pid }, `warrant:${pid}`)
  else if (heat >= THRESHOLD.arrest && w.player.searched && !pending('arrest')) queue(w, c, 'arrest', { personId: pid }, `arrest:${pid}`)

  // Innocent people can become suspects too.
  for (const [id, v] of Object.entries(c.suspicion)) {
    if (id === pid) continue
    if (v >= THRESHOLD.innocentArrest) queue(w, c, 'arrest', { personId: id }, `arrest:${id}`)
    else if (v >= THRESHOLD.innocentQuestion) queue(w, c, 'question', { personId: id }, `question:${id}`)
  }
}

function discoverWhere(w: World, c: Case, pred: (e: Evidence) => boolean): Evidence[] {
  const found = w.evidence.filter((e) => !e.discovered && pred(e))
  for (const e of found) {
    e.discovered = true
    e.discoveredAt = w.time
    e.caseId = c.id
    if (e.kind === 'witness') {
      // Memories fade — slower when it was a child they saw.
      const days = (w.time - e.time) / DAY
      e.strength *= Math.max(0.3, 1 - days * 0.07 * (c.child ? angerFade(w) : 1))
    }
  }
  if (found.length) c.lastProgress = w.time
  return found
}

/** Hand evidence straight to a case (e.g. a surviving victim's statement). */
export function reportEvidence(w: World, c: Case, ids: string[]) {
  afterDiscovery(w, c, discoverWhere(w, c, (e) => ids.includes(e.id)))
}

export function queueTask(w: World, c: Case, kind: TaskKind, opts: Partial<PoliceTask> = {}, key?: string) {
  queue(w, c, kind, opts, key)
}

function afterDiscovery(w: World, c: Case, found: Evidence[]) {
  for (const e of found) log(w, c, `Evidence: ${e.description}`)
  // DNA from someone already swabbed matches straight away.
  const extra = found.flatMap((e) => sampleMatch(w, e)).map((e) => e.id)
  if (extra.length) for (const e of discoverWhere(w, c, (x) => extra.includes(x.id))) log(w, c, `Evidence: ${e.description}`)
  recomputeSuspicion(w, c)
  escalate(w, c)
}

// ---------------------------------------------------------------- tasks

function runTask(w: World, c: Case, t: PoliceTask) {
  const v = w.victims.find((x) => x.personId === c.victimId)
  const victim = person(w, c.victimId)
  const L = t.locationId ? loc(w, t.locationId) : undefined

  switch (t.kind) {
    case 'interview': {
      if (!v) break
      const lastSeenAt = v.killedAt - 2 * HOUR
      const lastLoc = loc(w, whereIs(victim, lastSeenAt))
      c.lastKnownLocationId = lastLoc.id
      log(w, c, `Interviewed reporter. ${victim.first} was last known to be at ${lastLoc.name} around ${fmtTime(lastSeenAt)}.`, `Detectives canvassing near ${lastLoc.name}.`)
      queue(w, c, 'canvass', { locationId: lastLoc.id, around: lastSeenAt, windowMin: 2 * DAY })
      queue(w, c, 'cctv_pull', { locationId: lastLoc.id, around: lastSeenAt, windowMin: 6 * HOUR })
      const partner = victim.relations.find((r) => r.type === 'partner')
      if (partner && person(w, partner.personId).alive) {
        const e = addEvidence(w, { kind: 'statement', via: 'canvass', time: w.time, victimId: victim.id, pointsTo: partner.personId, strength: 0.25, description: `Partner ${nameOf(w, partner.personId)} has no verified alibi.` })
        afterDiscovery(w, c, discoverWhere(w, c, (x) => x === e))
      }
      break
    }
    case 'phone_records': {
      const found = discoverWhere(w, c, (e) => e.via === 'phone_records' && e.victimId === c.victimId)
      const recent = w.calls.filter((x) => (x.from === victim.id || x.to === victim.id) && x.time > w.time - 7 * DAY)
      log(w, c, `Phone records pulled: ${recent.length} calls in the last week, ${recent.filter((x) => x.to === victim.id && !x.answered).length} unanswered.`, `Carrier returned records for ${victim.phone}.`)
      for (const e of found) {
        if (e.kind === 'bank' && e.locationId) {
          log(w, c, `The victim's bank card was used at ${loc(w, e.locationId).name} after they vanished.`, 'Detectives requesting ATM footage.')
          queue(w, c, 'cctv_pull', { locationId: e.locationId, around: e.time, windowMin: HOUR }, `atm:${e.id}`)
          continue
        }
        if (e.kind !== 'phone_ping' || !e.locationId) continue
        if (v && !v.foundAt && e.locationId === v.bodyLocationId) queue(w, c, 'search_area', { locationId: e.locationId })
        queue(w, c, 'canvass', { locationId: e.locationId, around: e.time, windowMin: 2 * DAY })
        queue(w, c, 'cctv_pull', { locationId: e.locationId, around: e.time, windowMin: 4 * HOUR })
        queue(w, c, 'tower_dump', { districtId: e.districtId, around: e.time, windowMin: 2 * HOUR })
      }
      afterDiscovery(w, c, found)
      break
    }
    case 'canvass': {
      if (!L) break
      const found = discoverWhere(w, c, (e) => e.via === 'canvass' && e.locationId === L.id && Math.abs(e.time - (t.around ?? w.time)) <= (t.windowMin ?? DAY))
      log(w, c, found.length ? `Canvass at ${L.name}: ${found.length} people came forward.` : `Canvass at ${L.name}: nobody saw anything.`, `Officers knocking doors around ${L.name}.`)
      afterDiscovery(w, c, found)
      break
    }
    case 'cctv_pull': {
      if (!L) break
      if (!L.cameras.length) {
        log(w, c, `No cameras at ${L.name}.`)
        break
      }
      const inWindow = (e: Evidence) => e.via === 'cctv_pull' && e.locationId === L.id && Math.abs(e.time - (t.around ?? w.time)) <= (t.windowMin ?? 6 * HOUR)
      const expired = w.evidence.filter((e) => !e.discovered && inWindow(e) && (e.expiresAt ?? Infinity) <= w.time)
      const found = discoverWhere(w, c, (e) => inWindow(e) && (e.expiresAt ?? Infinity) > w.time)
      let msg = `CCTV reviewed at ${L.name}: ${found.length ? `${found.length} relevant clip(s)` : 'nothing useful'}.`
      if (expired.length) msg += ` Some footage had already been overwritten.`
      log(w, c, msg, `Requesting security footage from ${L.name}.`)
      afterDiscovery(w, c, found)
      break
    }
    case 'search_area': {
      if (!L || !v || v.foundAt) break
      log(w, c, `Search team and dogs deployed at ${L.name}.`, `K9 unit requested at ${L.name}.`)
      if (v.bodyLocationId === L.id && chance(w.rng, 1 - concealmentNow(w, v))) bodyFound(w, v, `found by a police search team at ${L.name}`)
      else log(w, c, `Search of ${L.name} turned up nothing.`)
      break
    }
    case 'autopsy': {
      if (!v) break
      const days = (w.time - v.killedAt) / DAY
      const spread = Math.round((1.5 + days * (v.disposal === 'sink' ? 6 : 3)) * HOUR)
      const offset = int(w.rng, -spread / 2, spread / 2)
      c.todEstimate = { from: v.killedAt + offset - spread, to: v.killedAt + offset + spread }
      const cause = v.weapon === 'pistol' ? 'a gunshot wound (9mm)' : v.weapon === 'knife' ? 'sharp force injuries' : v.weapon === 'rope' ? 'ligature strangulation' : 'manual strangulation'
      log(w, c, `Autopsy: cause of death ${cause}. Estimated time of death ${fmtTime(c.todEstimate.from)} – ${fmtTime(c.todEstimate.to)}.`, `ME report filed for ${victim.first} ${victim.last}.`)
      const body = loc(w, v.bodyLocationId)
      const mid = (c.todEstimate.from + c.todEstimate.to) / 2
      const win = (c.todEstimate.to - c.todEstimate.from) / 2 + DAY
      queue(w, c, 'cctv_pull', { locationId: body.id, around: mid, windowMin: win })
      queue(w, c, 'tower_dump', { districtId: body.districtId, around: mid, windowMin: (c.todEstimate.to - c.todEstimate.from) / 2 })
      queue(w, c, 'purchase_check')
      // Serial link: same method (bullets from the same gun link for certain).
      const others = w.victims.filter((o) => o !== v && o.foundAt && o.weapon === v.weapon)
      if (others.length && !w.taskForce) {
        w.taskForce = true
        addNews(w, 'news', 'Police link deaths — task force formed', `Investigators believe the deaths of ${[v, ...others].map((o) => nameOf(w, o.personId)).join(' and ')} may be connected. A dedicated task force has been assigned.`, true)
      }
      // Three linked murders and the press has its serial killer — and a name for them.
      if (others.length >= 2) nameTheKiller(w, [...others, v])
      // Someone already charged for one of these was in a cell when this happened.
      doubtCharges(w, others.map((o) => o.personId), v.killedAt)
      break
    }
    case 'forensics': {
      const found = discoverWhere(w, c, (e) => e.via === 'forensics' && e.victimId === c.victimId)
      log(w, c, found.length ? `Forensics returned ${found.length} result(s).` : 'Forensics: scene was clean.', 'Crime lab results are in.')
      afterDiscovery(w, c, found)
      break
    }
    case 'tower_dump': {
      const around = t.around ?? w.time
      const win = t.windowMin ?? 2 * HOUR
      const found = discoverWhere(w, c, (e) => e.via === 'tower_dump' && e.districtId === t.districtId && Math.abs(e.time - around) <= win)
      // Innocent phones in the area add noise.
      const area = w.locations.filter((l) => l.districtId === t.districtId).flatMap((l) => peopleAt(w, l.id, around)).filter((p) => p.phone !== '—')
      for (let i = 0; i < Math.min(3, area.length); i++) {
        const p = pick(w.rng, area)
        if (p.id === c.victimId) continue
        const e = addEvidence(w, { kind: 'tower_dump', via: 'tower_dump', time: around, districtId: t.districtId, victimId: c.victimId, pointsTo: p.id, strength: 0.08, description: `${fullName(p)}'s phone was in the area.` })
        found.push(...discoverWhere(w, c, (x) => x === e))
      }
      log(w, c, `Tower dump for ${w.districts.find((d) => d.id === t.districtId)?.name}: ${found.length} phone(s) of interest.`, 'Warrant served on carriers for a tower dump.')
      afterDiscovery(w, c, found)
      break
    }
    case 'purchase_check': {
      if (!v) break
      const relevant = new Set<string>([v.weapon, 'bleach', 'tarp', ...(v.disposal === 'bury' || v.disposal === 'foundation' ? ['shovel'] : []), ...(v.disposal === 'sink' ? ['weights'] : [])])
      const found = discoverWhere(w, c, (e) => e.via === 'purchase_check' && !!e.item && relevant.has(e.item) && e.time <= v.killedAt + DAY && e.time >= v.killedAt - 21 * DAY)
      log(w, c, `Checked local store records for ${[...relevant].map((i) => ITEMS[i as keyof typeof ITEMS]?.name ?? i).join(', ')}: ${found.length} card purchase(s).`, 'Detectives requesting sales records from local stores.')
      afterDiscovery(w, c, found)
      break
    }
    case 'question': {
      if (!t.personId) break
      const s = person(w, t.personId)
      if (s.isPlayer) {
        policeCall(w, c)
        log(w, c, `Contacted ${fullName(s)} for questioning. Fingerprints and DNA swab taken.`)
        for (const e of w.evidence) {
          if (e.discovered && e.needsSample && e.pointsTo === s.id) {
            const mc = w.cases.find((x) => x.id === e.caseId)
            if (mc) log(w, mc, `MATCH: ${e.kind === 'dna' ? 'DNA' : 'Fingerprints'} from the ${nameOf(w, mc.victimId)} scene match ${fullName(s)}.`, `Lab reports a forensic hit in the ${person(w, mc.victimId).last} case.`)
          }
        }
        for (const x of w.cases) {
          recomputeSuspicion(w, x)
          escalate(w, x)
        }
      } else {
        log(w, c, `Questioned ${fullName(s)}. Fingerprints and DNA swab taken.`, `Person of interest brought in for questioning in the ${victim.last} case.`)
        const ids = questionInnocent(w, c, s).map((e) => e.id)
        afterDiscovery(w, c, discoverWhere(w, c, (x) => ids.includes(x.id)))
        // Their samples may match evidence in other cases too.
        for (const x of w.cases) if (x !== c) { recomputeSuspicion(w, x); escalate(w, x) }
      }
      break
    }
    case 'search_warrant': {
      w.player.searched = true
      const inv = w.player.inventory
      const finds: string[] = []
      for (const [item, victims] of Object.entries(w.player.tainted)) {
        if (!victims?.length || !(inv[item as keyof typeof inv] ?? 0)) continue
        for (const vid of victims) {
          addEvidence(w, { kind: 'search_find', via: 'search', time: w.time, victimId: vid, pointsTo: w.player.personId, strength: 0.9, description: `${ITEMS[item as keyof typeof ITEMS].name} recovered from suspect's home with traces of ${nameOf(w, vid)}.` })
          finds.push(ITEMS[item as keyof typeof ITEMS].name)
        }
      }
      if (inv.victim_phone) {
        addEvidence(w, { kind: 'search_find', via: 'search', time: w.time, victimId: c.victimId, pointsTo: w.player.personId, strength: 1.5, description: `A victim's phone was found hidden in the suspect's apartment.` })
        finds.push("a victim's phone")
      }
      for (const vid of w.player.carTraces) {
        addEvidence(w, { kind: 'search_find', via: 'search', time: w.time, victimId: vid, pointsTo: w.player.personId, strength: 0.7, description: `Blood matching ${nameOf(w, vid)} found in the suspect's car.` })
        finds.push('blood in your car')
      }
      for (const item of ['rope', 'tarp', 'weights', 'bleach', 'burner'] as const) {
        if ((inv[item] ?? 0) > 0 && !w.player.tainted[item]?.length) {
          addEvidence(w, { kind: 'search_find', via: 'search', time: w.time, victimId: c.victimId, pointsTo: w.player.personId, strength: 0.05, description: `${ITEMS[item].name} found at suspect's home.` })
        }
      }
      finds.push(...trophiesFound(w, 'home'))
      if (inv.pistol) {
        addEvidence(w, { kind: 'search_find', via: 'search', time: w.time, victimId: c.victimId, pointsTo: w.player.personId, strength: w.victims.some((x) => x.weapon === 'pistol') ? 1.4 : 0.3, description: 'An unregistered 9mm pistol found in the suspect’s home.' + (w.victims.some((x) => x.weapon === 'pistol') ? ' Ballistics match.' : '') })
        finds.push('a pistol')
      }
      // A storage unit in your own name is in your bank records, and on the warrant.
      if (storageKnownToPolice(w)) {
        const more = trophiesFound(w, 'storage')
        if (more.length) finds.push(...more.map((x) => `${x} (storage unit)`))
        log(w, c, `Storage unit #${w.player.storage!.unit} searched too.`)
      }
      const found = discoverWhere(w, c, (e) => e.via === 'search')
      log(w, c, `Search warrant executed at suspect's home. ${finds.length ? `Recovered: ${finds.join(', ')}.` : 'Nothing conclusive.'}`)
      send(w, 'police', `${fullName(person(w, w.player.personId)).split(' ')[0]}, officers are at your door with a search warrant. Don't touch anything.`, { call: true })
      addNews(w, 'personal', 'Police searched your apartment', finds.length ? `They left with: ${finds.join(', ')}. This is bad.` : `They tore the place apart and left with nothing.`, true)
      afterDiscovery(w, c, found)
      break
    }
    case 'arrest': {
      if (!t.personId) break
      const s = person(w, t.personId)
      const charge = c.type === 'assault' ? 'attempted murder' : 'murder'
      if (s.isPlayer) {
        log(w, c, `${fullName(s)} arrested and charged with ${charge}.`)
        arrestPlayer(w, `the ${charge} of ${fullName(victim)}`, 0, c.id)
      } else {
        c.status = 'closed'
        c.charged = s.id
        c.chargedAt = w.time
        meet(w, s.id, 'In the news (arrested)')
        log(w, c, `${fullName(s)} arrested and charged. Case closed.`)
        addNews(w, 'news', `Arrest made in ${victim.last} case`, `Police have charged ${fullName(s)} with the ${charge} of ${fullName(victim)}. Someone else is taking the fall.`, true)
      }
      break
    }
    case 'bank_records': {
      if (!t.personId) break
      const s = person(w, t.personId)
      const around = v?.killedAt ?? c.openedAt
      const found = discoverWhere(w, c, (e) => e.via === 'bank_records' && e.pointsTo === s.id && (e.victimId === c.victimId || Math.abs(e.time - around) < 2 * DAY))
      log(w, c, `Subpoenaed ${fullName(s)}'s bank records: ${found.length} transaction(s) of interest around the time of the crime.`, 'Financial records requested for a person of interest.')
      afterDiscovery(w, c, found)
      break
    }
    case 'employer_check': {
      if (!t.personId) break
      const s = person(w, t.personId)
      const around = v?.killedAt ?? c.openedAt
      const found = discoverWhere(w, c, (e) => e.via === 'employer' && e.pointsTo === s.id && (e.victimId === c.victimId || (!e.victimId && Math.abs(e.time - around) < 3 * DAY)))
      // A history of walking out of work is worth noting too, but weighs little.
      const pattern = w.evidence.filter((e) => e.via === 'employer' && e.pointsTo === s.id && !e.victimId).length
      log(w, c, s.workplaceId || found.length ? `Checked ${fullName(s)}'s employment records: ${pattern} unexplained absence(s) on file.` : `${fullName(s)} has no employer to check with.`, 'Detectives contacting a suspect’s employer.')
      afterDiscovery(w, c, found)
      break
    }
    case 'go_cold': {
      if (w.time - c.lastProgress >= (c.child ? angerColdDays(w) : 7) * DAY) {
        c.status = 'cold'
        log(w, c, 'No new leads in a week. Case moved to cold storage.')
        addNews(w, 'news', `${victim.last} case goes cold`, `Police say there are no new leads in the case of ${fullName(victim)}.`)
      } else {
        c.done = c.done.filter((k) => !k.startsWith('go_cold'))
        queue(w, c, 'go_cold')
      }
      break
    }
  }
}

/** Public fury after a child is taken. */
function outrage(w: World, add: number) {
  w.outrage = Math.min(1, (w.outrage ?? 0) + add)
  for (const d of w.districts) (w.patrolHeat ??= {})[d.id] = { level: 0.04 + w.outrage * 0.12, since: w.time, until: w.time + (3 + 2 * anger(w)) * DAY }
}

export function processPolice(w: World, now: Minute) {
  // The reward brings people forward who would never have called otherwise.
  for (const c of w.cases) {
    if (!c.child || c.status === 'closed' || !chance(w.rng, angerTips(w))) continue
    const e = w.evidence.find((x) => !x.discovered && x.victimId === c.victimId && (x.via === 'canvass' || x.via === 'cctv_pull') && (x.expiresAt ?? Infinity) > now)
    if (!e) continue
    log(w, c, `Reward tip line: ${e.via === 'canvass' ? 'a caller came forward' : 'a business owner handed in footage'}.`, 'Tip line ringing off the hook.')
    afterDiscovery(w, c, discoverWhere(w, c, (x) => x === e))
  }
  for (const c of w.cases) {
    const due = c.tasks.filter((t) => t.dueAt <= now)
    if (!due.length) continue
    c.tasks = c.tasks.filter((t) => t.dueAt > now)
    if (c.status === 'closed') continue
    if (c.status === 'cold' && !due.some((t) => t.kind !== 'go_cold')) continue
    for (const t of due) {
      runTask(w, c, t)
      if (w.gameOver) return
    }
  }
}
