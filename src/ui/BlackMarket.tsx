import { useState } from 'react'
import { useGame } from './state'
import { Badge, Flash, Panel } from './widgets'
import { BLACK_ITEMS, ITEMS } from '../sim/items'
import { schedule } from '../sim/actions'
import { dealerSpot, nextDealTime, payStreetDebt } from '../sim/underworld'
import { districtName, nameOf } from '../sim/world'
import { fmtTime } from '../sim/time'

export function BlackMarket() {
  const { w, act } = useGame()
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  const closed = (w.player.marketClosedUntil ?? 0) > w.time
  const spot = closed ? null : dealerSpot(w)
  const debt = w.player.streetDebt
  const at = nextDealTime(w.time)
  const knowsDealer = w.player.dealerId && w.player.known?.[w.player.dealerId]

  return (
    <div className="stack">
      <Panel title="Black market" tag="CASH ONLY">
        {closed ? (
          <p className="red">Your contact is gone. The number goes straight to voicemail. Maybe someone new will turn up after {fmtTime(w.player.marketClosedUntil!)}.</p>
        ) : (
          <p className="muted">
            A number scrawled in a bar bathroom. Text it what you want and turn up with cash.
            {spot && <> Meets happen at <b>{spot.name}</b> ({districtName(w, spot.districtId)}){knowsDealer ? <> with <b>{nameOf(w, w.player.dealerId!)}</b></> : null}. Next meet: <b>{fmtTime(at)}</b>.</>}
          </p>
        )}
        {debt && (
          <div className="row between wrap debt">
            <span><Badge tone="red">You owe ${debt.amount}</Badge> <span className="muted small">due {fmtTime(debt.dueAt)}</span></span>
            <button className="danger small" onClick={() => {
              const err = act((w) => payStreetDebt(w))
              setMsg({ err, ok: err ? undefined : 'Paid. For now, they leave you alone.' })
            }}>Drop off the cash</button>
          </div>
        )}
        <Flash msg={msg.err} ok={msg.ok} />
      </Panel>
      <div className="grid three">
        {BLACK_ITEMS.map((i) => (
          <div key={i} className="bm-card">
            <div className="bm-name">{ITEMS[i].name}</div>
            <div className="bm-desc">{ITEMS[i].desc}</div>
            <div className="row between">
              <span className="bm-price">${ITEMS[i].price.toLocaleString()}</span>
              <span className="muted small">owned: {w.player.inventory[i] ?? 0}</span>
            </div>
            <button className="danger" disabled={!spot} onClick={() => {
              if (!spot) return
              const err = act((w) => schedule(w, { kind: 'deal', locationId: spot.id, item: i, price: ITEMS[i].price }, at))
              setMsg({ err, ok: err ? undefined : `Meet set for ${fmtTime(at)}. Bring $${ITEMS[i].price} in cash.` })
            }}>Arrange a meet</button>
          </div>
        ))}
      </div>
    </div>
  )
}
