// Lift a scapegoat's DNA, plant it at a kill, phone in a tip, and see who takes the fall.
// `npm run frame` frames someone who lives alone (no alibi); `npm run frame -- alibi` picks someone at work then.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { DAY, HOUR, fmtTime, inBlock } from '../src/sim/time'
import { fullName, housemates, meet, whereIs } from '../src/sim/world'
import { callTip } from '../src/sim/frame'
import { playerHeat } from '../src/sim/police'

const wantAlibi = process.argv[2] === 'alibi'
const w = generateWorld('frame1')
w.player.inventory = { knife: 1, gloves: 3, tarp: 1, clean_burner: 1, mask: 1 }
const target = w.people.find((p) => !p.isPlayer && p.alive && p.age > 18 && p.habit && ['park', 'lake'].includes(w.locations.find((l) => l.id === p.habit!.locationId)!.kind))!
meet(w, target.id, 'test')
let at = w.time + DAY
while (!inBlock(at, target.habit!)) at += HOUR

// Scapegoat: no alibi (home alone) or a solid one (on shift) at the time of the kill.
const goat = w.people.find((p) => !p.isPlayer && p.alive && p.id !== target.id && p.age > 18 && p.shift && p.workplaceId &&
  (wantAlibi ? inBlock(at, p.shift) : whereIs(p, at) === p.homeId && !housemates(w, p).length))!
meet(w, goat.id, 'test')
console.log(`target ${fullName(target)}, kill at ${fmtTime(at)}; scapegoat ${fullName(goat)} (${wantAlibi ? 'at work then' : 'home alone then'})`)

// Take something of theirs while they're at work.
let liftAt = w.time + HOUR
while (!inBlock(liftAt, goat.shift!) || liftAt + 2 * HOUR > at) liftAt += HOUR
for (let tries = 0; tries < 6 && !w.player.keepsakes?.length; tries++) {
  console.log('lift:', schedule(w, { kind: 'lift', personId: goat.id }, liftAt) ?? `scheduled ${fmtTime(liftAt)}`)
  w.pauseRequested = false
  advance(w, liftAt + 4 * HOUR - w.time)
  liftAt += DAY
}
const k = w.player.keepsakes?.[0]
if (!k) throw new Error('never got a keepsake')
console.log('keepsake:', k.what, k.noticed ? '(noticed!)' : '')
while (at < w.time + HOUR) at += DAY

console.log(schedule(w, { kind: 'operation', op: { targetId: target.id, locationId: target.habit!.locationId, at, weapon: 'knife', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'destroyed', bringOwnPhone: false, vehicle: 'car', gloves: true, mask: true, bleach: false, tarp: true, lure: 'none', plant: k.id } }, at) ?? 'op scheduled')

let tipped = false
for (let i = 0; i < 400 && !w.gameOver; i++) {
  w.pauseRequested = false
  w.player.urge = 0 // no blackouts muddying the test
  advance(w, 2 * HOUR)
  const c = w.cases.find((x) => x.victimId === target.id)
  if (c && !tipped && c.type === 'homicide') {
    tipped = true
    console.log(`[${fmtTime(w.time)}] tip:`, callTip(w, c.id, goat.id, 'burner') ?? 'called in')
  }
  if (c && c.status === 'closed') break
  if (w.time > at + 20 * DAY) break
}
const c = w.cases.find((x) => x.victimId === target.id)
for (const l of c?.log ?? []) console.log(`  ${fmtTime(l.time)}  ${l.text}`)
console.log('suspicion:', Object.fromEntries(Object.entries(c?.suspicion ?? {}).map(([id, v]) => [fullName(w.people.find((p) => p.id === id)!), v.toFixed(2)])))
console.log('charged:', c?.charged ? fullName(w.people.find((p) => p.id === c.charged)!) : 'nobody', '| status', c?.status, '| player heat', playerHeat(w).toFixed(2), '| over', w.gameOver?.reason ?? '-')
for (const x of w.cases) console.log('case', x.type, fullName(w.people.find((p) => p.id === x.victimId)!), x.status, (x.suspicion[w.player.personId] ?? 0).toFixed(2), x.log.slice(0, 1).map((l) => l.text).join())
