import { useState } from 'react'
import { useGame } from './state'
import { Badge, Flash, Panel, Stamp } from './widgets'
import { applyFor, callInSick, nextShift, quitJob } from '../sim/jobs'
import { fmtDays, fmtHourRange, fmtTime } from '../sim/time'
import { districtName, loc, nameOf, playerPerson } from '../sim/world'
import type { JobListing } from '../sim/types'
import { CommuteCalc } from './Commute'

/** What a job ad says about how hard it is to get. */
const requirement = (l: JobListing) =>
  l.odds >= 0.75 ? 'No experience needed' : l.odds >= 0.6 ? 'Some experience preferred' : l.odds >= 0.45 ? 'Experience required' : 'Qualifications required'

const STATUS: Record<string, { label: string; tone: 'muted' | 'amber' | 'green' | 'red' | 'blue' }> = {
  applied: { label: 'Waiting to hear back', tone: 'muted' },
  interview: { label: 'Interview offered', tone: 'blue' },
  interviewed: { label: 'Interviewed — awaiting decision', tone: 'amber' },
  hired: { label: 'Hired', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export function Work() {
  const { w, act, go } = useGame()
  const me = playerPerson(w)
  const pl = w.player
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  const run = (fn: () => string | null, ok: string) => {
    const err = act(fn)
    setMsg({ err, ok: err ? undefined : ok })
  }
  const listings = (w.jobListings ?? []).filter((l) => l.expiresAt > w.time)
  const apps = [...(pl.applications ?? [])].reverse()
  const ns = nextShift(w)

  return (
    <div className="stack">
      <div className="grid two">
        <Panel title="Your day job" tag={pl.employed ? 'EMPLOYED' : 'UNEMPLOYED'}>
          {pl.employed && me.shift && me.workplaceId ? (
            <div className="stack-sm">
              <div className="row between wrap">
                <h2>{me.job}</h2>
                <Stamp tone="green">On payroll</Stamp>
              </div>
              <dl className="kv">
                <dt>Where</dt><dd>{loc(w, me.workplaceId).name} · {districtName(w, loc(w, me.workplaceId).districtId)}</dd>
                <dt>Hours</dt><dd>{fmtHourRange(me.shift.start, me.shift.end)} · {fmtDays(me.shift.days)}</dd>
                <dt>Salary</dt><dd>${pl.salary}/week · paid Fridays</dd>
                <dt>Boss</dt><dd>{pl.bossId ? nameOf(w, pl.bossId) : '—'}</dd>
                <dt>Next shift</dt><dd>{ns !== null ? fmtTime(ns) : '—'}</dd>
                <dt>Commute</dt><dd><CommuteCalc workplaceId={me.workplaceId} shiftsPerWeek={me.shift.days.length} /></dd>
                <dt>Strikes</dt><dd>{pl.missedShifts > 0 ? <Badge tone={pl.missedShifts >= 2 ? 'red' : 'amber'}>{pl.missedShifts}/3</Badge> : '0/3'}</dd>
              </dl>
              <div className="row wrap">
                <button onClick={() => run(() => callInSick(w), 'You called in sick.')}>Call in sick (next shift)</button>
                <button className="ghost" onClick={() => confirm('Quit your job?') && run(() => quitJob(w), 'You quit.')}>Quit</button>
              </div>
            </div>
          ) : (
            <div className="stack-sm">
              <p>No job. Rent and food don’t pay themselves — <b>${pl.money}</b> left, and $35 goes every day.</p>
              <p className="muted">Apply for something on the board. Employers reply by message.</p>
            </div>
          )}
          <Flash msg={msg.err} ok={msg.ok} />
        </Panel>

        <Panel title="Applications">
          {apps.length === 0 ? <p className="muted">You haven’t applied anywhere.</p> : (
            <ul className="agenda">
              {apps.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.listing.title}</strong> <span className="muted">· {loc(w, a.listing.workplaceId).name}</span>
                    <div className="muted small mono">Applied {fmtTime(a.appliedAt)}{a.interviewAt ? ` · interview ${fmtTime(a.interviewAt)}` : ''}</div>
                  </div>
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
          {apps.some((a) => a.status === 'interview') && <p className="hint"><a onClick={() => go('phone')}>Check your phone</a> to accept interviews.</p>}
        </Panel>
      </div>

      <Panel title={`${w.cityName} Job Board`} tag="NEW LISTINGS EVERY MONDAY">
        {listings.length === 0 ? <p className="muted">Nothing posted right now.</p> : (
          <div className="jobs">
            {listings.map((l) => {
              const place = loc(w, l.workplaceId)
              const applied = pl.applications?.some((a) => a.listing.id === l.id)
              return (
                <div key={l.id} className="job-card">
                  <div className="job-title">{l.title}</div>
                  <div className="muted">{place.name} · {districtName(w, place.districtId)}</div>
                  <div className="job-pay">${l.salary}<span>/week</span></div>
                  <div className="small">{fmtHourRange(l.shift.start, l.shift.end)} · {fmtDays(l.shift.days)}</div>
                  <div className="small muted">{requirement(l)} · closes {fmtTime(l.expiresAt)}</div>
                  <CommuteCalc workplaceId={l.workplaceId} shiftsPerWeek={l.shift.days.length} compact />
                  <button className={applied ? 'ghost' : 'danger'} disabled={applied} onClick={() => run(() => applyFor(w, l.id), `Applied for ${l.title}.`)}>
                    {applied ? 'Applied' : 'Apply'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
