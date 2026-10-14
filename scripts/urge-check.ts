// Push the urge to the edge and watch what happens.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { HOUR, fmtTime } from '../src/sim/time'

const w = generateWorld(process.argv[2] ?? 'urge')
w.player.urge = 0.97
for (let i = 0; i < 24 * 20 && !w.gameOver; i++) { w.pauseRequested = false; advance(w, HOUR) }
console.log(w.news.filter((n) => n.kind !== 'system').slice(0, 40).reverse().filter((n) => /lost time|Restless|sleep|loud|Last chance|Body|missing|hunt|link/i.test(n.headline)).map((n) => `${fmtTime(n.time)} [${n.kind}] ${n.headline} — ${n.body.slice(0, 140)}`).join('\n'))
console.log('victims', w.victims.length, '| urge', (w.player.urge ?? 0).toFixed(2), '| evidence on player', w.evidence.filter((e) => e.pointsTo === w.player.personId).map((e) => e.kind).join(','), '| over', w.gameOver?.reason)
