// How long different kills take, and the agenda slot each one books.
import { generateWorld } from '../src/sim/worldgen'
import { killTime, schedule } from '../src/sim/actions'
import { meet } from '../src/sim/world'
import { fmtClock } from '../src/sim/time'
import type { OperationPlan } from '../src/sim/types'

const w = generateWorld('killtime')
const t = w.people.find((p) => !p.isPlayer && p.age > 20)!
meet(w, t.id, 'test')
const park = w.locations.find((l) => l.kind === 'park')!
const forest = w.locations.find((l) => l.kind === 'forest')!
const lake = w.locations.find((l) => l.kind === 'lake')!
w.player.inventory = { pistol: 1, knife: 1, shovel: 1, weights: 1, tarp: 1, bleach: 1, fixer: 1 }
const base: OperationPlan = { targetId: t.id, locationId: park.id, at: w.time + 24 * 60, weapon: 'knife', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'destroyed', bringOwnPhone: false, vehicle: 'car', gloves: false, mask: false, bleach: false, tarp: false, lure: 'none' }
const plans: [string, OperationPlan][] = [
  ['pistol, leave the body', { ...base, weapon: 'pistol' }],
  ['bare hands, leave it', { ...base, weapon: 'hands' }],
  ['knife + bleach + trophy, bury in forest', { ...base, bleach: true, trophy: 'hair', tarp: true, disposalLocationId: forest.id }],
  ['knife, sink in lake with weights', { ...base, tarp: true, disposalLocationId: lake.id }],
  ['knife, call the Cleaner', { ...base, cleaner: true }],
]
for (const [name, op] of plans) {
  const k = killTime(w, op, op.at)
  console.log(`${name}: ${k.total} min  [${k.parts.map((p) => `${p.label} ${p.min}`).join(', ')}]`)
}
w.player.agenda = []
console.log('schedule forest plan:', schedule(w, { kind: 'operation', op: plans[2][1] }, plans[2][1].at) ?? 'ok')
const a = w.player.agenda[0]
console.log(`agenda: leave ${fmtClock(a.departAt)}, kill ${fmtClock(a.startAt)}, done ${fmtClock(a.endAt)}, home ${fmtClock(a.returnAt)}`)
