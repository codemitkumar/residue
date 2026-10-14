import { chance, int, pick } from './rng'
import type { Activity, DisposalMethod, ItemId, Location, Minute, OperationPlan, Person, ScheduledActivity, Victim, World } from './types'
import { DAY, HOUR, fmtTime, hourOf, inBlock, isNight } from './time'
import { ITEMS, isHomeItem } from './items'
import { aPerson, addEvidence, addNews, busyError, districtName, fullName, loc, meet, person, peopleAt, playerPerson, uid, whereIs } from './world'
import { bodyFound, openCase, queueTask, reportEvidence } from './police'
import { pourAt } from './bodies'
import { attendObligation, obligationDuration, skipObligation } from './life'
import { noteAbsence } from './jobs'
import { arrestPlayer, inCustody } from './legal'
import { hoursLabel, travelMinutes } from './geo'
import { cameraMult, isHoliday, isOpenAt, masksNormal, noticeMult, trafficAt, travelExtra, weatherOn, OUTDOOR } from './environment'
import { carUsable, completeRefuel, completeService, fuelFor, useCar } from './car'
import { recordBank, recordWithdrawal } from './money'
import { interruptionAt, logPlate, roadblockIn, startEncounter } from './patrol'
import { cleanerMightTalk, completeDeal, completeStorageTrip, takeTrophy } from './underworld'
import { completeLift, plantAtScene } from './frame'
import { isChild } from './population'
import { angerNotice, installCameras, sloppiness, spreeConsequences } from './anger'

const DURATION: Record<Exclude<Activity['kind'], 'obligation'>, number> = {
  scout: 2 * HOUR, visit: 2 * HOUR, research: HOUR, tail: 6 * HOUR, lift: HOUR, shop: 30, dispose_item: HOUR, clean_car: 2 * HOUR,
  interview: HOUR, tamper: 30, refuel: 15, atm: 15, service_car: 2 * HOUR, storage_trip: 30, deal: 30, operation: 3 * HOUR,
}

export function activityLabel(w: World, a: Activity): string {
  switch (a.kind) {
    case 'scout': return `Scout ${loc(w, a.locationId).name}`
    case 'visit': return `Hang out at ${loc(w, a.locationId).name}`
    case 'research': return `Research ${fullName(person(w, a.personId))} online`
    case 'tail': return `Tail ${fullName(person(w, a.personId))}`
    case 'lift': return `Take something of ${fullName(person(w, a.personId))}'s`
    case 'shop': return `Shopping at ${loc(w, a.locationId).name} (${shopItems(a).length} item${shopItems(a).length === 1 ? '' : 's'})`
    case 'dispose_item': return `Get rid of ${ITEMS[a.item].name} at ${loc(w, a.locationId).name}`
    case 'clean_car': return 'Scrub the car with bleach'
    case 'refuel': return `Fill up at ${loc(w, a.locationId).name}`
    case 'atm': return `Use ${person(w, a.victimId).first}'s card at ${loc(w, a.locationId).name}`
    case 'service_car': return `Car service at ${loc(w, a.locationId).name}`
    case 'storage_trip': return a.move === 'stash' ? 'Take things to the storage unit' : 'Bring things back from storage'
    case 'deal': return `Meet a dealer: ${ITEMS[a.item].name}`
    case 'tamper': return `Deal with the cameras at ${loc(w, a.locationId).name}`
    case 'obligation': return a.obligation.title
    case 'interview': return `Job interview at ${loc(w, a.locationId).name}`
    case 'operation': return `Kill: ${fullName(person(w, a.op.targetId))}`
  }
}

/** Basket of a shopping trip (older saves stored a single item). */
export const shopItems = (a: Extract<Activity, { kind: 'shop' }>): ItemId[] => a.items ?? [(a as unknown as { item: ItemId }).item]

/** Where an activity takes place, or null if it happens at home. */
export function activityLocation(w: World, a: Activity, t: Minute): string | null {
  switch (a.kind) {
    case 'research': case 'clean_car': return null
    case 'tail': case 'lift': return whereIs(person(w, a.personId), t)
    case 'operation': return a.op.locationId
    case 'obligation': return a.obligation.locationId
    default: return a.locationId
  }
}

/**
 * Put something on the agenda. `startAt` is when you need to *be there*; travel is added either side.
 * Passing the current time means "as soon as possible". Returns an error message, or null when scheduled.
 */
export function schedule(w: World, activity: Activity, startAt: Minute): string | null {
  if (inCustody(w)) return 'You’re in a cell.'
  if (w.player.encounter) return 'Not now — the police are right there.'
  const home = playerPerson(w).homeId
  const dest = activityLocation(w, activity, startAt)
  // Your own car if it runs and has gas; a kill uses whatever you planned; otherwise you walk.
  const op = activity.kind === 'operation' ? activity.op : null
  let drive = !!dest && (op ? op.vehicle === 'car' : carUsable(w, startAt))
  if (drive && !op && w.player.car && w.player.car.fuel < fuelFor(travelMinutes(w, home, dest!)) && activity.kind !== 'refuel') drive = false
  const onFoot = !!dest && !drive && op?.vehicle !== 'rental'
  const base = dest ? travelMinutes(w, home, dest, onFoot) : 0
  const roadblocked = !!dest && !!roadblockIn(w, loc(w, dest).districtId, startAt) && (drive || op?.vehicle === 'rental')
  const travel = base + (dest ? travelExtra(w, loc(w, dest).districtId, startAt, base) : 0) + (roadblocked ? 15 : 0)
  if (op?.vehicle === 'car') {
    if (!w.player.car || (w.player.car.inShopUntil ?? 0) > startAt) return 'Your car isn’t available then.'
    if (w.player.car.fuel < fuelFor(travel)) return 'Not enough gas in the car for that trip.'
  }
  const asap = startAt <= w.time
  // One thing at a time: you can line things up for later, but not start something while you're out.
  if (asap && activity.kind !== 'obligation') {
    const busy = busyError(w)
    if (busy) return busy
  }
  if (asap) startAt = w.time + travel
  if (startAt - travel < w.time) return `You can't get there by then — it's ${travel} minutes away.`

  const place = dest ? loc(w, dest) : null
  if (activity.kind === 'shop') {
    const total = shopItems(activity).reduce((sum, i) => sum + ITEMS[i].price, 0)
    if (!shopItems(activity).length) return 'Your basket is empty.'
    if (w.player.money < total) return 'Not enough money.'
  }
  if (activity.kind === 'clean_car' && !(w.player.inventory.bleach ?? 0)) return 'You need bleach.'
  if (activity.kind === 'deal') {
    if (w.player.streetDebt) return `You owe them ${w.player.streetDebt.amount}. Nobody sells to you until that's paid.`
    if ((w.player.marketClosedUntil ?? 0) > startAt) return 'Your contact is gone. Nobody is answering that number.'
  }
  if (activity.kind === 'tamper') {
    if (!(w.player.inventory.spray ?? 0)) return 'You need spray paint.'
    if (!w.player.locIntel[activity.locationId]?.knownCameras.length) return 'You don’t know where any cameras are there.'
  }
  if (activity.kind === 'operation') {
    const errs = validateOperation(w, { ...activity.op, at: startAt })
    if (errs.length) return errs[0]
  }
  const endAt = startAt + (activity.kind === 'obligation' ? obligationDuration(activity.obligation.type) : activity.kind === 'operation' ? killTime(w, activity.op, startAt).total : DURATION[activity.kind])
  // Shops and venues only let you in while they're open.
  if (place && (activity.kind === 'shop' || activity.kind === 'visit') && (!isOpenAt(w, place, startAt) || !isOpenAt(w, place, endAt - 1))) {
    return `${place.name} is closed then (${isHoliday(w, startAt) ? 'public holiday' : hoursLabel(place.kind)}).`
  }
  let back = travel
  if (activity.kind === 'operation' && activity.op.disposalLocationId !== 'none' && !activity.op.cleaner) back = travelMinutes(w, activity.op.disposalLocationId, home, onFoot)
  const departAt = startAt - travel
  const returnAt = endAt + back
  const clash = w.player.agenda.find((s) => departAt < s.returnAt && returnAt > s.departAt)
  if (clash) return `That clashes with: ${clash.label} (${fmtTime(clash.startAt)}).`
  w.player.agenda.push({ id: uid(w, 'act'), activity, label: activityLabel(w, activity), departAt, startAt, endAt, returnAt, drive, started: false })
  w.player.agenda.sort((a, b) => a.departAt - b.departAt)
  return null
}

export function cancelSchedule(w: World, id: string): string | null {
  const s = w.player.agenda.find((x) => x.id === id)
  if (!s) return null
  if (s.started || w.time >= s.departAt) return 'Too late — you are already on your way.'
  w.player.agenda = w.player.agenda.filter((x) => x !== s)
  if (s.activity.kind === 'obligation') skipObligation(w, s.activity.obligation)
  return null
}

// ---------------------------------------------------------------- disposal

export interface KillTime {
  kill: number
  extras: number
  toDump: number
  disposal: number
  total: number
  parts: { label: string; min: number }[]
}

/** How long a kill takes, start to finish, given how it's done. */
export function killTime(w: World, op: OperationPlan, at: Minute): KillTime {
  const parts: { label: string; min: number }[] = []
  const add = (label: string, min: number) => min > 0 && parts.push({ label, min })
  const kill = { pistol: 10, knife: 20, rope: 30, hands: 40 }[op.weapon]
  add(`The kill (${op.weapon === 'hands' ? 'bare hands' : op.weapon})`, kill)
  let extras = 0
  const extra = (label: string, min: number, on: unknown) => { if (on) { extras += min; add(label, min) } }
  extra('Waiting for them to show', 30, op.lure !== 'none')
  extra('Sedative taking effect', 10, op.sedate)
  extra('Taking a trophy', 15, op.trophy && op.trophy !== 'none')
  extra('Bleach clean-up', 45, op.bleach)
  extra('Wrapping the body', 15, op.tarp && op.disposalLocationId !== 'none' && !op.cleaner)
  let toDump = 0
  let disposal = 0
  if (op.cleaner) {
    disposal = 40
    add('Waiting for the Cleaner', 40)
  } else if (op.disposalLocationId !== 'none' && op.locationId) {
    toDump = travelMinutes(w, op.locationId, op.disposalLocationId, op.vehicle === 'foot')
    add('Moving the body', toDump)
    const d = disposalFor(w, loc(w, op.disposalLocationId), at + kill + extras + toDump)
    disposal = { bury: d.concealment > 0.6 ? 120 : 90, foundation: 90, sink: d.concealment > 0.8 ? 40 : 20, hide: 30, dump: 15, leave: 0, cleaned: 0 }[d.method]
    add(d.method === 'bury' ? (d.concealment > 0.6 ? 'Digging a proper grave' : 'Digging by hand') : d.method === 'foundation' ? 'Burying it in the foundation' : d.method === 'sink' ? 'Weighting and sinking it' : d.method === 'dump' ? 'Into the dumpster' : 'Hiding it', disposal)
  }
  const total = kill + extras + toDump + disposal
  return { kill, extras, toDump, disposal, total, parts }
}

export function disposalFor(w: World, l: Location, at: Minute): { method: DisposalMethod; concealment: number; text: string } {
  const inv = w.player.inventory
  const has = (i: ItemId) => (inv[i] ?? 0) > 0
  switch (l.kind) {
    case 'lake': return has('weights') ? { method: 'sink', concealment: 0.9, text: 'Sunk with chain and weights' } : { method: 'sink', concealment: 0.55, text: 'Dumped in the water' }
    case 'forest': return has('shovel') ? { method: 'bury', concealment: 0.75, text: 'Buried deep with a shovel' } : { method: 'bury', concealment: 0.4, text: 'Buried in a shallow grave dug by hand' }
    case 'construction':
      if (l.pourDay !== undefined && at < pourAt(l.pourDay) && has('shovel')) return { method: 'foundation', concealment: 0.7, text: `Buried in the foundation pit` }
      return { method: 'hide', concealment: 0.45, text: 'Hidden under building materials' }
    case 'alley': return { method: 'dump', concealment: 0.55, text: 'Dumped in a dumpster' }
    default: return { method: 'hide', concealment: 0.5, text: 'Hidden on site' }
  }
}

export const DISPOSAL_KINDS = ['lake', 'forest', 'construction', 'alley', 'warehouse', 'parking', 'park']

export function validateOperation(w: World, op: OperationPlan): string[] {
  const errs: string[] = []
  const inv = w.player.inventory
  const need = (i: ItemId, label: string) => (inv[i] ?? 0) > 0 || errs.push(`You need ${label} (buy one in the Shop).`)
  const target = w.people.find((p) => p.id === op.targetId)
  if (!target || !target.alive || target.isPlayer) errs.push('Pick a living target.')
  else if (!w.player.known?.[target.id]) errs.push('You don’t know who that is yet.')
  if (!op.locationId) errs.push('Pick a location.')
  else if (!isOpenAt(w, loc(w, op.locationId), op.at)) errs.push(`${loc(w, op.locationId).name} is closed at that hour (${hoursLabel(loc(w, op.locationId).kind)}).`)
  if (op.at < w.time) errs.push('That time has passed.')
  if (op.weapon === 'knife' || op.weapon === 'rope') need(op.weapon, `a ${op.weapon}`)
  if (op.gloves) need('gloves', 'gloves')
  if (op.mask) need('mask', 'a balaclava')
  if (op.bleach) need('bleach', 'bleach')
  if (op.tarp) need('tarp', 'a tarp')
  if (op.lure === 'burner' && !(inv.burner || inv.clean_burner)) errs.push('You need a burner phone.')
  if (op.weapon === 'pistol') need('pistol', 'a pistol')
  if (op.sedate) need('sedative', 'a sedative')
  if (op.stolenPlates) {
    need('stolen_plates', 'stolen plates')
    if (op.vehicle !== 'car') errs.push('Stolen plates only help on your own car.')
  }
  if (op.cleaner) need('fixer', 'the Cleaner’s number')
  if (op.cleaner && target && isChild(target)) errs.push('The Cleaner hung up on you. Some jobs even they won’t touch.')
  if (op.plant) {
    const k = w.player.keepsakes?.find((x) => x.id === op.plant)
    if (!k) errs.push('You don’t have that anymore.')
    else if (k.personId === op.targetId) errs.push('Their own DNA on their own body proves nothing.')
  }
  if (op.locationId && op.disposalLocationId !== 'none' && op.vehicle === 'foot') {
    if (loc(w, op.disposalLocationId).districtId !== loc(w, op.locationId).districtId) errs.push('You can’t carry a body to another district on foot. Use your car.')
  }
  return errs
}

// ---------------------------------------------------------------- resolution helpers

const camCapture = (w: World, l: Location, t: Minute, coverage: number) => coverage * (isNight(t) ? 0.3 + l.lighting * 0.7 : 1) * cameraMult(w, l, t)

function randomPasserby(w: World, exclude: string[]): Person | undefined {
  const pool = w.people.filter((p) => p.alive && !p.isPlayer && p.age >= 12 && !exclude.includes(p.id))
  return pool.length ? pick(w.rng, pool) : undefined
}

/** Cameras record the player at a location. */
function cameraEvidence(w: World, l: Location, t: Minute, strength: number, description: string, victimId?: string) {
  const ids: string[] = []
  for (const cam of l.cameras) {
    if (cam.disabledUntil && cam.disabledUntil > t) continue
    if (!chance(w.rng, camCapture(w, l, t, cam.coverage))) continue
    ids.push(addEvidence(w, {
      kind: 'cctv', via: 'cctv_pull', time: t, locationId: l.id, districtId: l.districtId, victimId,
      pointsTo: w.player.personId, strength, description: `${l.name} camera (${fmtTime(t)}): ${description}`, expiresAt: t + cam.retentionDays * DAY,
    }).id)
  }
  return ids
}

/** People around notice the player. Returns how many noticed. */
function witnesses(w: World, l: Location, t: Minute, opts: { exclude: string[]; noticeDay: number; strength: number; what: string; victimId?: string; car?: boolean; loud?: boolean; plateOwner?: string }) {
  const around = peopleAt(w, l.id, t).filter((p) => !opts.exclude.includes(p.id) && p.age >= 6)
  if (chance(w.rng, Math.min(1, trafficAt(w, l, t) * (opts.loud ? 1.6 : 0.8)))) {
    const p = randomPasserby(w, [...opts.exclude, ...around.map((a) => a.id)])
    if (p) around.push(p)
  }
  // A gunshot turns every head — unless the fireworks drown it out.
  const notice = Math.max(isNight(t) ? 0.2 + l.lighting * 0.5 : opts.noticeDay, opts.loud ? 0.85 : 0) * noticeMult(w, l, t) * angerNotice(w)
  const costume = masksNormal(w, t) ? 0.5 : 1 // a mask is just a costume tonight
  const noticed: Person[] = []
  for (const p of around) {
    if (!chance(w.rng, notice * (p.traits.includes('nosy') ? 1.4 : 1))) continue
    noticed.push(p)
    const misId = chance(w.rng, 0.15) ? randomPasserby(w, [...opts.exclude, p.id]) : undefined
    const plate = opts.car && chance(w.rng, 0.35)
    if (plate && opts.plateOwner) addEvidence(w, { kind: 'witness', via: 'canvass', time: t, locationId: l.id, districtId: l.districtId, victimId: opts.victimId, pointsTo: opts.plateOwner, strength: 0.35, description: `A partial plate noted by ${fullName(p)} traces to a car registered to ${fullName(person(w, opts.plateOwner))}.` })
    addEvidence(w, {
      kind: 'witness', via: 'canvass', time: t, locationId: l.id, districtId: l.districtId, victimId: opts.victimId,
      pointsTo: misId?.id ?? w.player.personId,
      strength: misId ? 0.3 : (opts.strength + (plate && !opts.plateOwner ? 0.2 : 0)) * costume,
      description: `${fullName(p)} saw ${opts.what} at ${l.name} around ${fmtTime(t)}${misId ? `, and is sure it was ${fullName(misId)}` : ''}${plate ? '; noted part of a licence plate' : ''}.`,
    })
  }
  return noticed.length
}

// ---------------------------------------------------------------- activity lifecycle

/** Meet people who are at a place during [from, to). Returns the newly met. */
function meetAt(w: World, locationId: string, from: Minute, to: Minute, odds: number, how: string): Person[] {
  const met: Person[] = []
  for (let t = from; t < to; t += HOUR) {
    for (const p of peopleAt(w, locationId, t)) {
      if (chance(w.rng, odds) && meet(w, p.id, how)) met.push(p)
    }
  }
  return met
}

const metLine = (met: Person[]) =>
  met.length ? ` New faces: ${met.slice(0, 4).map(fullName).join(', ')}${met.length > 4 ? ` +${met.length - 4} more` : ''}.` : ''

export function startActivity(w: World, s: ScheduledActivity) {
  s.started = true
  noteAbsence(w, s)
  useCar(w, s)
  const dest = activityLocation(w, s.activity, s.startAt)
  if (dest && s.drive && s.activity.kind !== 'operation') logPlate(w, loc(w, dest).districtId, s.departAt, 0.03)
  if (s.activity.kind === 'operation') runOperation(w, s, s.activity.op)
}

export function completeActivity(w: World, s: ScheduledActivity) {
  const a = s.activity
  const pid = w.player.personId
  const inv = w.player.inventory
  switch (a.kind) {
    case 'scout': {
      const l = loc(w, a.locationId)
      const intel = (w.player.locIntel[l.id] ??= { scouts: 0, knownCameras: [], traffic: {} })
      intel.scouts++
      const newCams = l.cameras.filter((c) => !intel.knownCameras.includes(c.id) && chance(w.rng, c.hidden ? 0.3 : 0.8))
      intel.knownCameras.push(...newCams.map((c) => c.id))
      for (let t = s.startAt; t < s.endAt; t += HOUR) intel.traffic[hourOf(t)] = l.traffic[hourOf(t)]
      if (l.guard) intel.guardKnown = intel.guardKnown || chance(w.rng, 0.75)
      if (l.pourDay !== undefined) intel.pourDayKnown = true
      cameraEvidence(w, l, s.startAt, 0.08, 'the same person lingering and studying the area')
      witnesses(w, l, s.startAt, { exclude: [pid], noticeDay: 0.15, strength: 0.06, what: 'someone loitering and looking around' })
      const met = meetAt(w, l.id, s.startAt, s.endAt, 0.45, `Seen at ${l.name}`)
      addNews(w, 'personal', `Scouting done: ${l.name}`, `${newCams.length ? `Spotted ${newCams.length} new camera(s).` : 'No new cameras spotted.'} ${intel.guardKnown ? 'There is a security guard.' : ''} ${l.pourDay !== undefined ? `Foundation pour scheduled for Day ${l.pourDay + 1}.` : ''}${metLine(met)}`)
      break
    }
    case 'visit': {
      const l = loc(w, a.locationId)
      const intel = (w.player.locIntel[l.id] ??= { scouts: 0, knownCameras: [], traffic: {} })
      for (let t = s.startAt; t < s.endAt; t += HOUR) intel.traffic[hourOf(t)] = l.traffic[hourOf(t)]
      // Just a customer — but cameras still see a face.
      cameraEvidence(w, l, s.startAt, 0.03, 'a customer spending a couple of hours here')
      const met = meetAt(w, l.id, s.startAt, s.endAt, 0.85, `Met at ${l.name}`)
      addNews(w, 'personal', `Hung out at ${l.name}`, met.length ? `You chatted with a few people.${metLine(met)}` : 'Nobody interesting around.')
      break
    }
    case 'research': {
      const p = person(w, a.personId)
      const intel = (w.player.personIntel[a.personId] ??= {})
      intel.researched = true
      intel.knowsHome = true
      const met = p.relations.filter((r) => meet(w, r.personId, `${p.first}'s ${r.type} (social media)`)).map((r) => person(w, r.personId))
      addNews(w, 'personal', `Research done: ${fullName(p)}`, `Their job, home and social circle are now in the People tab.${metLine(met)}`)
      break
    }
    case 'tail': {
      const t = person(w, a.personId)
      const intel = (w.player.personIntel[t.id] ??= {})
      Object.assign(intel, { tailed: true, knowsShift: true, knowsHabit: true, knowsLivesAlone: true, knowsHome: true })
      const met: Person[] = []
      for (let tt = s.startAt; tt < s.endAt; tt += HOUR) met.push(...meetAt(w, whereIs(t, tt), tt, tt + 1, 0.35, `Seen around ${t.first}`))
      let body = `You now know their routine.${metLine(met)}`
      if (chance(w.rng, t.traits.includes('paranoid') ? 0.45 : 0.08)) {
        body += ` ${t.first} looked straight at you at one point. They might remember your face.`
        addEvidence(w, { kind: 'witness', via: 'canvass', time: s.startAt, locationId: t.homeId, districtId: loc(w, t.homeId).districtId, victimId: t.id, pointsTo: pid, strength: 0.3, description: `${t.first} told a friend someone had been following them.` })
      }
      addNews(w, 'personal', `Tailed ${fullName(t)}`, body)
      break
    }
    case 'lift': {
      const l = loc(w, whereIs(person(w, a.personId), s.startAt))
      cameraEvidence(w, l, s.startAt, 0.05, 'someone hanging around and pocketing something')
      s.report = completeLift(w, s, a.personId)
      break
    }
    case 'shop': {
      const l = loc(w, a.locationId)
      const basket = shopItems(a)
      const total = basket.reduce((sum, i) => sum + ITEMS[i].price, 0)
      if (w.player.money < total) {
        addNews(w, 'personal', 'Card declined', 'Not enough money.')
        break
      }
      w.player.money -= total
      for (const i of basket) {
        if (i === 'groceries') w.player.food = (w.player.food ?? 0) + 7
        else inv[i] = (inv[i] ?? 0) + 1
      }
      // A knife in a cart full of groceries looks like dinner; on its own it looks like a knife.
      const blend = basket.filter(isHomeItem).length >= 2 ? 0.5 : 1
      const list = basket.map((i) => ITEMS[i].name).join(', ')
      if (a.cash) recordWithdrawal(w, total, l.id, s.startAt - 10)
      for (const i of basket.filter((x) => ITEMS[x].trace > 0)) {
        if (!a.cash) {
          addEvidence(w, { kind: 'purchase', via: 'purchase_check', time: s.startAt, locationId: l.id, districtId: l.districtId, item: i, pointsTo: pid, strength: ITEMS[i].trace * blend, description: `Card purchase at ${l.name}, ${fmtTime(s.startAt)}, by ${fullName(playerPerson(w))}: ${list}.` })
        } else {
          for (const cam of l.cameras) {
            if ((cam.disabledUntil ?? 0) > s.startAt || !chance(w.rng, cam.coverage)) continue
            addEvidence(w, { kind: 'purchase', via: 'cctv_pull', time: s.startAt, locationId: l.id, districtId: l.districtId, item: i, pointsTo: pid, strength: ITEMS[i].trace * 1.5 * blend, description: `${l.name} till camera: customer paying cash for ${list}.`, expiresAt: s.startAt + cam.retentionDays * DAY })
          }
        }
      }
      const met = meetAt(w, l.id, s.startAt, s.startAt + 1, 0.7, `Works at ${l.name}`)
      addNews(w, 'personal', `Shopping done — $${total}`, `${list}. Paid ${a.cash ? 'cash' : 'by card'}.${metLine(met)}`)
      break
    }
    case 'refuel':
      completeRefuel(w, a.locationId, s.startAt)
      break
    case 'atm':
      useStolenCard(w, a.victimId, a.locationId, s.startAt)
      break
    case 'deal':
      completeDeal(w, a.item, a.price, a.locationId, s.startAt)
      break
    case 'storage_trip':
      cameraEvidence(w, loc(w, a.locationId), s.startAt, 0.04, 'a customer visiting their unit')
      completeStorageTrip(w, a.move)
      break
    case 'service_car':
      completeService(w, a.locationId)
      break
    case 'tamper': {
      const l = loc(w, a.locationId)
      const known = l.cameras.filter((c) => w.player.locIntel[l.id]?.knownCameras.includes(c.id))
      inv.spray = Math.max(0, (inv.spray ?? 1) - 1)
      // The cameras you didn't know about may catch you doing it.
      const masked = (inv.mask ?? 0) > 0
      for (const cam of l.cameras.filter((c) => !known.includes(c))) {
        if ((cam.disabledUntil ?? 0) > s.startAt || !chance(w.rng, camCapture(w, l, s.startAt, cam.coverage))) continue
        addEvidence(w, { kind: 'cctv', via: 'cctv_pull', time: s.startAt, locationId: l.id, districtId: l.districtId, pointsTo: pid, strength: masked ? 0.1 : 0.3, description: `${l.name} camera (${fmtTime(s.startAt)}): someone ${masked ? 'in a balaclava ' : ''}spray-painting the other cameras.`, expiresAt: s.startAt + cam.retentionDays * DAY })
      }
      for (const cam of known) cam.disabledUntil = s.endAt + 2 * DAY
      witnesses(w, l, s.startAt, { exclude: [pid], noticeDay: 0.6, strength: masked ? 0.1 : 0.3, what: 'someone spray-painting the security cameras' })
      addNews(w, 'personal', `Cameras blacked out at ${l.name}`, `${known.length} camera(s) painted over. Someone will notice eventually.`)
      addNews(w, 'news', `Vandals target cameras at ${l.name}`, 'Staff found security cameras spray-painted. Repairs are expected within two days.')
      break
    }
    case 'dispose_item': {
      const l = loc(w, a.locationId)
      inv[a.item] = Math.max(0, (inv[a.item] ?? 0) - 1)
      if (!inv[a.item]) delete w.player.tainted[a.item]
      cameraEvidence(w, l, s.startAt, 0.1, 'someone throwing something away')
      addNews(w, 'personal', `Got rid of ${ITEMS[a.item].name}`, `Dropped at ${l.name}.`)
      break
    }
    case 'obligation':
      attendObligation(w, a.obligation)
      break
    case 'interview': {
      const app = w.player.applications?.find((x) => x.id === a.appId)
      if (app && app.status === 'interview') {
        app.status = 'interviewed'
        app.replyAt = w.time + int(w.rng, 12, 30) * HOUR
      }
      addNews(w, 'personal', 'Interview done', `${loc(w, a.locationId).name} will let you know.`)
      break
    }
    case 'clean_car': {
      if (!(inv.bleach ?? 0)) break
      inv.bleach = (inv.bleach ?? 1) - 1
      const before = w.player.carTraces.length
      w.player.carTraces = w.player.carTraces.filter(() => chance(w.rng, 0.3))
      addNews(w, 'personal', 'Car cleaned', w.player.carTraces.length ? `You scrubbed for hours, but you can’t be sure it’s all gone.` : before ? 'Spotless. As far as you can tell.' : 'It was already clean.')
      break
    }
    case 'operation':
      break
  }
  if (s.report) addNews(w, 'personal', s.report.headline, s.report.body, true)
}

// ---------------------------------------------------------------- the operation

/** A fight nobody planned (e.g. with a dealer) resolves like a kill. */
export const runFight = (w: World, s: ScheduledActivity) => s.activity.kind === 'operation' && runOperation(w, s, s.activity.op)

function runOperation(w: World, s: ScheduledActivity, op: OperationPlan) {
  const pid = w.player.personId
  const me = playerPerson(w)
  const inv = w.player.inventory
  const target = person(w, op.targetId)
  const L = loc(w, op.locationId)
  const at = s.startAt
  const fail = (headline: string, body: string) => (s.report = { headline, body })

  const missing = validateOperation(w, { ...op, at: w.time })
  if (!target.alive) return fail('Operation called off', `${target.first} is already dead.`)
  if (missing.length) return fail('Operation called off', missing[0])

  // Luring creates a call record no matter what happens next.
  let lured = false
  if (op.lure !== 'none') {
    const burner = op.lure === 'burner'
    const clean = burner && !inv.burner && !!inv.clean_burner
    w.calls.push({ id: uid(w, 'c'), from: pid, to: target.id, time: at - 90, answered: true, durationMin: int(w.rng, 2, 6), towerDistrictId: loc(w, me.homeId).districtId, burner })
    addEvidence(w, {
      kind: 'call_log', via: 'phone_records', time: at - 90, victimId: target.id, pointsTo: pid, strength: clean ? 0.03 : burner ? 0.12 : 0.6,
      description: burner ? `${target.first} took a call from an unregistered prepaid number 90 minutes before going quiet.` : `${target.first} took a call from ${fullName(me)} (${me.phone}) 90 minutes before going quiet.`,
    })
    const knows = target.relations.some((r) => r.personId === pid)
    lured = chance(w.rng, (knows ? 0.85 : 0.5) * (target.traits.includes('paranoid') ? 0.5 : 1))
  }
  const present = lured || whereIs(target, at) === L.id
  if (!present) {
    cameraEvidence(w, L, at, 0.05, 'someone waiting around for a long time')
    return fail('Target never showed', `You waited at ${L.name} but ${target.first} never came.${op.lure !== 'none' ? ' They didn’t take the bait.' : ' Maybe you got their routine wrong.'}`)
  }

  const mask = op.mask
  const carry = op.vehicle !== 'foot'
  const gun = op.weapon === 'pistol'
  const noticed = witnesses(w, L, at, { exclude: [pid, target.id], noticeDay: gun ? 0.95 : 0.75, loud: gun, plateOwner: op.stolenPlates ? pick(w.rng, w.people.filter((p) => p.alive && !p.isPlayer && p.age > 25)).id : undefined, strength: mask ? 0.15 : 0.45, what: mask ? `a masked figure struggling with ${target.first}` : `${aPerson(me)} struggling with ${target.first} — could describe the face`, victimId: target.id, car: carry })
  const hurt = (w.player.injuredUntil ?? 0) > at
  const sloppy = sloppiness(w)
  const odds = { knife: 0.9, rope: 0.78, hands: 0.6, pistol: 0.97 }[op.weapon] + (op.sedate ? 0.15 : 0) - (hurt ? 0.2 : 0) - sloppy.weaker - (target.traits.includes('fit') ? 0.15 : 0) - noticed * 0.12
  if (op.sedate) inv.sedative = Math.max(0, (inv.sedative ?? 1) - 1)

  // The longer it takes, the likelier a patrol car rounds the corner.
  const kt = killTime(w, op, at)
  const atScene = kt.kill + kt.extras + (op.cleaner ? kt.disposal : 0)
  const cutScene = interruptionAt(w, L, at, atScene)
  const dumpLoc = !op.cleaner && op.disposalLocationId !== 'none' ? loc(w, op.disposalLocationId) : null
  const dumpAt = at + kt.kill + kt.extras + kt.toDump
  const cutDump = cutScene === null && dumpLoc ? interruptionAt(w, dumpLoc, dumpAt, kt.disposal) : null

  if (cutScene !== null && cutScene < kt.kill) {
    // Mid-struggle: the target breaks free while you deal with the police.
    const c = openCase(w, target.id, 'assault', `A patrol interrupted an attack on ${fullName(target)} at ${L.name}.`)
    queueTask(w, c, 'cctv_pull', { locationId: L.id, around: at, windowMin: 6 * HOUR })
    queueTask(w, c, 'canvass', { locationId: L.id, around: at, windowMin: DAY })
    addNews(w, 'news', `Patrol interrupts attack at ${L.name}`, `Officers disturbed an assault on ${fullName(target)}, who escaped. The attacker fled.`, true)
    w.player.urge = Math.max(0, (w.player.urge ?? 0) - 0.2)
    startEncounter(w, L, at + cutScene, op, c.id, target.id, 'struggle')
    return fail('Police!', `Headlights swept across ${L.name} before you'd finished. ${target.first} broke free and ran toward them.`)
  }
  // Interrupted after the kill but before you were done: whatever wasn't done yet stays undone.
  const interrupted: 'scene' | 'dump' | null = cutScene !== null ? 'scene' : cutDump !== null ? 'dump' : null
  if (interrupted === 'scene') op = { ...op, bleach: false, trophy: 'none', tarp: false, disposalLocationId: 'none', cleaner: false }

  const overpowered = chance(w.rng, odds)
  if (!overpowered && op.quiet) {
    // They got away, and they won't be calling the police. They'll remember, though.
    w.player.injuredUntil = Math.max(w.player.injuredUntil ?? 0, at + 3 * DAY)
    return fail('They got away', `${target.first} slipped out of your grip and ran. You're bleeding. They won't go to the police — people like that settle things themselves.`)
  }
  if (!overpowered) {
    // The target fights free and goes straight to the police.
    const knows = target.relations.some((r) => r.personId === pid)
    const c = openCase(w, target.id, 'assault', `${fullName(target)} reported being attacked at ${L.name}.`)
    const st = addEvidence(w, { kind: 'statement', via: 'canvass', time: at, locationId: L.id, victimId: target.id, pointsTo: pid, strength: knows ? 1.8 : mask ? 0.25 : 0.6, description: knows ? `${target.first} identified the attacker by name: ${fullName(me)}.` : `${target.first} described the attacker${mask ? ' (masked)' : ''}.` })
    cameraEvidence(w, L, at, mask ? 0.2 : 0.6, `an attack on ${target.first}`, target.id)
    queueTask(w, c, 'cctv_pull', { locationId: L.id, around: at, windowMin: 6 * HOUR })
    queueTask(w, c, 'canvass', { locationId: L.id, around: at, windowMin: DAY })
    reportEvidence(w, c, [st.id])
    addNews(w, 'news', `Attack reported at ${L.name}`, `${fullName(target)} escaped an attacker late last night and is helping police.`)
    w.player.urge = Math.max(0, (w.player.urge ?? 0) - 0.3)
    return fail('It went wrong', `${target.first} fought back and got away.${knows ? ' They know exactly who you are.' : ''}`)
  }

  // --- Kill succeeds
  target.alive = false
  // The game gets mad: new cameras go up overnight, including where you already looked.
  if (isChild(target)) installCameras(w)
  w.player.urge = 0
  const victimId = target.id
  cameraEvidence(w, L, at, mask ? 0.2 : 0.6, mask ? `a masked figure attacking ${target.first}` : `${target.first} attacked; attacker's face partly visible${carry ? ', a car visible nearby' : ''}`, victimId)
  // On a spree you get careless: a glove comes off, a print on the door.
  if ((!op.gloves && chance(w.rng, op.frenzy ? 1 : 0.75)) || (op.gloves && chance(w.rng, sloppy.printsThroughGloves))) addEvidence(w, { kind: 'fingerprint', via: 'forensics', time: at, victimId, pointsTo: pid, strength: 0.9, needsSample: true, description: 'Unidentified fingerprints recovered from the victim.' })
  const dnaChance = op.frenzy ? 1 : { knife: 0.4, rope: 0.5, hands: 0.8, pistol: 0.1 }[op.weapon] * (op.bleach ? 0.3 : 1) * (op.sedate ? 0.5 : 1) + (op.trophy && op.trophy !== 'none' ? 0.1 : 0) + (hurt ? 0.25 : 0) + sloppy.dna
  takeTrophy(w, victimId, op.trophy, at)
  // Their wallet: leave it and it doesn't look like a robbery; take it and it does.
  let loot = ''
  if (op.wallet === 'cash' || op.wallet === 'cards') {
    const cash = target.cash ?? 0
    w.player.money += cash
    target.cash = 0
    loot = cash ? `You took ${cash} from their wallet.` : 'Their wallet was empty.'
    if (op.wallet === 'cards') {
      ;(w.player.stolenCards ??= []).push({ victimId, balance: target.savings ?? 0, uses: 0 })
      loot += ' And their bank card.'
    }
  }
  // Every bullet has a fingerprint of its own.
  if (gun) addEvidence(w, { kind: 'weapon', via: 'forensics', time: at, victimId, strength: 0, description: 'Ballistics: 9mm, the same unregistered pistol each time.' })
  if (op.stolenPlates) inv.stolen_plates = Math.max(0, (inv.stolen_plates ?? 1) - 1)
  if (op.plant) plantAtScene(w, op.plant, victimId, at)
  if (chance(w.rng, dnaChance)) addEvidence(w, { kind: 'dna', via: 'forensics', time: at, victimId, pointsTo: pid, strength: 1.0, needsSample: true, description: 'Foreign DNA found under the victim’s fingernails.' })
  // Supposed to be at work (or "sick") when it happened — the employer's records say so.
  if (w.player.employed && me.shift && me.workplaceId && inBlock(at, me.shift)) {
    const sick = w.player.shifts[Math.floor(at / DAY)] === 'sick'
    addEvidence(w, { kind: 'absence', via: 'employer', time: at, victimId, pointsTo: pid, strength: sick ? 0.3 : 0.45, description: `${fullName(me)} was scheduled at ${loc(w, me.workplaceId).name} at the time of the killing but ${sick ? 'had called in sick' : 'was not at work'}.` })
  }
  if (op.bleach) inv.bleach = (inv.bleach ?? 1) - 1
  if (op.gloves) inv.gloves = (inv.gloves ?? 1) - 1
  if (op.weapon !== 'hands') (w.player.tainted[op.weapon] ??= []).push(victimId)
  // A rented car keeps your plate off camera, but the rental desk keeps a record.
  if (op.vehicle === 'rental') {
    w.player.money -= 90
    recordBank(w, `Car rental ($90) by ${fullName(me)}`, L.id, at - 2 * HOUR, 0.15, victimId)
  }
  // Snow keeps footprints.
  if (weatherOn(w, at).kind === 'snow' && OUTDOOR.has(L.kind)) addEvidence(w, { kind: 'footprint', via: 'forensics', time: at, victimId, pointsTo: pid, strength: 0.25, description: 'Clear boot prints in the snow leading to and from the body, size 10.' })
  if (op.bringOwnPhone) addEvidence(w, { kind: 'tower_dump', via: 'tower_dump', time: at, districtId: L.districtId, victimId, pointsTo: pid, strength: 0.3, description: `${fullName(me)}'s phone connected to a tower in ${w.districts.find((d) => d.id === L.districtId)?.name} at ${fmtTime(at)}.` })

  // --- Disposal
  let bodyLoc = L
  let disposal: { method: DisposalMethod; concealment: number; text: string } = { method: 'leave', concealment: 0.05, text: `Left where they fell at ${L.name}` }
  let disposeAt = at + 30
  if (op.cleaner) {
    // One phone call. Twenty minutes later a van, two men, and then nothing at all.
    inv.fixer = Math.max(0, (inv.fixer ?? 1) - 1)
    disposal = { method: 'cleaned', concealment: 0.99, text: 'The Cleaner came twenty minutes after your call. The body is gone — like it was never there' }
    cleanerMightTalk(w)
  } else if (op.disposalLocationId !== 'none') {
    bodyLoc = loc(w, op.disposalLocationId)
    const kt = killTime(w, op, at)
    disposeAt = at + kt.kill + kt.extras + kt.toDump
    disposal = disposalFor(w, bodyLoc, disposeAt)
    if (bodyLoc.id !== L.id) {
      cameraEvidence(w, bodyLoc, disposeAt, mask ? 0.15 : 0.45, `someone dragging a heavy bundle${carry ? ' from a car' : ''}`, victimId)
      witnesses(w, bodyLoc, disposeAt, { exclude: [pid], noticeDay: 0.6, strength: mask ? 0.12 : 0.35, what: mask ? 'a masked figure hauling a heavy bundle' : `${aPerson(me)} hauling a heavy bundle`, victimId, car: carry })
      if (op.bringOwnPhone && bodyLoc.districtId !== L.districtId) addEvidence(w, { kind: 'tower_dump', via: 'tower_dump', time: disposeAt, districtId: bodyLoc.districtId, victimId, pointsTo: pid, strength: 0.3, description: `${fullName(me)}'s phone connected to a tower in ${w.districts.find((d) => d.id === bodyLoc.districtId)?.name} at ${fmtTime(disposeAt)}.` })
    }
    if (carry && !op.tarp && op.vehicle === 'car') w.player.carTraces.push(victimId)
    if (op.vehicle === 'rental' && !op.tarp) recordBank(w, `Rental company reported heavy bloodstains in a car rented by ${fullName(me)}`, bodyLoc.id, disposeAt + DAY, 0.55, victimId)
    if (op.tarp) inv.tarp = (inv.tarp ?? 1) - 1
    if (disposal.method === 'sink' && disposal.concealment > 0.8) inv.weights = (inv.weights ?? 1) - 1
    if (interrupted === 'dump') disposal = { method: 'leave', concealment: 0.05, text: `Dropped and abandoned at ${bodyLoc.name} when a patrol showed up` }
    // A body in the car and a checkpoint on the way.
    const block = carry && (roadblockIn(w, L.districtId, disposeAt) ?? roadblockIn(w, bodyLoc.districtId, disposeAt))
    if (block) {
      if (chance(w.rng, 0.7) && chance(w.rng, op.tarp ? 0.35 : 0.6)) {
        target.alive = false
        const c = openCase(w, target.id, 'homicide', `${fullName(target)}'s body found in a car stopped at a roadblock in ${districtName(w, block.districtId)}.`)
        arrestPlayer(w, 'murder', 1.6, c.id)
        s.report = { headline: 'Roadblock', body: `"Open the trunk, please." They found ${target.first}.` }
        return
      }
      logPlate(w, block.districtId, disposeAt, 0.3, victimId)
    }
  }

  // --- Victim's phone
  const pingLoc = op.victimPhone === 'left' ? bodyLoc : L
  const pingAt = op.victimPhone === 'left' ? disposeAt + 6 * HOUR : at
  addEvidence(w, { kind: 'phone_ping', via: 'phone_records', time: pingAt, locationId: pingLoc.id, districtId: pingLoc.districtId, victimId, strength: 0, description: op.victimPhone === 'left' ? `${target.first}'s phone kept pinging near ${pingLoc.name} until the battery died.` : `${target.first}'s phone went dark near ${pingLoc.name} at ${fmtTime(at)}.` })
  if (op.victimPhone === 'kept') inv.victim_phone = (inv.victim_phone ?? 0) + 1

  const v: Victim = {
    personId: victimId, killedAt: at, killLocationId: L.id, bodyLocationId: bodyLoc.id, disposal: disposal.method,
    weapon: op.weapon, phone: op.victimPhone, playerPhone: op.bringOwnPhone, concealment: disposal.concealment, worry: {},
  }
  w.victims.push(v)
  spreeConsequences(w)

  if (interrupted) {
    const where = interrupted === 'dump' && dumpLoc ? dumpLoc : L
    const when = interrupted === 'dump' ? dumpAt + (cutDump ?? 0) : at + (cutScene ?? 0)
    bodyFound(w, v, `a patrol officer came upon the body at ${where.name} — the killer fled`)
    startEncounter(w, where, when, op, v.caseId, victimId, 'after')
    s.report = { headline: 'Police!', body: `${target.first} ${target.last} is dead, but a patrol pulled up at ${where.name} before you were done. The body is right there.` }
    return
  }

  const sawSomeone = noticed > 0 && chance(w.rng, 0.6)
  const knownCams = L.cameras.filter((c) => w.player.locIntel[L.id]?.knownCameras.includes(c.id)).length
  s.report = {
    headline: `${target.first} ${target.last} is dead`,
    body: [
      `${disposal.text}${bodyLoc.id !== L.id ? ` at ${bodyLoc.name}` : ''}.`,
      sawSomeone ? 'You think someone may have seen you.' : 'You didn’t see anyone around.',
      knownCams ? `There ${knownCams === 1 ? 'was a camera' : `were ${knownCams} cameras`} you knew about${mask ? ' — the mask was on' : ''}.` : '',
      carry && !op.tarp && op.disposalLocationId !== 'none' ? 'There’s blood in your car.' : '',
      loot,
    ].filter(Boolean).join(' '),
  }
}

/** Where the player's research says a target will be at time t (only if they know the routine). */
export function expectedWhereabouts(w: World, p: Person, t: Minute): string | null {
  const intel = w.player.personIntel[p.id]
  if (!intel?.knowsShift && !intel?.knowsHabit) return null
  return loc(w, whereIs(p, t)).name
}

/** Withdraw cash with a victim's card. Money now, a timestamped photo for the police later. */
function useStolenCard(w: World, victimId: string, locationId: string, at: Minute) {
  const card = w.player.stolenCards?.find((c) => c.victimId === victimId)
  const v = w.victims.find((x) => x.personId === victimId)
  const l = loc(w, locationId)
  const owner = person(w, victimId)
  if (!card) return
  card.uses++
  // The bank logs every attempt, even declined ones, and the ATM camera sees a face.
  const declined = !!(v?.reportedAt || v?.foundAt) || card.balance <= 0
  const amount = declined ? 0 : Math.min(300, card.balance)
  addEvidence(w, { kind: 'bank', via: 'phone_records', time: at, locationId, districtId: l.districtId, victimId, strength: 0.05, description: `${owner.first} ${owner.last}'s bank card was ${declined ? 'tried' : 'used'} at the ATM at ${l.name} on ${fmtTime(at)}${v ? ' — after they disappeared' : ''}.` })
  cameraEvidence(w, l, at, w.player.inventory.mask ? 0.2 : 0.6, `someone withdrawing cash with ${owner.first} ${owner.last}'s card`, victimId)
  if (declined) {
    const c = v?.caseId ? w.cases.find((x) => x.id === v.caseId) : undefined
    if (c) queueTask(w, c, 'cctv_pull', { locationId, around: at, windowMin: HOUR })
    w.player.stolenCards = w.player.stolenCards!.filter((c) => c !== card)
    addNews(w, 'personal', 'Card declined', `${owner.first}'s card has been blocked. The machine kept it.`)
    return
  }
  card.balance -= amount
  w.player.money += amount
  addNews(w, 'personal', `Withdrew $${amount}`, `From ${owner.first}'s account, at ${l.name}. $${card.balance} left in it.`)
}
