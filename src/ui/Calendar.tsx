import { useState } from 'react'
import { useGame } from './state'
import { Badge, Flash, Panel } from './widgets'
import { cancelSchedule } from '../sim/actions'
import { DAY, DOW, HOUR, dayOf, fmtClock, fmtTime, inBlock } from '../sim/time'
import { playerPerson } from '../sim/world'
import { WEATHER_ICON } from '../sim/environment'
import type { ScheduledActivity } from '../sim/types'

const ROW = 22 // px per hour

interface Block {
  key: string
  start: number
  end: number
  label: string
  kind: 'work' | 'sick' | 'kill' | 'life' | 'job' | 'plan'
  item?: ScheduledActivity
}

const kindOf = (s: ScheduledActivity): Block['kind'] =>
  s.activity.kind === 'operation' ? 'kill' : s.activity.kind === 'obligation' ? 'life' : s.activity.kind === 'interview' ? 'job' : 'plan'

export function Calendar() {
  const { w, act } = useGame()
  const me = playerPerson(w)
  const [sel, setSel] = useState<string>()
  const [err, setErr] = useState<string | null>(null)
  const today = dayOf(w.time)
  const from = today * DAY
  const to = from + 7 * DAY

  const blocks: Block[] = []
  if (w.player.employed && me.shift) {
    for (let t = from - DAY; t < to; t += HOUR) {
      if (!inBlock(t, me.shift) || inBlock(t - HOUR, me.shift)) continue
      let end = t
      while (inBlock(end, me.shift)) end += HOUR
      const sick = w.player.shifts[dayOf(t)] === 'sick'
      blocks.push({ key: `shift${t}`, start: t, end, label: sick ? 'Sick day' : me.job, kind: sick ? 'sick' : 'work' })
    }
  }
  for (const s of w.player.agenda) blocks.push({ key: s.id, start: s.departAt, end: s.returnAt, label: s.label, kind: kindOf(s), item: s })

  // Split blocks at midnight so each day column draws its own piece.
  const pieces = (day: number) =>
    blocks.flatMap((b) => {
      const ds = day * DAY
      const de = ds + DAY
      if (b.end <= ds || b.start >= de) return []
      return [{ ...b, top: ((Math.max(b.start, ds) - ds) / HOUR) * ROW, height: ((Math.min(b.end, de) - Math.max(b.start, ds)) / HOUR) * ROW }]
    })

  const selected = w.player.agenda.find((s) => s.id === sel)
  const clashes = (s: ScheduledActivity) => blocks.some((b) => b.kind === 'work' && s.departAt < b.end && s.returnAt > b.start) && !(s.activity.kind === 'obligation' && s.activity.obligation.type === 'overtime')

  return (
    <div className="stack">
      <Panel title="Calendar — this week" tag="BOTH LIVES">
        <div className="cal">
          <div className="cal-hours">
            <div className="cal-head" />
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-hour" style={{ height: ROW }}>{h % 3 === 0 ? `${String(h).padStart(2, '0')}:00` : ''}</div>)}
          </div>
          {Array.from({ length: 7 }, (_, i) => {
            const day = today + i
            return (
              <div key={day} className={`cal-day ${i === 0 ? 'today' : ''}`}>
                <div className="cal-head">
                  {i === 0 ? 'Today' : DOW[day % 7]}
                  <span>Day {day + 1} · {(() => { const wx = w.weather?.find((x) => x.day === day); return wx ? `${WEATHER_ICON[wx.kind]} ${wx.temp}°` : '' })()}</span>
                </div>
                {(w.events ?? []).filter((e) => e.day === day).map((e) => <div key={e.id} className={`cal-event ${e.kind}`} title={e.name}>{e.name}</div>)}
                <div className="cal-body" style={{ height: 24 * ROW }}>
                  {Array.from({ length: 8 }, (_, k) => <div key={k} className="cal-line" style={{ top: k * 3 * ROW }} />)}
                  {pieces(day).map((p) => (
                    <div key={p.key + day} className={`cal-block ${p.kind} ${sel === p.key ? 'sel' : ''}`} style={{ top: p.top, height: Math.max(p.height, 12) }}
                      title={`${p.label} · ${fmtTime(p.start)}–${fmtClock(p.end)}`} onClick={() => p.item && setSel(p.key)}>
                      {p.height >= 18 && <span>{p.label}</span>}
                    </div>
                  ))}
                  {i === 0 && <div className="cal-now" style={{ top: ((w.time - from) / HOUR) * ROW }} />}
                </div>
              </div>
            )
          })}
        </div>
        <div className="map-legend">
          <span><i className="cl work" /> work</span>
          <span><i className="cl life" /> life</span>
          <span><i className="cl job" /> interview</span>
          <span><i className="cl plan" /> your plans</span>
          <span><i className="cl kill" /> kill</span>
        </div>
      </Panel>

      {selected && (
        <Panel title={selected.label}>
          <p className="mono">Leave {fmtTime(selected.departAt)} · there {fmtClock(selected.startAt)}–{fmtClock(selected.endAt)} · home {fmtClock(selected.returnAt)}</p>
          {clashes(selected) && <p><Badge tone="amber">During a work shift</Badge></p>}
          {selected.started ? <Badge tone="amber">Happening now</Badge> : (
            <button className={selected.fixed ? 'danger' : 'ghost'} onClick={() => {
              const e = act((w) => cancelSchedule(w, selected.id))
              setErr(e)
              if (!e) setSel(undefined)
            }}>{selected.fixed ? 'Skip it' : 'Cancel'}</button>
          )}
          <Flash msg={err} />
        </Panel>
      )}
    </div>
  )
}
