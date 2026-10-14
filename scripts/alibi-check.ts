// Commit a crime carrying your phone, then answer the detective's call with "I was at home".
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { answer, threadName } from '../src/sim/messages'
import { DAY, HOUR, fmtTime, inBlock } from '../src/sim/time'
import { meet } from '../src/sim/world'
import { playerHeat } from '../src/sim/police'

const carry = process.argv[2] !== 'home'
const w = generateWorld('alibi3')
w.player.inventory = { knife: 1, gloves: 1, tarp: 1 }
const target = w.people.find((p) => !p.isPlayer && p.habit && ['park', 'lake'].includes(w.locations.find((l) => l.id === p.habit!.locationId)!.kind))!
meet(w, target.id, 'test')
let at = w.time + HOUR
while (!inBlock(at, target.habit!)) at += HOUR
console.log(schedule(w, { kind: 'operation', op: { targetId: target.id, locationId: target.habit!.locationId, at, weapon: 'knife', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'left', bringOwnPhone: carry, vehicle: 'car', gloves: true, mask: false, bleach: false, tarp: true, lure: 'none' } }, at) ?? 'op scheduled')
for (let i = 0; i < 400 && !w.gameOver; i++) {
  w.pauseRequested = false
  advance(w, 2 * HOUR)
  const call = w.player.messages.find((m) => m.action?.kind === 'alibi' && !m.answered)
  if (call) { console.log(`[${fmtTime(w.time)}] CALL ${threadName(w, call.thread)}: ${call.text}`); answer(w, call.id, 'home') }
  if (w.time > 3 * DAY + 30 * DAY) break
}
for (const m of w.player.messages) console.log(`  ${fmtTime(m.time)} ${m.from === 'me' ? '>>' : '<<'} ${threadName(w, m.thread)}: ${m.text}`)
const alibi = w.evidence.filter((e) => e.kind === 'alibi' && e.pointsTo === w.player.personId)
console.log('alibi evidence:', alibi.map((e) => `${e.strength} ${e.description}`))
console.log('heat', playerHeat(w).toFixed(2), 'over', w.gameOver?.reason)
