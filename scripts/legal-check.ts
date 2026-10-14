// Wallets and stolen cards, then an unanswered police encounter → custody → lawyer → bail → trial.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { meet } from '../src/sim/world'
import { startEncounter } from '../src/sim/patrol'
import { convictionChance, hireLawyer, postBail } from '../src/sim/legal'
import { DAY, HOUR, fmtTime, inBlock } from '../src/sim/time'
import type { OperationPlan, World } from '../src/sim/types'

const run = (w: World, minutes: number) => { const end = w.time + minutes; while (w.time < end && !w.gameOver) { advance(w, end - w.time); w.pauseRequested = false } }
const wallets = (w: World) => w.people.filter((p) => !p.isPlayer).map((p) => p.cash ?? 0)

// --- 1. Money on people, and taking it
const w = generateWorld('legal')
const cash = wallets(w)
console.log(`wallets: min $${Math.min(...cash)}, max $${Math.max(...cash)}, avg $${Math.round(cash.reduce((a, b) => a + b, 0) / cash.length)}`)
w.player.inventory = { pistol: 1, gloves: 1, mask: 1 }
const t = w.people.find((p) => !p.isPlayer && p.age > 20 && p.habit && ['park', 'lake'].includes(w.locations.find((l) => l.id === p.habit!.locationId)!.kind))!
meet(w, t.id, 'test')
console.log(`target ${t.first}: wallet $${t.cash}, savings $${t.savings}`)
let at = w.time + 3 * HOUR
while (!inBlock(at, t.habit!)) at += HOUR
const op: OperationPlan = { targetId: t.id, locationId: t.habit!.locationId, at, weapon: 'pistol', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'destroyed', bringOwnPhone: false, vehicle: 'car', gloves: true, mask: true, bleach: false, tarp: false, lure: 'none', wallet: 'cards' }
const before = w.player.money
console.log('kill:', schedule(w, { kind: 'operation', op }, at) ?? 'ok')
run(w, at - w.time + 4 * HOUR)
console.log(w.news.filter((n) => n.kind === 'personal').slice(0, 4).map((n) => n.headline))
console.log(`after kill: money +$${w.player.money - before}, cards: ${JSON.stringify(w.player.stolenCards)}`)
const atm = w.locations.find((l) => l.kind === 'gas')!
console.log('ATM:', schedule(w, { kind: 'atm', locationId: atm.id, victimId: t.id }, w.time) ?? 'ok')
run(w, 2 * HOUR)
console.log(w.news.filter((n) => /Withdrew|declined/.test(n.headline)).map((n) => `${n.headline} — ${n.body}`))

// --- 2. Police encounter left unanswered
const w2 = generateWorld('legal2')
w2.player.money = 30000
const v = w2.people.find((p) => !p.isPlayer && p.age > 20)!
startEncounter(w2, w2.locations.find((l) => l.kind === 'alley')!, w2.time, op, undefined, v.id, 'after')
console.log('encounter deadline in', w2.player.encounter!.deadline - w2.time, 'game min (= 10 real min)')
run(w2, 61)
const c = w2.player.custody!
console.log(`custody: ${c.inCustody}, charge "${c.charge}", bail ${c.bail ?? 'denied'}, trial ${fmtTime(c.trialAt)}, chance with public defender ${convictionChance(w2).toFixed(2)}`)
console.log('hire elite:', hireLawyer(w2, 'elite') ?? 'ok', '→ chance', convictionChance(w2).toFixed(2), '| bail:', postBail(w2) ?? 'posted')
console.log('schedule while held:', schedule(w2, { kind: 'scout', locationId: w2.locations[0].id }, w2.time) ?? 'ok')
run(w2, 8 * DAY)
console.log('verdict:', w2.gameOver?.reason ?? w2.news.find((n) => /acquitted/.test(n.headline))?.headline, '| money left', w2.player.money)
