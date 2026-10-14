// Show up to black-market deals broke, across many worlds, and see what happens.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { dealerSpot, nextDealTime } from '../src/sim/underworld'
import { DAY, HOUR } from '../src/sim/time'

const outcomes: Record<string, number> = {}
let shownDebt = false
const genders: Record<string, number> = {}
for (let i = 0; i < 30; i++) {
  const w = generateWorld(`dealer${i}`)
  if (i === 0) for (const p of w.people) genders[p.gender] = (genders[p.gender] ?? 0) + 1
  w.player.money = 50
  const spot = dealerSpot(w)!
  const err = schedule(w, { kind: 'deal', locationId: spot.id, item: 'pistol', price: 900 }, nextDealTime(w.time))
  if (err) { console.log('schedule error', err); continue }
  const step = (h: number) => { for (let k = 0; k < h && !w.gameOver; k++) { w.pauseRequested = false; advance(w, HOUR) } }
  step(24)
  const key = w.victims.length ? 'killed the dealer' : w.player.streetDebt ? 'in debt' : (w.player.injuredUntil ?? 0) > w.time ? 'beaten' : 'other: ' + w.news.slice(0, 3).map((n) => n.headline).join(' / ')
  outcomes[key] = (outcomes[key] ?? 0) + 1
  if (w.player.streetDebt && !shownDebt) {
    shownDebt = true
    w.player.money = 0
    step(16 * 24)
    console.log('DEBT ESCALATION:', w.news.filter((n) => /smashed|hurt|Burned|owe the dealer/.test(n.headline)).reverse().map((n) => n.headline).join(' → '), '| car', w.player.car?.condition, '| market closed until day', Math.floor((w.player.marketClosedUntil ?? 0) / DAY) + 1)
  }
  if (key === 'killed the dealer' && !outcomes['_shownKill']) {
    outcomes['_shownKill'] = 1
    console.log('KILL:', w.news.slice(0, 4).map((n) => `${n.headline} — ${n.body.slice(0, 90)}`).join('\n      '))
    console.log('  evidence on player:', w.evidence.filter((e) => e.pointsTo === w.player.personId).map((e) => e.kind).join(', '), '| urge', w.player.urge)
  }
}
console.log('genders in one city:', genders)
console.log('outcomes over 30 broke deals:', outcomes)
