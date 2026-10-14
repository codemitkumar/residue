// One thing at a time; a city that has children; and what happens when one of them is killed.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { DAY, HOUR, fmtTime, inBlock } from '../src/sim/time'
import { fullName, meet } from '../src/sim/world'
import { askOut } from '../src/sim/life'
import { isChild, population, schools } from '../src/sim/population'
import { playerHeat } from '../src/sim/police'
import { answer } from '../src/sim/messages'
import { patrolAt } from '../src/sim/patrol'
import { DONT_TOUCH, anger, angerHeat, angerSpeed } from '../src/sim/anger'

const run = (w: ReturnType<typeof generateWorld>, hours: number) => {
  for (let i = 0; i < hours / 2 && !w.gameOver; i++) {
    w.pauseRequested = false
    w.player.urge = 0
    advance(w, 2 * HOUR)
  }
}

// --- 1. Busy
{
  const w = generateWorld('family1')
  const park = w.locations.find((l) => l.kind === 'park')!
  const friend = w.people.find((p) => w.player.known[p.id] && !p.isPlayer)!
  console.log('scout now:', schedule(w, { kind: 'scout', locationId: park.id }, w.time) ?? 'ok')
  run(w, 2) // on the way / scouting now
  console.log('research now:', schedule(w, { kind: 'research', personId: friend.id }, w.time) ?? 'ok')
  console.log('ask out now:', askOut(w, friend.id) ?? 'ok')
  console.log('research later:', schedule(w, { kind: 'research', personId: friend.id }, w.time + 8 * HOUR) ?? 'ok')
}

// --- 2. Population
{
  const w = generateWorld('family2')
  const kids = () => w.people.filter((p) => p.alive && isChild(p))
  console.log(`\nschools: ${schools(w).map((s) => s.name).join(', ')}`)
  console.log(`start: ${population(w)} residents, ${kids().length} children; school-age at school 10:00 Mon:`, kids().filter((k) => k.shift).length)
  const start = population(w)
  run(w, 60 * 24)
  const born = w.people.filter((p) => p.bornAt !== undefined && p.bornAt > 4 * DAY)
  console.log(`after 60 days: ${population(w)} residents (+${population(w) - start}), ${born.length} born:`, born.slice(0, 5).map((b) => `${fullName(b)} ${fmtTime(b.bornAt!)}`).join('; '))
  console.log('kid cash:', kids().slice(0, 8).map((k) => `${k.age}y $${k.cash}`).join(', '))
}

// --- 3. One careful kill: child vs adult, across seeds. Then three children, and the game getting angrier.
const killAt = (w: ReturnType<typeof generateWorld>, target: ReturnType<typeof generateWorld>['people'][number], from: number) => {
  let at = from
  while (!inBlock(at, target.habit!)) at += HOUR
  meet(w, target.id, 'test')
  return schedule(w, { kind: 'operation', op: { targetId: target.id, locationId: target.habit!.locationId, at, weapon: 'knife', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'destroyed', bringOwnPhone: false, vehicle: 'car', gloves: true, mask: true, bleach: false, tarp: true, lure: 'none' } }, at)
}
const answerCalls = (w: ReturnType<typeof generateWorld>) => {
  for (const m of w.player.messages) if (m.action?.kind === 'alibi' && !m.answered) answer(w, m.id, 'home')
}
const live = (w: ReturnType<typeof generateWorld>, hours: number) => {
  for (let i = 0; i < hours / 2 && !w.gameOver && !w.player.custody; i++) {
    w.pauseRequested = false
    w.player.urge = 0
    advance(w, 2 * HOUR)
    answerCalls(w)
  }
}
const parkGoer = (w: ReturnType<typeof generateWorld>, child: boolean, not: string[] = []) =>
  w.people.find((p) => p.alive && !p.isPlayer && !not.includes(p.id) && p.habit && w.locations.find((l) => l.id === p.habit!.locationId)!.kind === 'park' && (child ? isChild(p) : p.age > 25))
for (const child of [false, true]) {
  let caught = 0
  let n = 0
  const days: number[] = []
  for (const seed of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']) {
    const w = generateWorld(seed)
    w.player.inventory = { knife: 1, gloves: 1, mask: 1, tarp: 1 }
    const t = parkGoer(w, child)
    if (!t) continue
    killAt(w, t, w.time + HOUR)
    w.player.inventory.knife = 1
    live(w, 20 * 24)
    const v = w.victims.find((x) => x.personId === t.id)
    if (!v) continue
    n++
    if (w.player.custody || w.gameOver) {
      caught++
      days.push(Math.round(((w.player.custody?.since ?? w.gameOver!.at) - v.killedAt) / DAY))
    }
  }
  console.log(`\n${child ? 'CHILD' : 'ADULT'} single kill: arrested in ${caught}/${n} runs within 20 days${days.length ? ` (after ${days.join(', ')} days)` : ''}`)
}
{
  const w = generateWorld('k2')
  w.player.inventory = { knife: 1, gloves: 9, mask: 1, tarp: 9 }
  const killed: string[] = []
  const park = parkGoer(w, true)!.habit!.locationId
  const P = w.locations.find((l) => l.id === park)!
  const camsBefore = P.cameras.length
  console.log(`\nthree children, ten days apart (scouted ${P.name}: ${camsBefore} cameras)`)
  for (let k = 0; k < 3 && !w.player.custody && !w.gameOver; k++) {
    const t = parkGoer(w, true, killed)
    if (!t) break
    killed.push(t.id)
    killAt(w, t, w.time + HOUR)
    w.player.inventory.knife = 1 // a fresh, clean knife each time
    live(w, 10 * 24)
    const cams = w.locations.reduce((a, l) => a + l.cameras.length, 0)
    console.log(`  after child ${k + 1}: anger ${anger(w)} | cameras in city ${cams}, at ${P.name} ${P.cameras.length} | patrol at ${P.name} ${patrolAt(w, P, w.time).toFixed(3)} | police speed x${angerSpeed(w).toFixed(2)} | heat x${angerHeat(w).toFixed(2)} | ${w.player.custody ? 'ARRESTED' : 'free'}`)
  }
  live(w, 20 * 24)
  console.log(`  end: ${w.player.custody ? 'in custody' : 'free'} | ${w.gameOver ? `${w.gameOver.childKiller ? DONT_TOUCH + ' ' : ''}${w.gameOver.reason}` : ''}`)
  for (let i = 0; i < 120 && w.player.custody && !w.gameOver; i++) { w.pauseRequested = false; advance(w, 4 * HOUR) } // through the trial
  if (w.gameOver) console.log('  ENDING:', w.gameOver.childKiller ? DONT_TOUCH : '', '|', w.gameOver.reason)
}
