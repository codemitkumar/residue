// How often do patrols interrupt short vs long kills, and what happens after a body turns up?
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { killTime, schedule } from '../src/sim/actions'
import { meet } from '../src/sim/world'
import { patrolAt, presenceLabel, roadblockIn } from '../src/sim/patrol'
import { HOUR, inBlock } from '../src/sim/time'
import type { OperationPlan } from '../src/sim/types'

function trial(seed: string, long: boolean, ifPolice: OperationPlan['ifPolice'], hot: boolean) {
  const w = generateWorld(seed)
  w.player.inventory = { pistol: 1, knife: 1, shovel: 1, tarp: 1, bleach: 1, gloves: 1, mask: 1 }
  const t = w.people.find((p) => !p.isPlayer && p.age > 20 && p.habit && ['park', 'lake'].includes(w.locations.find((l) => l.id === p.habit!.locationId)!.kind))
  if (!t) return null
  meet(w, t.id, 'test')
  const scene = w.locations.find((l) => l.id === t.habit!.locationId)!
  if (hot) (w.patrolHeat ??= {})[scene.districtId] = { level: 0.14, since: w.time, until: w.time + 10 * 24 * 60 }
  let at = w.time + 3 * HOUR
  while (!inBlock(at, t.habit!)) at += HOUR
  const forest = w.locations.find((l) => l.kind === 'forest')!
  const op: OperationPlan = {
    targetId: t.id, locationId: scene.id, at, weapon: long ? 'knife' : 'pistol', disposalLocationId: long ? forest.id : 'none', disposal: 'leave',
    victimPhone: 'destroyed', bringOwnPhone: false, vehicle: 'car', gloves: true, mask: true, bleach: long, tarp: long, lure: 'none', trophy: long ? 'hair' : 'none', ifPolice,
  }
  const minutes = killTime(w, op, at).total
  const presence = presenceLabel(patrolAt(w, scene, at))
  const err = schedule(w, { kind: "operation", op }, at)
  if (err) { if (seed === "patrol0") console.log("schedule error:", err); return null }
  for (let i = 0; i < 30 && !w.gameOver; i++) { w.pauseRequested = false; advance(w, HOUR) }
  const report = w.news.find((n) => n.kind === 'personal' && /Police!|Caught|is dead|went wrong|never showed/.test(n.headline))?.headline ?? '?'
  const result = w.gameOver ? 'CAUGHT' : /Police!/.test(report) ? 'interrupted, escaped' : report
  const blocks = (w.roadblocks ?? []).filter((r) => roadblockIn(w, r.districtId, r.from + 60)).length
  return { minutes, presence, result, roadblocks: blocks }
}

for (const [label, long, hot] of [['quick pistol kill, normal patrols', false, false], ['4-hour burial, normal patrols', true, false], ['4-hour burial, district just had a body', true, true]] as const) {
  const tally: Record<string, number> = {}
  let mins = 0
  let n = 0
  const presences = new Set<string>()
  for (let i = 0; i < 40; i++) {
    const r = trial(`patrol${i}`, long, 'run', hot)
    if (!r) continue
    n++
    mins = r.minutes
    presences.add(r.presence)
    const key = r.result.endsWith('is dead') ? 'clean kill' : r.result
    tally[key] = (tally[key] ?? 0) + 1
  }
  console.log(`${label} (~${mins} min, ${n} runs, presence: ${[...presences].join(' / ')}):`, tally)
}
const r = trial('patrol3', true, 'run', true)
console.log('roadblocks after a found body:', r?.roadblocks)
