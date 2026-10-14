import { useState } from 'react'
import { useGame } from './state'
import { Badge, Panel } from './widgets'
import { cancelSchedule } from '../sim/actions'
import { unpaidBills } from '../sim/money'
import { LegalPanel } from './Legal'
import { DAY, HOUR, fmtAgo, fmtClock, fmtDays, fmtDuration, fmtHourRange, fmtTime, inBlock } from '../sim/time'
import { GENDER_LABEL, fullName, loc, playerPerson } from '../sim/world'
import type { NewsItem } from '../sim/types'

const KIND_TONE = { news: 'blue', personal: 'amber', scanner: 'red', system: 'muted' } as const

export function NewsList({ items }: { items: NewsItem[] }) {
  const { w } = useGame()
  if (!items.length) return <p className="muted">Nothing yet.</p>
  return (
    <ul className="feed">
      {items.map((n) => (
        <li key={n.id} className={`feed-item ${n.kind}`}>
          <div className="feed-meta">
            <Badge tone={KIND_TONE[n.kind]}>{n.kind === 'news' ? `${w.cityName} Herald` : n.kind === 'scanner' ? 'Police band' : n.kind}</Badge>
            <span className="muted mono">{fmtTime(n.time)} · {fmtAgo(w.time, n.time)}</span>
          </div>
          <strong className="feed-headline">{n.headline}</strong>
          {n.body && <p>{n.body}</p>}
        </li>
      ))}
    </ul>
  )
}

/** The next 24 hours: work shifts on one lane, everything else on the other. */
function DayTimeline() {
  const { w } = useGame()
  const me = playerPerson(w)
  const from = Math.floor(w.time / HOUR) * HOUR
  const span = DAY
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - from) / span) * 100))}%`
  const shifts: { start: number; end: number; sick: boolean }[] = []
  if (w.player.employed && me.shift) {
    for (let t = from - 12 * HOUR; t < from + span; t += HOUR) {
      if (inBlock(t, me.shift) && !inBlock(t - HOUR, me.shift)) {
        let end = t
        while (inBlock(end, me.shift)) end += HOUR
        if (end > from) shifts.push({ start: Math.max(t, from), end: Math.min(end, from + span), sick: w.player.shifts[Math.floor(t / DAY)] === 'sick' })
      }
    }
  }
  const items = w.player.agenda.filter((a) => a.returnAt > from && a.departAt < from + span)
  const clash = (a: { departAt: number; returnAt: number }) => shifts.some((s) => !s.sick && a.departAt < s.end && a.returnAt > s.start)
  return (
    <div className="timeline24">
      <div className="lane-label">Day job</div>
      <div className="lane">
        {shifts.map((s, i) => (
          <div key={i} className={`seg work ${s.sick ? 'sick' : ''}`} style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})` }}>
            {s.sick ? 'Sick day' : me.job}
          </div>
        ))}
        {!shifts.length && <span className="lane-empty">{w.player.employed ? 'No shift in the next 24h' : 'No job'}</span>}
      </div>
      <div className="lane-label">Other life</div>
      <div className="lane">
        {items.map((a) => (
          <div key={a.id} className={`seg ${a.activity.kind === 'operation' ? 'kill' : 'act'} ${clash(a) ? 'clash' : ''}`} title={`${a.label} · ${fmtTime(a.startAt)}`} style={{ left: pct(a.departAt), width: `calc(${pct(a.returnAt)} - ${pct(a.departAt)})` }}>
            {a.label}
          </div>
        ))}
        {!items.length && <span className="lane-empty">Nothing planned</span>}
      </div>
      <div className="lane-label" />
      <div className="ticks">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ left: `${(i / 4) * 100}%` }}>{fmtClock(from + i * 6 * HOUR)}</span>
        ))}
      </div>
    </div>
  )
}

export function Dashboard() {
  const { w, act, go } = useGame()
  const me = playerPerson(w)
  const pl = w.player
  const publicMissing = w.news.filter((n) => n.kind === 'news' && n.headline.startsWith('Search underway')).length
  const publicBodies = w.news.filter((n) => n.kind === 'news' && n.headline.startsWith('Body found')).length

  return (
    <div className="grid two">
      <div className="stack">
        {w.player.custody && <LegalPanel />}
        <Panel title="Two lives — next 24 hours">
          <DayTimeline />
          {pl.agenda.length > 0 ? (
            <ul className="agenda">
              {pl.agenda.map((s) => (
                <li key={s.id} className={s.activity.kind === 'operation' ? 'kill' : ''}>
                  <div>
                    <strong>{s.label}</strong>
                    <div className="muted mono small">
                      {s.departAt < s.startAt ? `leave ${fmtClock(s.departAt)} · ` : ''}{fmtTime(s.startAt)} → {fmtClock(s.endAt)}{s.returnAt > s.endAt ? ` · home ${fmtClock(s.returnAt)}` : ''} · {s.done ? 'heading home' : s.started ? `ends in ${fmtDuration(s.endAt - w.time)}` : `in ${fmtDuration(s.startAt - w.time)}`}
                    </div>
                  </div>
                  {s.started || w.time >= s.departAt ? <Badge tone="amber">{s.started ? 'now' : 'on the way'}</Badge> : <button className="ghost small" onClick={() => act((w) => cancelSchedule(w, s.id))}>Cancel</button>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing planned. You're living your normal life.</p>
          )}
        </Panel>

        {pl.alias && (pl.inventory.fake_id_cheap || pl.inventory.fake_id_good) ? (
          <Panel title="Cover identity" tag={pl.alias.quality === 'good' ? 'QUALITY ID' : 'CHEAP ID'}>
            <dl className="kv">
              <dt>Name on the ID</dt><dd>{pl.alias.first} {pl.alias.last}, {pl.alias.age}</dd>
              <dt>Since</dt><dd>{fmtTime(pl.alias.since)}</dd>
              <dt>Used for</dt><dd>{pl.storage?.alias === 'fake' ? `Storage unit #${pl.storage.unit} at ${loc(w, pl.storage.locationId).name}` : 'Nothing yet'}</dd>
            </dl>
          </Panel>
        ) : null}

        <Panel title="Your life">
          <dl className="kv">
            <dt>Name</dt><dd>{fullName(me)}, {me.age} · {GENDER_LABEL[me.gender]}</dd>
            {(pl.injuredUntil ?? 0) > w.time && (<><dt>Injured</dt><dd><Badge tone="red">Until {fmtTime(pl.injuredUntil!)}</Badge></dd></>)}
            <dt>Home</dt><dd>{loc(w, me.homeId).name}</dd>
            <dt>Job</dt>
            <dd>
              {pl.employed ? `${me.job} at ${loc(w, me.workplaceId!).name}` : <><Badge tone="red">Unemployed</Badge> <a onClick={() => go('work')}>Find work</a></>}
            </dd>
            {pl.employed && me.shift && (
              <>
                <dt>Shift</dt><dd>{fmtHourRange(me.shift.start, me.shift.end)} · {fmtDays(me.shift.days)}</dd>
                <dt>Salary</dt><dd>${pl.salary}/week, paid Fridays</dd>
                <dt>Strikes</dt><dd>{pl.missedShifts}/3</dd>
              </>
            )}
            <dt>Money</dt><dd className={pl.money < 0 ? 'red' : ''}>${pl.money} {unpaidBills(w).length > 0 && <a onClick={() => go('money')}>{unpaidBills(w).length} bill(s) waiting</a>}</dd>
            <dt>Food at home</dt><dd>{pl.food ?? 0} day(s)</dd>
          </dl>
        </Panel>

        <Panel title="What you can tell">
          <dl className="kv">
            <dt>Missing-person appeals</dt><dd>{publicMissing}</dd>
            <dt>Bodies found</dt><dd>{publicBodies}</dd>
            <dt>Task force</dt><dd>{w.taskForce ? <Badge tone="red">Active</Badge> : 'No'}</dd>
            <dt>Questioned by police</dt><dd>{pl.questioned ? <Badge tone="red">Yes</Badge> : 'No'}</dd>
            <dt>Home searched</dt><dd>{pl.searched ? <Badge tone="red">Yes</Badge> : 'No'}</dd>
          </dl>
        </Panel>

        {w.victims.length === 0 && (
          <Panel title="How to play">
            <ol className="tips">
              <li><a onClick={() => go('work')}>Work</a> — you need money. Apply for a job, show up for your shifts.</li>
              <li><a onClick={() => go('people')}>People</a> — research someone online, then <b>tail</b> them to learn their routine.</li>
              <li><a onClick={() => go('locations')}>City</a> — <b>scout</b> places or <b>hang out</b> to meet people.</li>
              <li><a onClick={() => go('shop')}>Shop</a> — buy what you need.</li>
              <li><a onClick={() => go('plan')}>Kill</a> — where, when, how, where the body goes.</li>
            </ol>
          </Panel>
        )}
      </div>

      <Panel title="Latest" actions={<button className="ghost" onClick={() => go('news')}>All news</button>}>
        <NewsList items={w.news.slice(0, 12)} />
      </Panel>
    </div>
  )
}

export function News() {
  const { w } = useGame()
  const [kind, setKind] = useState<NewsItem['kind'] | 'all'>('all')
  const items = w.news.filter((n) => kind === 'all' || n.kind === kind)
  return (
    <Panel
      title="News & alerts"
      actions={(['all', 'news', 'personal', 'scanner'] as const).map((k) => (
        <button key={k} className={kind === k ? 'chip on' : 'chip'} onClick={() => setKind(k)}>{k}</button>
      ))}
    >
      <NewsList items={items} />
    </Panel>
  )
}
