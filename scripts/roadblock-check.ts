// A body is found: are roadblocks set up, do they slow travel, and do they log plates?
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { bodyFound } from '../src/sim/police'
import { schedule } from '../src/sim/actions'
import { roadblockIn, patrolAt, presenceLabel } from '../src/sim/patrol'
import { HOUR, fmtTime } from '../src/sim/time'
import type { World } from '../src/sim/types'

const run = (w: World, minutes: number) => { const end = w.time + minutes; while (w.time < end) { advance(w, end - w.time); w.pauseRequested = false } }
const w = generateWorld('roadblock')
const victim = w.people.find((p) => !p.isPlayer && p.age > 20)!
const park = w.locations.find((l) => l.kind === 'park')!
const shop = w.locations.find((l) => l.districtId === park.districtId && l.kind !== 'park' && l.kind !== 'house') ?? park
const tripBefore = schedule(w, { kind: 'scout', locationId: shop.id }, w.time + 10 * HOUR)
const normal = w.player.agenda[0]
console.log('normal trip:', tripBefore ?? `${normal.startAt - normal.departAt} min drive`)
w.player.agenda = []
victim.alive = false
w.victims.push({ personId: victim.id, killedAt: w.time - HOUR, killLocationId: park.id, bodyLocationId: park.id, disposal: 'leave', weapon: 'knife', phone: 'left', concealment: 0, worry: {} })
console.log('before:', presenceLabel(patrolAt(w, park, w.time)))
bodyFound(w, w.victims[0], 'test')
run(w, 3 * HOUR)
console.log('roadblock now?', !!roadblockIn(w, park.districtId, w.time), '| presence:', presenceLabel(patrolAt(w, park, w.time)))
console.log('same trip during roadblock:', schedule(w, { kind: 'scout', locationId: shop.id }, w.time + HOUR) ?? 'ok', w.player.agenda.map((a) => `${a.startAt - a.departAt} min drive`))
run(w, 4 * HOUR)
console.log('plate logged:', w.evidence.filter((e) => e.description.startsWith('Roadblock log')).map((e) => e.description))
run(w, 40 * HOUR)
console.log('roadblock 2 days later?', !!roadblockIn(w, park.districtId, w.time), '| presence:', presenceLabel(patrolAt(w, park, w.time)), '| at', fmtTime(w.time))
