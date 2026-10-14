import { useGame } from './state'
import { BUS_FARE, commuteFor } from '../sim/car'

/** Fuel maths for driving to a workplace and back on every shift. */
export function CommuteCalc({ workplaceId, shiftsPerWeek, compact }: { workplaceId: string; shiftsPerWeek: number; compact?: boolean }) {
  const { w } = useGame()
  const c = commuteFor(w, workplaceId, shiftsPerWeek)
  const fuel = w.player.car?.fuel ?? 0
  if (compact) {
    return (
      <div className="small commute-line">
        🚗 {c.minutes} min each way · {c.fuel}% fuel/day · ~${c.costPerWeek}/wk
      </div>
    )
  }
  return (
    <div className="commute">
      <div className="commute-grid">
        <div><span>Drive each way</span><b>{c.minutes} min</b></div>
        <div><span>Fuel per round trip</span><b>{c.fuel}%</b></div>
        <div><span>Fuel cost per day</span><b>${c.costPerDay}</b></div>
        <div><span>Per week ({shiftsPerWeek} shifts)</span><b>${c.costPerWeek}</b></div>
        <div><span>A full tank lasts</span><b>{Number.isFinite(c.daysPerTank) ? `${c.daysPerTank} workdays` : '—'}</b></div>
        <div><span>Your tank now covers</span><b>{c.fuel ? `${Math.floor(fuel / c.fuel)} workday(s)` : '—'}</b></div>
      </div>
      <p className="hint">No car or no gas on a workday means the bus: ${BUS_FARE * 2} a day.</p>
    </div>
  )
}
