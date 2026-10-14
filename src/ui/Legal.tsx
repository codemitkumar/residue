import { useEffect, useState } from 'react'
import { useGame } from './state'
import { Badge, Flash, Panel, Stamp } from './widgets'
import { LAWYERS, convictionChance, courthouse, custodyNotes, hireLawyer, postBail, type LawyerTier } from '../sim/legal'
import { resolveEncounter } from '../sim/patrol'
import { fmtTime } from '../sim/time'
import { loc } from '../sim/world'

/** What your lawyer tells you about your chances — in words, not numbers. */
function lawyerTake(p: number, hasLawyer: boolean) {
  if (!hasLawyer) return 'You don’t have a lawyer yet.'
  return p > 0.75 ? '“I’ll be honest with you. It doesn’t look good.”' : p > 0.5 ? '“They have a lot. We need to find cracks in it.”' : p > 0.25 ? '“We have a fighting chance.”' : '“Between us? They don’t have much.”'
}

export function LegalPanel() {
  const { w, act } = useGame()
  const c = w.player.custody
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  if (!c) return null
  const run = (fn: () => string | null, ok: string) => {
    const err = act(fn)
    setMsg({ err, ok: err ? undefined : ok })
  }
  return (
    <Panel title={c.inCustody ? 'In custody' : 'Out on bail'} tag={`CHARGE: ${c.charge.toUpperCase()}`}>
      <div className="stack-sm">
        <div className="row between wrap">
          <span>Trial: <b>{fmtTime(c.trialAt)}</b> at {courthouse(w).name}</span>
          {c.inCustody ? <Stamp>Held</Stamp> : <Stamp tone="amber">Bail</Stamp>}
        </div>
        <p className="call-text">{lawyerTake(convictionChance(w), !!c.lawyer)}</p>
        <h4>Representation {c.lawyer && <Badge tone="green">{LAWYERS[c.lawyer].name}</Badge>}</h4>
        <div className="lawyers">
          {(Object.keys(LAWYERS) as LawyerTier[]).map((t) => (
            <div key={t} className={`lawyer ${c.lawyer === t ? 'on' : ''}`}>
              <b>{LAWYERS[t].name}</b>
              <span className="muted small">{LAWYERS[t].blurb}</span>
              <span className="mono">{LAWYERS[t].fee ? `$${LAWYERS[t].fee.toLocaleString()}` : 'Free'}</span>
              <button className="small" disabled={c.lawyer === t} onClick={() => run(() => hireLawyer(w, t), `${LAWYERS[t].name} is on your case.`)}>{c.lawyer === t ? 'Hired' : 'Hire'}</button>
            </div>
          ))}
        </div>
        {c.inCustody && (
          <div className="row between wrap">
            <span>{c.bail ? <>Bail: <b>${c.bail.toLocaleString()}</b> <span className="muted small">— you have ${w.player.money.toLocaleString()}</span></> : <Badge tone="red">Bail denied</Badge>}</span>
            {c.bail && <button className="danger" onClick={() => run(() => postBail(w), 'You walk out into the daylight.')}>Post bail</button>}
          </div>
        )}
        {!c.inCustody && <p className="muted small">Your trial is on your calendar. Be there.</p>}
        <ul className="tight small muted">{custodyNotes(w).map((n) => <li key={n}>{n}</li>)}</ul>
        <Flash msg={msg.err} ok={msg.ok} />
      </div>
    </Panel>
  )
}

/** Full-screen alert: a patrol is on you. Decide before the timer runs out. */
export function EncounterAlert({ realDeadline }: { realDeadline: number }) {
  const { w, act } = useGame()
  const e = w.player.encounter
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  if (!e) return null
  const left = Math.max(0, realDeadline - now)
  const mm = Math.floor(left / 60000)
  const ss = Math.floor((left % 60000) / 1000)
  return (
    <div className="encounter">
      <div className="encounter-lights" />
      <div className="encounter-card">
        <div className="encounter-title">POLICE</div>
        <p>A patrol car at {loc(w, e.locationId).name}. {e.phase === 'struggle' ? 'Your target is running toward the lights.' : 'The body is right there in the headlights.'}</p>
        <div className="encounter-timer mono">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
        <div className="encounter-buttons">
          <button className="danger big" onClick={() => act((w) => void resolveEncounter(w, 'run'))}>Run</button>
          <button className="big" onClick={() => act((w) => void resolveEncounter(w, 'hide'))}>Hide</button>
          <button className="ghost big" onClick={() => act((w) => void resolveEncounter(w, 'surrender'))}>Give up</button>
        </div>
        <p className="muted small">If you do nothing, they’ll have you in cuffs when the timer runs out.</p>
      </div>
    </div>
  )
}
