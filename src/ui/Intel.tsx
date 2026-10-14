import { useState } from 'react'
import { useGame } from './state'
import { Avatar, Badge, Flash, Panel, Stamp, TimePicker, TrafficStrip } from './widgets'
import { MAP_H, MAP_W, PIN, cityLayout, hoursLabel, isOpen, travelMinutes } from '../sim/geo'
import { DISPOSAL_KINDS, disposalFor, schedule } from '../sim/actions'
import { DAY, dayOf, fmtDays, fmtHourRange, fmtTime, nextOccurrence } from '../sim/time'
import { askOut, canAskOut, giveGift, propose, startFamily } from '../sim/life'
import { patrolAt, presenceLabel, roadblockIn } from '../sim/patrol'
import { callTip, tipCases } from '../sim/frame'
import { GENDER_ICON, GENDER_LABEL, districtName, fullName, housemates, loc, nameOf, playerPerson } from '../sim/world'
import type { Location, Person } from '../sim/types'

const KIND_LABEL: Record<string, string> = {
  house: 'House', apartment: 'Apartments', office: 'Office', factory: 'Factory', bar: 'Bar', restaurant: 'Restaurant',
  hardware: 'Hardware store', pharmacy: 'Pharmacy', grocery: 'Grocery', gym: 'Gym', hospital: 'Hospital', park: 'Park',
  construction: 'Construction site', lake: 'Water', forest: 'Forest', warehouse: 'Warehouse', alley: 'Alley', parking: 'Parking garage', police: 'Police', gas: 'Gas station', storage: 'Self storage', school: 'School',
}

const HANGOUT_KINDS = ['bar', 'restaurant', 'gym', 'park', 'lake', 'grocery', 'pharmacy', 'hardware', 'hospital', 'parking']

function intelLevel(w: ReturnType<typeof useGame>['w'], p: Person) {
  const i = w.player.personIntel[p.id]
  if (i?.tailed) return <Badge tone="green">routine known</Badge>
  if (i?.researched) return <Badge tone="blue">known well</Badge>
  return <Badge>name only</Badge>
}

export function People() {
  const { w, act, go, focus } = useGame()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | undefined>(focus.personId)
  const me = playerPerson(w)
  const known = w.player.known ?? {}
  const list = w.people
    .filter((p) => known[p.id] && `${p.first} ${p.last}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => known[b.id].at - known[a.id].at || a.last.localeCompare(b.last))
  const p = sel && known[sel] ? w.people.find((x) => x.id === sel) : undefined

  return (
    <div className="grid master">
      <Panel title="People you know" tag={`${list.length} / ${w.people.length - 1} known`}>
        <p className="hint">Meet more people by hanging out, scouting, tailing, shopping and digging through social media.</p>
        <input placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="list people-list">
          {list.map((x) => (
            <li key={x.id} className={x.id === sel ? 'sel' : ''} onClick={() => setSel(x.id)}>
              <Avatar p={x} size={34} />
              <span className="who">
                <span className={x.alive ? 'name' : 'name dead'}>{fullName(x)} <span className={`gender ${x.gender}`} title={GENDER_LABEL[x.gender]}>{GENDER_ICON[x.gender]}</span></span>
                <span className="how">{known[x.id].how}</span>
              </span>
              <span className="row tags">
                {!x.alive && <Badge tone="red">dead</Badge>}
                {me.relations.some((r) => r.personId === x.id) && <Badge tone="amber">knows you</Badge>}
                {intelLevel(w, x)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      {p ? <PersonDetail key={p.id} p={p} act={act} go={go} /> : <Panel variant="plain"><p className="muted empty">Pick someone to open their file.</p></Panel>}
    </div>
  )
}

function PersonDetail({ p, act, go }: { p: Person; act: ReturnType<typeof useGame>['act']; go: ReturnType<typeof useGame>['go'] }) {
  const { w } = useGame()
  const i = w.player.personIntel[p.id] ?? {}
  const me = playerPerson(w)
  const myRel = me.relations.find((r) => r.personId === p.id)
  const [tailAt, setTailAt] = useState(nextOccurrence(w.time, 18))
  const [liftAt, setLiftAt] = useState(nextOccurrence(w.time, 12))
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string>()
  const run = (fn: () => string | null, msg: string) => {
    const e = act(fn)
    setErr(e)
    setOk(e ? undefined : msg)
  }

  return (
    <Panel tag={`FILE #${p.id.slice(1).padStart(4, '0')}`}>
      <div className="dossier-head">
        <Avatar p={p} size={84} />
        <div className="dossier-title">
          <h2>{fullName(p)}</h2>
          <span className="muted">{w.player.known?.[p.id]?.how}</span>
          {p.alive && <button className="danger" onClick={() => go('plan', { personId: p.id })}>Plan a kill</button>}
        </div>
        {!p.alive ? <Stamp>Deceased</Stamp> : i.tailed ? <Stamp tone="green">Routine known</Stamp> : i.researched ? <Stamp tone="amber">Researched</Stamp> : null}
      </div>
      <dl className="kv">
        <dt>Age</dt><dd>{p.age}</dd>
        <dt>Gender</dt><dd>{GENDER_LABEL[p.gender]}</dd>
        <dt>Phone</dt><dd className="mono">{p.phone}</dd>
        {myRel && (<><dt>Your relation</dt><dd><Badge tone="amber">{myRel.type}</Badge></dd></>)}
        <dt>Job</dt><dd>{i.researched ? (p.workplaceId ? `${p.job} at ${loc(w, p.workplaceId).name}` : p.job) : '?'}</dd>
        <dt>Home</dt><dd>{i.knowsHome ? `${loc(w, p.homeId).name} (${districtName(w, loc(w, p.homeId).districtId)})` : '?'}</dd>
        <dt>Social circle</dt>
        <dd>{i.researched ? p.relations.map((r) => `${nameOf(w, r.personId)} (${r.type})`).join(', ') || 'Nobody — a loner' : '?'}</dd>
        {i.researched && (
          <>
            <dt>Online</dt>
            <dd>
              {[p.traits.includes('night_owl') && 'Posts late at night', p.traits.includes('social') && 'Always out with friends', p.traits.includes('loner') && 'Barely posts'].filter(Boolean).join(' · ') || 'Nothing notable'}
            </dd>
          </>
        )}
        <dt>Work schedule</dt><dd>{i.knowsShift ? (p.shift ? `${fmtHourRange(p.shift.start, p.shift.end)}, ${fmtDays(p.shift.days)}` : 'No regular shifts') : '?'}</dd>
        <dt>Habit</dt><dd>{i.knowsHabit ? (p.habit ? `${loc(w, p.habit.locationId).name}, ${fmtHourRange(p.habit.start, p.habit.end)}, ${fmtDays(p.habit.days)}` : 'Stays home outside work') : '?'}</dd>
        <dt>Lives with</dt><dd>{i.knowsLivesAlone ? housemates(w, p).map((h) => fullName(h)).join(', ') || 'Lives alone' : '?'}</dd>
        {i.tailed && (
          <>
            <dt>Observed</dt>
            <dd>{[p.traits.includes('fit') && 'Athletic — could fight back', p.traits.includes('paranoid') && 'Keeps checking over their shoulder', p.traits.includes('nosy') && 'Notices everything'].filter(Boolean).join(' · ') || 'Nothing stood out'}</dd>
          </>
        )}
      </dl>

      {p.alive && (
        <div className="stack-sm actions-box">
          <div className="row between">
            <span><b>Research online</b> <span className="muted">· 1h, starts now · job, home, social circle</span></span>
            <button disabled={i.researched} onClick={() => run(() => schedule(w, { kind: 'research', personId: p.id }, w.time), 'Researching…')}>Research</button>
          </div>
          <div className="row between wrap">
            <span><b>Tail</b> <span className="muted">· 6h · follow them and see where they go</span></span>
            <div className="row">
              <TimePicker now={w.time} value={tailAt} onChange={setTailAt} />
              <button onClick={() => run(() => schedule(w, { kind: 'tail', personId: p.id }, Math.max(w.time, tailAt)), 'Tail scheduled.')}>Tail</button>
            </div>
          </div>
          <div className="row between wrap">
            <span><b>Take something of theirs</b> <span className="muted">· 1h · wherever they are then · a glass, a cup, their trash</span></span>
            <div className="row">
              <TimePicker now={w.time} value={liftAt} onChange={setLiftAt} />
              <button onClick={() => run(() => schedule(w, { kind: 'lift', personId: p.id }, Math.max(w.time, liftAt)), 'On the agenda.')}>Take</button>
            </div>
          </div>
          <TipRow p={p} run={run} />
          <RomanceRow p={p} run={run} />
          <Flash msg={err} ok={ok} />
        </div>
      )}
    </Panel>
  )
}

function TipRow({ p, run }: { p: Person; run: (fn: () => string | null, msg: string) => void }) {
  const { w } = useGame()
  const cases = tipCases(w).filter((c) => c.victimId !== p.id)
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '')
  const hasBurner = (w.player.inventory.burner ?? 0) + (w.player.inventory.clean_burner ?? 0) > 0
  const [phone, setPhone] = useState<'own' | 'burner'>(hasBurner ? 'burner' : 'own')
  if (!cases.length) return null
  const chosen = cases.find((c) => c.id === caseId) ?? cases[0]
  return (
    <div className="row between wrap">
      <span><b>Call the tip line</b> <span className="muted">· name {p.first}</span></span>
      <div className="row">
        <select value={chosen.id} onChange={(e) => setCaseId(e.target.value)}>
          {cases.map((c) => <option key={c.id} value={c.id}>{nameOf(w, c.victimId)} ({c.type})</option>)}
        </select>
        <select value={phone} onChange={(e) => setPhone(e.target.value as 'own' | 'burner')}>
          <option value="burner" disabled={!hasBurner}>Burner{hasBurner ? '' : ' (none)'}</option>
          <option value="own">Your phone</option>
        </select>
        <button className="danger" onClick={() => run(() => callTip(w, chosen.id, p.id, phone), 'Call made.')}>Call</button>
      </div>
    </div>
  )
}

function GiftButtons({ p, run }: { p: Person; run: (fn: () => string | null, msg: string) => void }) {
  const { w } = useGame()
  return (
    <>
      {(['flowers', 'wine'] as const).filter((i) => (w.player.inventory[i] ?? 0) > 0).map((i) => (
        <button key={i} className="ghost small" onClick={() => run(() => giveGift(w, p.id, i), `You gave ${p.first} ${i}.`)}>Give {i}</button>
      ))}
    </>
  )
}

const ROMANCE_LABEL = { asked: 'Waiting for an answer', dating: 'Dating', engaged: 'Engaged', married: 'Your spouse' } as const

function RomanceRow({ p, run }: { p: Person; run: (fn: () => string | null, msg: string) => void }) {
  const { w } = useGame()
  const rom = w.player.romance
  if (rom?.personId === p.id) {
    return (
      <div className="row between wrap">
        <span><b>❤ {ROMANCE_LABEL[rom.status]}</b> <span className="muted">· since {fmtTime(rom.since)}</span></span>
        <div className="row">
          <GiftButtons p={p} run={run} />
          {rom.status === 'dating' && <button onClick={() => run(() => propose(w), 'You got down on one knee…')}>Propose ($500)</button>}
          {rom.status === 'married' && !w.player.childId && !w.player.babyDue && <button onClick={() => run(() => startFamily(w), 'You talked about it. Late into the night.')}>Start a family</button>}
          {w.player.babyDue && <Badge tone="amber">Baby due {fmtTime(w.player.babyDue)}</Badge>}
        </div>
      </div>
    )
  }
  const hasGift = (w.player.inventory.flowers ?? 0) + (w.player.inventory.wine ?? 0) > 0
  const blocked = canAskOut(w, p)
  if (blocked) {
    // Say why — a missing button explains nothing.
    return (
      <div className="row between wrap">
        <span><b>Ask out</b> <span className="muted">· {blocked}</span></span>
        {hasGift && playerPerson(w).relations.some((r) => r.personId === p.id) && <GiftButtons p={p} run={run} />}
      </div>
    )
  }
  return (
    <div className="row between wrap">
      <span><b>Ask out</b> <span className="muted">· they'll answer by message</span></span>
      <button onClick={() => run(() => askOut(w, p.id), `You asked ${p.first} out.`)}>Ask out</button>
    </div>
  )
}

export function Locations() {
  const { w, focus } = useGame()
  const [sel, setSel] = useState<string | undefined>(focus.locationId)
  const l = sel ? w.locations.find((x) => x.id === sel) : undefined
  return (
    <div className="grid map-layout">
      <Panel title={`${w.cityName} — city map`} tag="CLICK A PIN">
        <CityMap selected={sel} onSelect={setSel} />
      </Panel>
      {l ? <LocationDetail key={l.id} l={l} /> : <Panel variant="plain"><p className="muted empty">Pick a place on the map.</p></Panel>}
    </div>
  )
}

function CityMap({ selected, onSelect }: { selected?: string; onSelect: (id: string) => void }) {
  const { w } = useGame()
  const [hover, setHover] = useState<string>()
  const L = cityLayout(w)
  const me = playerPerson(w)
  const known = w.player.known ?? {}
  // Homes the player knows about: their own, and those of people they've learned the address of.
  const homeOwners = new Map<string, string[]>()
  for (const p of w.people) {
    if (p.isPlayer || !known[p.id] || !w.player.personIntel[p.id]?.knowsHome) continue
    homeOwners.set(p.homeId, [...(homeOwners.get(p.homeId) ?? []), p.first])
  }
  const marks = new Set(w.victims.flatMap((v) => [v.killLocationId, v.bodyLocationId]))
  const visible = w.locations.filter((l) => l.kind !== 'house' || l.id === me.homeId || homeOwners.has(l.id))
  const label = (id: string) => {
    const l = loc(w, id)
    if (id === me.homeId) return `${l.name} — your place`
    if (homeOwners.has(id)) return `${l.name} — ${homeOwners.get(id)!.join(', ')}`
    return `${l.name} · ${KIND_LABEL[l.kind]}`
  }
  const tip = hover ?? selected

  return (
    <div className="citymap">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="City map">
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          </pattern>
          <radialGradient id="pinglow">
            <stop offset="0%" stopColor="rgba(240,165,38,0.6)" />
            <stop offset="100%" stopColor="rgba(240,165,38,0)" />
          </radialGradient>
        </defs>
        <rect width={MAP_W} height={MAP_H} className="map-ground" />
        {L.districts.map((d) => (
          <g key={d.id}>
            <polygon points={d.points.map((p) => p.join(',')).join(' ')} className="map-district" />
            <polygon points={d.points.map((p) => p.join(',')).join(' ')} fill="url(#grid)" />
            {(w.patrolHeat?.[d.id]?.until ?? 0) > w.time && <polygon points={d.points.map((p) => p.join(',')).join(' ')} className="map-heat" />}
          </g>
        ))}
        {L.roads.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="map-road" />)}
        <path d={L.river} className="map-river" />
        {w.locations.filter((l) => l.kind === 'lake').map((l) => <ellipse key={l.id} cx={L.pos[l.id].x} cy={L.pos[l.id].y} rx="46" ry="30" className="map-lake" />)}
        {w.locations.filter((l) => l.kind === 'forest').map((l) => (
          <g key={l.id} className="map-forest">
            {[[-26, -8], [0, -18], [24, -6], [-14, 14], [14, 16], [0, 2]].map(([dx, dy], i) => <circle key={i} cx={L.pos[l.id].x + dx} cy={L.pos[l.id].y + dy} r="20" />)}
          </g>
        ))}
        {w.locations.filter((l) => l.kind === 'park').map((l) => <rect key={l.id} x={L.pos[l.id].x - 30} y={L.pos[l.id].y - 20} width="60" height="40" rx="10" className="map-park" />)}
        {/* Names go on top of the water and the woods so they stay readable. */}
        {L.districts.map((d) => (
          <g key={`label-${d.id}`}>
            <text x={d.cx} y={d.box.y + 22} className="map-district-label">{d.name.toUpperCase()}</text>
            {roadblockIn(w, d.id, w.time) && <text x={d.cx} y={d.box.y + 42} className="map-roadblock">🚧 ROADBLOCK 🚔</text>}
          </g>
        ))}

        {visible.map((l) => {
          const { x, y } = L.pos[l.id]
          const intel = w.player.locIntel[l.id]
          const state = l.id === me.homeId ? 'home' : intel?.scouts ? 'scouted' : intel ? 'visited' : homeOwners.has(l.id) ? 'known-home' : 'unknown'
          const r = l.kind === 'house' ? 13 : 19
          return (
            <g key={l.id} className={`pin ${state} ${selected === l.id ? 'sel' : ''}`} transform={`translate(${x} ${y})`}
              onClick={() => onSelect(l.id)} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(undefined)}
              tabIndex={0} role="button" aria-label={label(l.id)} onFocus={() => setHover(l.id)} onBlur={() => setHover(undefined)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(l.id))}>
              {selected === l.id && <circle r="30" fill="url(#pinglow)" className="pin-pulse" />}
              <circle r={r} className="pin-bg" />
              <text className="pin-icon" fontSize={l.kind === 'house' ? 13 : 19} dy="1">{PIN[l.kind]}</text>
              {marks.has(l.id) && <text className="pin-mark" x={r - 2} y={-r + 4}>✕</text>}
              <title>{label(l.id)}</title>
            </g>
          )
        })}
        {tip && L.pos[tip] && (
          <g transform={`translate(${Math.min(MAP_W - 170, Math.max(170, L.pos[tip].x))} ${L.pos[tip].y - 26})`} className="map-tip">
            <rect x={-label(tip).length * 3.6 - 10} y="-16" width={label(tip).length * 7.2 + 20} height="22" rx="3" />
            <text textAnchor="middle" dy="0">{label(tip)}</text>
          </g>
        )}
      </svg>
      <div className="map-legend">
        <span><i className="lg home" /> your place</span>
        <span><i className="lg scouted" /> scouted</span>
        <span><i className="lg visited" /> been there</span>
        <span><i className="lg unknown" /> never been</span>
        {homeOwners.size > 0 && <span><i className="lg known-home" /> someone's home</span>}
        {Object.values(w.patrolHeat ?? {}).some((h) => h.until > w.time) && <span><i className="lg heat" /> patrols stepped up</span>}
        {marks.size > 0 && <span><b className="red">✕</b> your work</span>}
      </div>
    </div>
  )
}

function LocationDetail({ l }: { l: Location }) {
  const { w, act } = useGame()
  const intel = w.player.locIntel[l.id]
  const [at, setAt] = useState(nextOccurrence(w.time, 23))
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string>()
  const known = intel?.knownCameras.length ?? 0
  const blacked = l.cameras.filter((c) => intel?.knownCameras.includes(c.id) && (c.disabledUntil ?? 0) > w.time).length
  const regulars = w.people.filter((p) => {
    const i = w.player.personIntel[p.id]
    return p.alive && ((i?.knowsHabit && p.habit?.locationId === l.id) || (i?.knowsShift && p.workplaceId === l.id))
  })
  const metHere = w.people.filter((p) => w.player.known?.[p.id]?.how.endsWith(l.name) && !regulars.includes(p))
  const canHang = HANGOUT_KINDS.includes(l.kind)
  const schedule_ = (kind: 'scout' | 'visit' | 'tamper', msg: string) => {
    const e = act((w) => schedule(w, { kind, locationId: l.id }, Math.max(w.time, at)))
    setErr(e)
    setOk(e ? undefined : msg)
  }

  return (
    <Panel title={l.name}>
      <dl className="kv">
        <dt>Type</dt><dd>{KIND_LABEL[l.kind]} · {districtName(w, l.districtId)}</dd>
        <dt>From home</dt><dd>{l.id === playerPerson(w).homeId ? 'This is home' : `${travelMinutes(w, playerPerson(w).homeId, l.id)} min by car`}</dd>
        <dt>Police</dt><dd>{presenceLabel(patrolAt(w, l, w.time))}{roadblockIn(w, l.districtId, w.time) ? <> · <Badge tone="red">Roadblock</Badge></> : null}</dd>
        {hoursLabel(l.kind) && (<><dt>Hours</dt><dd>{hoursLabel(l.kind)} {isOpen(l.kind, w.time) ? <Badge tone="green">open now</Badge> : <Badge>closed now</Badge>}</dd></>)}
        <dt>Scouted</dt><dd>{intel?.scouts ? `${intel.scouts}×` : <Badge tone="amber">never</Badge>}</dd>
        <dt>Cameras</dt>
        <dd>{!intel?.scouts ? '?' : known ? `${known} spotted${blacked ? ` (${blacked} painted over)` : ''} — there may be hidden ones` : 'None spotted (there may be hidden ones)'}</dd>
        <dt>Security guard</dt><dd>{!intel?.scouts ? '?' : intel.guardKnown ? <Badge tone="red">Yes</Badge> : 'None seen'}</dd>
        <dt>Lighting at night</dt><dd>{!intel?.scouts ? '?' : l.lighting < 0.2 ? 'Pitch dark' : l.lighting < 0.5 ? 'Dim' : 'Well lit'}</dd>
        {l.pourDay !== undefined && (
          <>
            <dt>Construction</dt>
            <dd>{intel?.pourDayKnown ? `Foundation concrete pour on Day ${l.pourDay + 1}${dayOf(w.time) > l.pourDay ? ' (done)' : ` — in ${l.pourDay - dayOf(w.time)} day(s)`}` : '? (scout to see the schedule)'}</dd>
          </>
        )}
        {DISPOSAL_KINDS.includes(l.kind) && (
          <>
            <dt>As a disposal site</dt><dd>{disposalFor(w, l, w.time).text}</dd>
          </>
        )}
        {regulars.length > 0 && (
          <>
            <dt>Regulars you know of</dt><dd>{regulars.map(fullName).join(', ')}</dd>
          </>
        )}
        {metHere.length > 0 && (
          <>
            <dt>People you met here</dt><dd>{metHere.map(fullName).join(', ')}</dd>
          </>
        )}
      </dl>
      <h4>Foot traffic (observed)</h4>
      <TrafficStrip traffic={intel?.traffic ?? {}} />
      <p className="hint">Only hours you've been here are shown.</p>

      <div className="stack-sm actions-box">
        <div className="row between wrap">
          <span className="muted">When</span>
          <TimePicker now={w.time} value={at} onChange={setAt} />
        </div>
        <div className="row between wrap">
          <span><b>Scout</b> <span className="muted">· 2h · study the place</span></span>
          <button onClick={() => schedule_('scout', 'Scouting scheduled.')}>Scout</button>
        </div>
        {known > 0 && (
          <div className="row between wrap">
            <span><b>Black out the cameras</b> <span className="muted">· 30 min · spray paint over the {known} you know about</span></span>
            <button onClick={() => schedule_('tamper', 'Planned.')}>Spray them</button>
          </div>
        )}
        {canHang && (
          <div className="row between wrap">
            <span><b>Hang out</b> <span className="muted">· 2h · blend in as a customer and meet the people here</span></span>
            <button onClick={() => schedule_('visit', 'Plans made.')}>Hang out</button>
          </div>
        )}
        <Flash msg={err} ok={ok} />
      </div>
      {at - w.time > 6 * DAY && <p className="hint">That's almost a week away.</p>}
    </Panel>
  )
}
