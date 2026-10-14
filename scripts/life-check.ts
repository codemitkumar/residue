// Two lives: get a job, skip work, get obligations, date someone. Prints what happened.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { answer, threadName } from '../src/sim/messages'
import { applyFor, nextShift } from '../src/sim/jobs'
import { askOut, propose } from '../src/sim/life'
import { schedule } from '../src/sim/actions'
import { DAY, HOUR, fmtTime } from '../src/sim/time'

const w = generateWorld(process.argv[2] ?? 'life2')
const me = w.people.find((p) => p.isPlayer)!
const step = (hours: number) => {
  for (let i = 0; i < hours; i++) {
    w.pauseRequested = false
    advance(w, HOUR)
    for (const m of w.player.messages) if (m.choices && !m.answered && (m.action?.kind === 'interview' || m.action?.kind === 'invite' || m.action?.kind === 'spouse')) answer(w, m.id, m.choices[0].id)
  }
}
// 1. Job hunt until hired
for (let week = 0; week < 4 && !w.player.employed; week++) {
  for (const l of w.jobListings ?? []) applyFor(w, l.id)
  step(7 * 24)
}
console.log('HIRED:', w.player.employed, me.job, `$${w.player.salary}/wk`, 'day', Math.floor(w.time / DAY) + 1)
// 2. Slip out during a shift
const ns = nextShift(w)
if (ns !== null) {
  const bar = w.locations.find((l) => l.kind === 'park')!
  console.log('scout during shift:', schedule(w, { kind: 'scout', locationId: bar.id }, ns + 2 * HOUR) ?? 'ok')
  step(Math.ceil((ns - w.time) / HOUR) + 6)
}
console.log('strikes', w.player.missedShifts, '| absences on file', w.evidence.filter((e) => e.kind === 'absence').map((e) => e.description))
// 3. Romance
const crush = w.people.find((p) => w.player.known[p.id] && !p.isPlayer && p.alive && Math.abs(p.age - me.age) < 10 && !me.relations.some((r) => r.personId === p.id && r.type === 'family'))!
console.log('ask out', crush.first, askOut(w, crush.id) ?? 'ok')
step(14 * 24)
console.log('romance', w.player.romance?.status, w.player.romance?.affection.toFixed(2))
if (w.player.romance?.status === 'dating') { w.player.money += 1000; console.log('propose', propose(w) ?? 'asked'); step(10 * 24) }
console.log('romance after', w.player.romance?.status)
// 4. What the calendar looked like
console.log('agenda now:', w.player.agenda.map((a) => `${a.label} ${fmtTime(a.departAt)}→${fmtTime(a.returnAt)}${a.fixed ? ' [life]' : ''}`))
console.log(w.news.filter((n) => n.kind === 'personal').slice(0, 14).map((n) => `${fmtTime(n.time)} ${n.headline}`).reverse().join('\n'))
console.log('money', w.player.money, 'food', w.player.food, '| threads', [...new Set(w.player.messages.map((m) => threadName(w, m.thread)))].join(', '))
