// Apply for every listed job, accept interviews, and follow the career for two weeks.
import { generateWorld } from '../src/sim/worldgen'
import { advance } from '../src/sim/engine'
import { answer, threadName } from '../src/sim/messages'
import { applyFor } from '../src/sim/jobs'
import { HOUR, fmtTime } from '../src/sim/time'

const w = generateWorld(process.argv[2] ?? 'jobs')
console.log('listings:', w.jobListings!.map((l) => `${l.title} $${l.salary}/wk`).join(' | '))
for (const l of w.jobListings!) applyFor(w, l.id)
const start = w.time
while (w.time < start + 14 * 24 * HOUR) {
  w.pauseRequested = false
  advance(w, HOUR)
  for (const m of w.player.messages) if (m.action?.kind === 'interview' && !m.answered) answer(w, m.id, 'yes')
}
for (const m of w.player.messages.filter((m) => m.thread.startsWith('hr:') || m.thread === w.player.bossId)) console.log(`  ${fmtTime(m.time)} ${m.from === 'me' ? '>>' : '<<'} ${threadName(w, m.thread)}: ${m.text.slice(0, 110)}`)
console.log(w.news.filter((n) => /Payday|fired|New face|Interview/.test(n.headline)).map((n) => `${fmtTime(n.time)} ${n.headline}`).reverse().join('\n'))
console.log('employed', w.player.employed, '| job', w.people.find((p) => p.isPlayer)!.job, '| money', w.player.money, '| apps', w.player.applications!.map((a) => a.status).join(','))
