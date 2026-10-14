import { useState } from 'react'
import { useGame } from './state'
import { Badge, Flash, Meter, Panel } from './widgets'
import { credit, payBill, takeLoan, unpaidBills } from '../sim/money'
import { schedule } from '../sim/actions'
import { travelMinutes } from '../sim/geo'
import { fmtTime } from '../sim/time'
import { districtName, playerPerson } from '../sim/world'
import { CommuteCalc } from './Commute'

const creditLabel = (c: number) => (c >= 740 ? 'Excellent' : c >= 670 ? 'Good' : c >= 580 ? 'Fair' : c >= 500 ? 'Poor' : 'Very poor')

export function Money() {
  const { w, act } = useGame()
  const pl = w.player
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  const run = (fn: () => string | null, ok: string) => {
    const err = act(fn)
    setMsg({ err, ok: err ? undefined : ok })
  }
  const bills = [...(pl.bills ?? [])].sort((a, b) => Number(!!a.paidAt) - Number(!!b.paidAt) || a.dueAt - b.dueAt)
  const owed = (pl.loans ?? []).reduce((a, l) => a + l.balance, 0)
  const c = credit(w)
  const car = pl.car
  const stations = w.locations.filter((l) => l.kind === 'gas')
  const home = playerPerson(w).homeId

  return (
    <div className="stack">
      <div className="grid two">
        <Panel title="City Bank" tag="CHECKING">
          <div className="bank-balance">
            <span className="muted small">Balance</span>
            <span className={`big-num ${pl.money < 0 ? 'red' : 'green'}`}>${pl.money.toLocaleString()}</span>
          </div>
          <dl className="kv">
            <dt>Credit score</dt><dd>{c} · {creditLabel(c)} <Meter value={(c - 300) / 550} good /></dd>
            <dt>Loans owed</dt><dd>${owed.toLocaleString()}</dd>
            <dt>Unpaid bills</dt><dd>{unpaidBills(w).length ? <Badge tone="amber">{unpaidBills(w).length}</Badge> : 'None'}</dd>
            <dt>Autopay</dt>
            <dd>
              <label className="check">
                <input type="checkbox" checked={pl.autopay !== false} onChange={(e) => act((w) => void (w.player.autopay = e.target.checked))} />
                <span>Pay bills automatically on the due date (if there’s money)</span>
              </label>
            </dd>
          </dl>
          <h4>Borrow</h4>
          <div className="row wrap">
            {[500, 1000, 2500, 5000].map((a) => (
              <button key={a} className="small" onClick={() => run(() => takeLoan(w, a), `Borrowed $${a}.`)}>${a.toLocaleString()}</button>
            ))}
          </div>
          {(pl.loans ?? []).map((l) => (
            <p key={l.id} className="small mono">Loan {l.id}: ${l.balance} left · ${l.weekly}/week</p>
          ))}
          <Flash msg={msg.err} ok={msg.ok} />
        </Panel>

        <Panel title="Your car" tag={car?.plate ?? 'NO CAR'}>
          {car ? (
            <div className="stack-sm">
              <dl className="kv">
                <dt>Fuel</dt><dd><Meter value={car.fuel / 100} good /> {Math.round(car.fuel)}%</dd>
                <dt>Condition</dt><dd><Meter value={car.condition / 100} good /> {Math.round(car.condition)}%</dd>
                <dt>Status</dt><dd>{(car.inShopUntil ?? 0) > w.time ? <Badge tone="red">In the garage until {fmtTime(car.inShopUntil!)}</Badge> : <Badge tone="green">Drivable</Badge>}</dd>
                {w.player.employed && playerPerson(w).workplaceId && playerPerson(w).shift && (
                  <>
                    <dt>Commute</dt>
                    <dd><CommuteCalc workplaceId={playerPerson(w).workplaceId!} shiftsPerWeek={playerPerson(w).shift!.days.length} compact /></dd>
                  </>
                )}
                <dt>Blood in it</dt><dd>{pl.carTraces.length ? <Badge tone="red">Maybe</Badge> : 'Not that you know of'}</dd>
              </dl>
              {stations.map((s) => (
                <div key={s.id} className="row between wrap">
                  <span>{s.name} <span className="muted small">· {districtName(w, s.districtId)} · {travelMinutes(w, home, s.id)} min</span></span>
                  <div className="row">
                    <button className="small" onClick={() => run(() => schedule(w, { kind: 'refuel', locationId: s.id }, w.time), 'Heading to the pump.')}>Fill up (${Math.round(100 - car.fuel)})</button>
                    <button className="small ghost" onClick={() => run(() => schedule(w, { kind: 'service_car', locationId: s.id }, w.time), 'Booked a service.')}>Service ($120)</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="muted">No car.</p>}
        </Panel>
      </div>

      <Panel title="Bills">
        {bills.length === 0 ? <p className="muted">Nothing yet. Rent is due every 28 days.</p> : (
          <table>
            <thead><tr><th>Bill</th><th>Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className={b.paidAt ? 'muted' : ''}>
                  <td>{b.label}</td>
                  <td className="mono">${b.amount}</td>
                  <td className="mono">{fmtTime(b.dueAt)}</td>
                  <td>{b.paidAt ? <Badge tone="green">Paid</Badge> : b.late ? <Badge tone="red">Late</Badge> : b.dueAt < w.time ? <Badge tone="amber">Due</Badge> : <Badge>Upcoming</Badge>}</td>
                  <td>{!b.paidAt && <button className="small" onClick={() => run(() => payBill(w, b.id), `Paid ${b.label}.`)}>Pay</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
