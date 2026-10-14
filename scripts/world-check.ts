// A month of normal life plus a little crime: bills, weather, events, car, black market, trophies.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { meet } from '../src/sim/world'
import { rentStorage, dealSpots, nextDealTime } from '../src/sim/underworld'
import { HOUR, DAY, fmtTime, inBlock } from '../src/sim/time'
import { WEATHER_LABEL } from '../src/sim/environment'

const w = generateWorld(process.argv[2] ?? 'world')
const step = (h: number) => { for (let i = 0; i < h && !w.gameOver; i++) { w.pauseRequested = false; advance(w, HOUR) } }
console.log('car', w.player.car, '| credit', w.player.credit)
// Black market: a quality fake ID and a pistol.
w.player.money = 5000
const alley = dealSpots(w)[0]
console.log('deal ID:', schedule(w, { kind: 'deal', locationId: alley.id, item: 'fake_id_good', price: 1400 }, nextDealTime(w.time)) ?? 'ok')
step(30)
console.log('deal gun:', schedule(w, { kind: 'deal', locationId: alley.id, item: 'pistol', price: 900 }, nextDealTime(w.time)) ?? 'ok')
step(30)
console.log('inventory', w.player.inventory)
const unit = w.locations.find((l) => l.kind === 'storage')!
console.log('storage:', rentStorage(w, unit.id, 'fake') ?? 'ok', w.player.storage)
// A kill with the pistol and a trophy.
const t = w.people.find((p) => !p.isPlayer && p.age > 20 && p.habit && ['park', 'lake'].includes(w.locations.find((l) => l.id === p.habit!.locationId)!.kind))!
meet(w, t.id, 'test')
let at = w.time + 3 * HOUR
while (!inBlock(at, t.habit!)) at += HOUR
console.log('kill:', schedule(w, { kind: 'operation', op: { targetId: t.id, locationId: t.habit!.locationId, at, weapon: 'pistol', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'destroyed', bringOwnPhone: false, vehicle: 'car', gloves: false, mask: false, bleach: false, tarp: false, lure: 'none', trophy: 'jewelry' } }, at) ?? 'ok', fmtTime(at))
step(40 * 24)
console.log('trophies', w.player.trophies, '| victims', w.victims.length, '| car fuel', w.player.car!.fuel.toFixed(0), '| money', w.player.money, '| credit', w.player.credit)
console.log('bills', (w.player.bills ?? []).map((b) => `${b.label} $${b.amount} ${b.paidAt ? 'paid' : b.late ? 'LATE' : 'due'} ${fmtTime(b.dueAt)}`))
console.log('weather seen', [...new Set(w.news.filter((n) => n.headline.startsWith('Weather:')).map((n) => n.headline))].join(', '), '| now', WEATHER_LABEL[w.weather![0].kind])
console.log('events', (w.events ?? []).map((e) => `${e.name} day ${e.day + 1}`).join(' | '))
console.log(w.news.filter((n) => /Today:|Coming up|hunt|Body|Evict|late|Payday|Got it|setup|lost time/i.test(n.headline)).slice(0, 14).reverse().map((n) => `${fmtTime(n.time)} ${n.headline}`).join('\n'))
console.log('over', w.gameOver?.reason, '| day', Math.floor(w.time / DAY) + 1)
