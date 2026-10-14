// Headless smoke test: generate a world, commit one crime, let the police work.
//   npx tsx scripts/smoke.ts <seed> [phone]
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { fmtTime, DAY, HOUR, inBlock } from '../src/sim/time'
import { playerHeat } from '../src/sim/police'
import { meet } from '../src/sim/world'
import type { OperationPlan } from '../src/sim/types'

const seed = process.argv[2] ?? 'smoke'
const w = generateWorld(seed)
console.log(`${w.cityName}: ${w.districts.length} districts, ${w.locations.length} locations, ${w.people.length} people, ${w.calls.length} calls`)
w.player.inventory = { knife: 1, gloves: 1, tarp: 1, shovel: 1, mask: 1 }
const quiet = (id: string) => ['park', 'lake'].includes(w.locations.find((l) => l.id === id)!.kind)
const target = w.people.find((p) => !p.isPlayer && p.habit && quiet(p.habit.locationId))!
let at = w.time + HOUR
while (!inBlock(at, target.habit!)) at += HOUR
meet(w, target.id, 'test')
const forest = w.locations.find((l) => l.kind === 'forest')!
const op: OperationPlan = { targetId: target.id, locationId: target.habit!.locationId, at, weapon: 'knife', disposalLocationId: forest.id, disposal: 'bury', victimPhone: 'destroyed', bringOwnPhone: process.argv[3] === 'phone', vehicle: 'car', gloves: true, mask: true, bleach: false, tarp: true, lure: 'none' }
console.log('target', target.first, target.last, 'rel', target.relations.map(r => r.type).join(','), '| schedule:', schedule(w, { kind: 'operation', op }, at) ?? 'ok', fmtTime(at))
for (let d = 0; d < 30 && !w.gameOver; d++) { w.pauseRequested = false; advance(w, DAY) }
for (const n of [...w.news].reverse()) console.log(`[${fmtTime(n.time)}] ${n.kind.toUpperCase()}: ${n.headline} — ${n.body}`)
for (const c of w.cases) { console.log(`\nCASE ${c.type} ${c.status}`); for (const l of c.log) console.log(`  ${fmtTime(l.time)} ${l.text}`); console.log('  suspicion', c.suspicion) }
console.log('heat', playerHeat(w).toFixed(2), 'gameOver', w.gameOver, 'money', w.player.money)
console.log('evidence truth:', w.evidence.filter(e => e.victimId === target.id).map(e => `${e.kind}${e.discovered ? '*' : ''}`).join(', '))
