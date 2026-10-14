import type { ReactNode } from 'react'
import { DAY, DOW, HOUR, dayOf } from '../sim/time'
import type { Minute, Person } from '../sim/types'
import { Face } from './Face'

export function Panel({ title, children, actions, tag, variant = 'file' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; tag?: string; variant?: 'file' | 'plain' }) {
  return (
    <section className={`panel ${variant}`}>
      {tag && <span className="panel-tag">{tag}</span>}
      {(title || actions) && (
        <header className="panel-head">
          <h3>{title}</h3>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export const Badge = ({ tone = 'muted', children }: { tone?: 'muted' | 'red' | 'amber' | 'green' | 'blue'; children: ReactNode }) => (
  <span className={`badge ${tone}`}>{children}</span>
)

export const Stamp = ({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'green' | 'amber' }) => <span className={`stamp ${tone}`}>{children}</span>

/** Portrait photo for a resident. */
export function Avatar({ p, size = 36 }: { p: Person; size?: number }) {
  return (
    <span className={`avatar ${p.alive ? '' : 'dead'}`} style={{ width: size, height: size }}>
      <Face p={p} size={size} />
    </span>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

/** 0..1 meter with segmented cells. */
export function Meter({ value, label, segments = 10, good }: { value: number; label?: string; segments?: number; good?: boolean }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * segments)
  return (
    <div className={`meter ${good ? 'good' : ''}`} title={label}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={i < on ? `on ${i >= segments * 0.7 ? 'hot' : i >= segments * 0.4 ? 'warm' : ''}` : ''} />
      ))}
    </div>
  )
}

/** Choose a day (today … +6) and an hour; yields an absolute game time. */
export function TimePicker({ now, value, onChange }: { now: Minute; value: Minute; onChange: (t: Minute) => void }) {
  const today = dayOf(now)
  const offset = Math.max(0, dayOf(value) - today)
  const hour = Math.floor((value % DAY) / HOUR)
  const set = (o: number, h: number) => onChange((today + o) * DAY + h * HOUR)
  return (
    <div className="row">
      <select value={offset} onChange={(e) => set(+e.target.value, hour)}>
        {Array.from({ length: 7 }, (_, i) => (
          <option key={i} value={i}>
            {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : ''} {DOW[(today + i) % 7]} (Day {today + i + 1})
          </option>
        ))}
      </select>
      <select value={hour} onChange={(e) => set(offset, +e.target.value)}>
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, '0')}:00
          </option>
        ))}
      </select>
    </div>
  )
}

/** 24-hour strip; unknown hours shown as hatched. */
export function TrafficStrip({ traffic, highlight }: { traffic: Record<number, number>; highlight?: number }) {
  return (
    <div className="traffic">
      {Array.from({ length: 24 }, (_, h) => {
        const v = traffic[h]
        const known = v !== undefined
        const level = !known ? 'unknown' : v < 0.1 ? 'quiet' : v < 0.35 ? 'some' : 'busy'
        return (
          <div key={h} className={`tcell ${level} ${highlight === h ? 'hl' : ''}`} title={`${String(h).padStart(2, '0')}:00 — ${known ? level : 'not observed'}`}>
            {h % 6 === 0 && <span>{h}</span>}
          </div>
        )
      })}
    </div>
  )
}

export const Flash = ({ msg, ok }: { msg: string | null; ok?: string }) =>
  msg ? <div className="flash err">{msg}</div> : ok ? <div className="flash ok">{ok}</div> : null
