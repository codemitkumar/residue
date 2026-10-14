// Get a job, then watch the tank across a week of commuting and compare with the calculator.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { answer } from '../src/sim/messages'
import { applyFor } from '../src/sim/jobs'
import { commuteFor } from '../src/sim/car'
import { HOUR, fmtTime } from '../src/sim/time'

const w = generateWorld(process.argv[2] ?? 'commute')
const me = w.people.find((p) => p.isPlayer)!
const step = (h: number) => {
  for (let i = 0; i < h && !w.gameOver; i++) {
    w.pauseRequested = false
    advance(w, HOUR)
    for (const m of w.player.messages) if (m.choices && !m.answered && m.action?.kind === 'interview') answer(w, m.id, 'yes')
  }
}
for (let week = 0; week < 6 && !w.player.employed; week++) {
  for (const l of w.jobListings ?? []) applyFor(w, l.id)
  step(7 * 24)
}
if (!w.player.employed) throw new Error('never hired')
const calc = commuteFor(w, me.workplaceId!, me.shift!.days.length)
console.log(`Hired: ${me.job}. Calculator says: ${calc.minutes} min each way, ${calc.fuel}% per day, $${calc.costPerWeek}/week, ${calc.daysPerTank} days per tank.`)

// Clear the calendar so only commuting uses the car, fill up, and watch a week.
w.player.agenda = []
w.player.lifeLog = { ...(w.player.lifeLog ?? {}) }
w.player.car!.fuel = 100
w.player.money += 1000
const log: string[] = []
let last = w.player.car!.fuel
for (let h = 0; h < 7 * 24; h++) {
  w.player.agenda = w.player.agenda.filter((a) => a.activity.kind !== 'obligation')
  step(1)
  const f = w.player.car!.fuel
  if (f !== last) log.push(`${fmtTime(w.time)} fuel ${last}% → ${f}% (−${last - f})`)
  last = f
}
console.log(log.join('\n'))
console.log('bus rides:', w.news.filter((n) => n.headline === 'Took the bus to work').length)
