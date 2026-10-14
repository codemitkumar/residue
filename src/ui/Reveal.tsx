import { useGame } from './state'
import { DONT_TOUCH } from '../sim/anger'
import { Avatar, Badge, Panel, Stamp } from './widgets'
import { playerHeat } from '../sim/police'
import { dayOf, fmtTime } from '../sim/time'
import { loc, nameOf, playerPerson } from '../sim/world'
import type { Evidence, World } from '../sim/types'

function EvidenceTable({ w, items }: { w: World; items: Evidence[] }) {
  return (
    <table>
      <thead><tr><th>Kind</th><th>Status</th><th>Strength</th><th>Detail</th></tr></thead>
      <tbody>
        {items.map((e) => (
          <tr key={e.id}>
            <td>{e.kind}</td>
            <td>
              {e.discovered ? <Badge tone="red">found</Badge> : e.expiresAt && e.expiresAt <= w.time ? <Badge>overwritten</Badge> : <Badge tone="green">hidden</Badge>}
            </td>
            <td className="mono">{e.strength.toFixed(2)}{e.needsSample ? ' (needs sample)' : ''}</td>
            <td>{e.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Developer view of the hidden truth. */
export function Truth() {
  const { w } = useGame()
  return (
    <div className="stack">
      <Panel title="Truth (developer view)">
        <p>Police heat on you: <b className="mono">{playerHeat(w).toFixed(2)}</b> <span className="muted">(questioning ≥0.5 · warrant ≥1.1 · arrest ≥1.7)</span></p>
      </Panel>
      {w.victims.map((v) => {
        const c = w.cases.find((x) => x.id === v.caseId)
        return (
          <Panel key={v.personId} title={`${nameOf(w, v.personId)} — ${v.foundAt ? 'body found' : v.reportedAt ? 'reported missing' : 'nobody has noticed'}`}>
            <p className="muted">
              Killed {fmtTime(v.killedAt)} at {loc(w, v.killLocationId).name} · body: {v.disposal} at {loc(w, v.bodyLocationId).name} · worry:{' '}
              {Object.entries(v.worry).map(([k, x]) => `${nameOf(w, k)} ${x.toFixed(2)}`).join(', ') || '—'}
            </p>
            {c && (
              <>
                <h4>Case ({c.type}, {c.status})</h4>
                <ul className="tight mono small">
                  {c.log.map((l, i) => <li key={i}>{fmtTime(l.time)} — {l.text}</li>)}
                  {c.tasks.map((t) => <li key={t.id} className="muted">queued: {t.kind} {t.locationId ? `@ ${loc(w, t.locationId).name}` : ''} due {fmtTime(t.dueAt)}</li>)}
                </ul>
              </>
            )}
            <EvidenceTable w={w} items={w.evidence.filter((e) => e.victimId === v.personId)} />
          </Panel>
        )
      })}
      {w.cases.filter((c) => !w.victims.some((v) => v.caseId === c.id)).map((c) => (
        <Panel key={c.id} title={`${c.type} case: ${nameOf(w, c.victimId)}`}>
          <ul className="tight mono small">{c.log.map((l, i) => <li key={i}>{fmtTime(l.time)} — {l.text}</li>)}</ul>
        </Panel>
      ))}
    </div>
  )
}

export function GameOverScreen({ devReset }: { devReset?: () => void }) {
  const { w } = useGame()
  const log = w.cases.flatMap((c) => c.log.map((l) => ({ ...l, victim: nameOf(w, c.victimId) }))).sort((a, b) => a.time - b.time)
  const hidden = w.evidence.filter((e) => e.pointsTo === w.player.personId && !e.discovered && e.victimId)
  return (
    <div className="gameover">
      <div className="mugshot">
        <Avatar p={playerPerson(w)} size={140} />
        <div className="mug-plate mono">{w.cityName.toUpperCase()} PD · {fmtTime(w.gameOver!.at)}<br />{nameOf(w, w.player.personId).toUpperCase()}</div>
        <Stamp tone={w.gameOver?.kind === 'surrendered' ? 'amber' : 'red'}>{w.gameOver?.kind === 'surrendered' ? 'Surrendered' : w.gameOver?.kind === 'convicted' ? 'Guilty' : 'Caught'}</Stamp>
      </div>
      {w.gameOver?.childKiller && <p className="lead dont-touch">{DONT_TOUCH}</p>}
      <p className="lead">{w.gameOver?.reason}</p>
      <p className="muted">
        You lasted {dayOf(w.gameOver!.at) - 3} days in {w.cityName}. Victims: {w.victims.length}.
      </p>
      <Panel title={w.gameOver?.kind === 'surrendered' ? 'What they had on you' : 'How they got you'}>
        <ul className="timeline">
          {log.map((l, i) => (
            <li key={i}>
              <span className="mono muted">{fmtTime(l.time)}</span> <Badge>{l.victim}</Badge> {l.text}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="What they never found">
        {hidden.length ? <EvidenceTable w={w} items={hidden} /> : <p className="muted">Nothing — they found it all.</p>}
      </Panel>
      <p className="the-end">There is no second chance. This was your only life in {w.cityName}.</p>
      {devReset && <button className="ghost small" onClick={() => confirm('Dev only: wipe this ending and play again?') && devReset()}>Dev: wipe and start over</button>}
    </div>
  )
}
