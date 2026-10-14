// Five kills crammed into five days vs the same five spread over twenty-five: the spree gets sloppy and draws heat.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { schedule } from '../src/sim/actions'
import { DAY, HOUR, inBlock } from '../src/sim/time'
import { meet } from '../src/sim/world'
import { answer } from '../src/sim/messages'
import { playerHeat } from '../src/sim/police'
import { spree } from '../src/sim/anger'

for (const seed of ['spree1', 'spree2', 'spree3']) for (const gap of [1, 5]) {
  const w = generateWorld(seed)
  const done: string[] = []
  let maxSpree = 0
  for (let k = 0; k < 5 && !w.player.custody && !w.gameOver; k++) {
    w.player.inventory = { knife: 1, gloves: 1, mask: 1, tarp: 1 }
    w.player.tainted = {}
    const t = w.people.find((p) => p.alive && !p.isPlayer && p.age > 18 && !done.includes(p.id) && p.habit && ['park', 'lake', 'forest'].includes(w.locations.find((l) => l.id === p.habit!.locationId)!.kind))
    if (!t) break
    done.push(t.id)
    meet(w, t.id, 'test')
    let at = w.time + HOUR
    while (!inBlock(at, t.habit!)) at += HOUR
    schedule(w, { kind: 'operation', op: { targetId: t.id, locationId: t.habit!.locationId, at, weapon: 'knife', disposalLocationId: 'none', disposal: 'leave', victimPhone: 'destroyed', bringOwnPhone: false, vehicle: 'car', gloves: true, mask: true, bleach: false, tarp: true, lure: 'none' } }, at)
    for (let h = 0; h < gap * 12 && !w.player.custody && !w.gameOver; h++) {
      w.pauseRequested = false
      w.player.urge = 0
      advance(w, 2 * HOUR)
      maxSpree = Math.max(maxSpree, spree(w))
      for (const m of w.player.messages) if (m.action?.kind === 'alibi' && !m.answered) answer(w, m.id, 'home')
    }
  }
  for (let h = 0; h < 15 * 12 && !w.player.custody && !w.gameOver; h++) {
    w.pauseRequested = false
    w.player.urge = 0
    advance(w, 2 * HOUR)
    for (const m of w.player.messages) if (m.action?.kind === 'alibi' && !m.answered) answer(w, m.id, 'home')
  }
  const mine = w.evidence.filter((e) => e.pointsTo === w.player.personId)
  const forensic = mine.filter((e) => e.kind === 'dna' || e.kind === 'fingerprint').length
  console.log(`${seed} ${gap === 1 ? 'SPREE (a kill a day)' : 'PACED (every 5 days)'}: ${w.victims.length} kills, peak spree ${maxSpree}, DNA/prints left ${forensic}, heat ${playerHeat(w).toFixed(2)}, ${w.player.custody ? 'ARRESTED' : w.gameOver ? 'OVER' : 'free'}`)
  console.log('  ', w.news.filter((n) => n.headline === 'You can’t stop' || n.headline.startsWith('State investigators')).map((n) => n.headline).join(' | ') || '(no spree news)')
}
