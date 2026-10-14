import { useCallback, useEffect, useRef, useState } from 'react'
import { Ctx, type GameCtx, type Page } from './ui/state'
import { Dashboard, News } from './ui/Feed'
import { IncomingCall, Mobile, unreadCount } from './ui/Mobile'
import { answer, decline } from './sim/messages'
import { Locations, People } from './ui/Intel'
import { Inventory, Plan, Shop } from './ui/Ops'
import { GameOverScreen, Truth } from './ui/Reveal'
import { Work } from './ui/Work'
import { Calendar } from './ui/Calendar'
import { EncounterAlert, LegalPanel } from './ui/Legal'
import { refreshListings } from './sim/jobs'
import { surrender } from './sim/urge'
import { newCar } from './sim/car'
import { genderOfName } from './sim/names'
import { WEATHER_ICON, WEATHER_LABEL, eventsOn, processEnvironment, weatherOn } from './sim/environment'
import { Money } from './ui/Money'
import { BlackMarket } from './ui/BlackMarket'
import { dayOfSeason, seasonOf } from './sim/time'
import { UrgeOverlay, urgeClass } from './ui/Urge'
import { Meter } from './ui/widgets'
import { Icon } from './ui/icons'
import { sound } from './ui/audio'
import { generateWorld } from './sim/worldgen'
import { seedFamilies } from './sim/population'
import { host, lockMachine, machineLock, type MachineLock } from './host'
import { advance } from './sim/engine'
import { fmtClock, fmtDay, hourOf } from './sim/time'
import { busyWith, initKnown } from './sim/world'
import type { NewsItem, ScheduledActivity, World } from './sim/types'

const SAVE_KEY = 'residue.save.v1'
/** Game minutes advanced per 200ms real tick. */
/** The one and only pace: 6 game hours per real hour, i.e. one game minute every 10 real seconds. */
const TIME_SCALE = 6
const REAL_MS_PER_GAME_MINUTE = 60_000 / TIME_SCALE
/** How long (game minutes) an unanswered call rings before it goes to missed. */
const RING_MINUTES = 3

/** Sidebar, in groups, each page with a keyboard shortcut. */
const NAV: { page: Page; label: string; icon: string; key: string; group: string }[] = [
  { page: 'dashboard', label: 'Hideout', icon: 'dashboard', key: 'h', group: 'Your life' },
  { page: 'calendar', label: 'Calendar', icon: 'clock', key: 'l', group: 'Your life' },
  { page: 'work', label: 'Work', icon: 'cash', key: 'w', group: 'Your life' },
  { page: 'money', label: 'Money', icon: 'cash', key: 'm', group: 'Your life' },
  { page: 'phone', label: 'Phone', icon: 'phone', key: 'f', group: 'Your life' },
  { page: 'news', label: 'News', icon: 'news', key: 'n', group: 'Your life' },
  { page: 'people', label: 'People', icon: 'people', key: 'p', group: 'The hunt' },
  { page: 'locations', label: 'City', icon: 'locations', key: 'c', group: 'The hunt' },
  { page: 'plan', label: 'Kill', icon: 'plan', key: 'k', group: 'The hunt' },
  { page: 'shop', label: 'Shop', icon: 'shop', key: 's', group: 'Supplies' },
  { page: 'black', label: 'Black market', icon: 'alert', key: 'b', group: 'Supplies' },
  { page: 'inventory', label: 'Stash', icon: 'inventory', key: 'i', group: 'Supplies' },
]

function loadSave(): World | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const w = JSON.parse(raw) as World
    if (!w.player.known) initKnown(w) // saves from before "people you know"
    w.player.messages ??= []
    // Saves from before the agenda and the job system.
    const old = w.player as typeof w.player & { schedule?: ScheduledActivity | null }
    if (!w.player.agenda) w.player.agenda = old.schedule ? [{ ...old.schedule, id: 'act-legacy' }] : []
    delete old.schedule
    for (const s of w.player.agenda) {
      s.departAt ??= s.startAt
      s.returnAt ??= s.endAt
    }
    w.player.food ??= 3
    const me = w.people.find((p) => p.isPlayer)!
    if (w.player.employed && w.player.salary === undefined && me.shift) {
      w.player.salary = me.pay * me.shift.days.length
      w.player.bossId = me.relations.find((r) => r.type === 'boss')?.personId
    }
    if (!w.jobListings) refreshListings(w)
    // Saves from before money, cars, weather and the underworld.
    if (!w.player.car) newCar(w)
    // Saves from before genders: infer from the name, otherwise pick deterministically.
    for (const p of w.people) {
      if (p.gender) continue
      p.gender = genderOfName(p.first) ?? (p.id.charCodeAt(p.id.length - 1) % 2 ? 'male' : 'female')
    }
    for (const p of w.people) {
      const h = p.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0
      p.cash ??= h % 120
      p.savings ??= (p.pay || 40) * (5 + (h % 40))
    }
    w.player.credit ??= 650
    w.player.autopay ??= true
    for (const [kind, name] of [['gas', 'QuickGas'], ['storage', 'SafeKeep Self Storage']] as const) {
      if (w.locations.some((l) => l.kind === kind)) continue
      const d = w.districts[w.counter % w.districts.length]
      w.locations.push({ id: `l${++w.counter}`, name, kind, districtId: d.id, cameras: [{ id: `cam${++w.counter}`, coverage: 0.7, hidden: false, retentionDays: 14 }], traffic: Array(24).fill(0.3), lighting: 0.8, guard: false })
    }
    if (!w.weather?.length) processEnvironment(w, w.time)
    seedFamilies(w) // saves from before children and schools
    return w
  } catch {
    return null
  }
}
/** One life: once the game ends, this record stays forever and the game never starts again. */
const FINAL_KEY = 'residue.final.v1'

/** Set while wiping, so the save-on-close handler can’t write the old world back. */
let wiping = false

function writeSave(w: World | null) {
  if (wiping) return
  try {
    if (w && !w.gameOver) localStorage.setItem(SAVE_KEY, JSON.stringify(w))
    else localStorage.removeItem(SAVE_KEY)
    if (w?.gameOver) {
      // Keep the ending (and the case files behind it); drop the bulk nobody will read again.
      const ending = JSON.stringify({ ...w, calls: [], news: w.news.slice(0, 50) })
      localStorage.setItem(FINAL_KEY, ending)
      // On the desktop app the ending is also bound to this machine, beyond the reach of a cleared save.
      lockMachine(ending)
    }
  } catch {
    /* storage unavailable — play without saves */
  }
}

/** This machine's one life, as recorded by the desktop app. Read once, at startup. */
const MACHINE = machineLock()

function loadFinal(): World | null {
  try {
    const raw = (MACHINE?.locked && MACHINE.ending) || localStorage.getItem(FINAL_KEY)
    // An ending from before the desktop lock existed: bind it now.
    if (raw && host && !MACHINE?.locked) lockMachine(raw)
    return raw ? (JSON.parse(raw) as World) : null
  } catch {
    return null
  }
}

/** Development only: wipe the ending so the game can be played again. */
function devWipe() {
  wiping = true
  try {
    localStorage.removeItem(FINAL_KEY)
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
  location.reload()
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, requireInteraction: true })
  } catch {
    /* notifications unavailable */
  }
}

const phaseOf = (t: number) => {
  const h = hourOf(t)
  return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 18 ? 'day' : h >= 18 && h < 21 ? 'dusk' : 'night'
}

/** How hunted the player *feels* — built only from what they can see, never the true heat. */
function paranoia(w: World): number {
  const news = w.news.filter((n) => n.kind === 'news')
  let v = news.filter((n) => n.headline.startsWith('Search underway')).length * 0.08
  v += news.filter((n) => n.headline.startsWith('Body found')).length * 0.15
  v += w.news.filter((n) => n.kind === 'scanner' && w.time - n.time < 2 * 1440).length * 0.03
  if (w.taskForce) v += 0.2
  if (w.player.questioned) v += 0.3
  if (w.player.searched) v += 0.3
  return Math.min(1, v)
}

const DANGER = /questioned|searched|went wrong|fired|Body found|task force|Arrest/i

function playFor(n: NewsItem) {
  if (DANGER.test(n.headline)) sound.danger()
  else if (n.kind === 'personal' && n.headline.endsWith('is dead')) sound.heartbeat(3)
  else if (n.kind === 'scanner') sound.scanner()
  else if (n.kind === 'news') sound.news()
  else if (n.kind === 'personal') sound.personal()
}

interface Toast extends NewsItem {
  danger: boolean
}

export default function App() {
  const worldRef = useRef<World | null>(null)
  const [rev, setRev] = useState(0)
  const [page, setPage] = useState<Page>('dashboard')
  const [focus, setFocus] = useState<GameCtx['focus']>({})
  const [devMode, setDevMode] = useState(false)
  const [muted, setMuted] = useState(sound.muted)
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastSave = useRef(0)
  const lastNews = useRef<string | undefined>(undefined)
  const wasOver = useRef(false)
  const lastMsgs = useRef(0)
  const bump = useCallback(() => setRev((r) => r + 1), [])

  // Reopening the game drops you straight back into your city.
  const booted = useRef(false)
  if (!booted.current) {
    booted.current = true
    const final = loadFinal()
    const saved = final ?? loadSave()
    if (saved) {
      worldRef.current = saved
      lastNews.current = saved.news[0]?.id // don't replay old alerts
      lastMsgs.current = saved.player.messages?.length ?? 0
    }
  }

  // The moment the game ends, the ending is written down for good.
  const ended = worldRef.current?.gameOver
  useEffect(() => {
    if (ended && worldRef.current) writeSave(worldRef.current)
  }, [ended])

  // Save whenever the window is hidden or closed, not just every few seconds.
  useEffect(() => {
    const flush = () => worldRef.current && writeSave(worldRef.current)
    const onHide = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // Keyboard: a letter jumps to a page (shown when you hover the sidebar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))) return
      const n = NAV.find((x) => x.key === e.key.toLowerCase())
      if (!n) return
      setFocus({})
      setPage(n.page)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A new page starts at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page, focus])

  // The sidebar sticks below the HUD, whose height changes with the window.
  useEffect(() => {
    const hud = document.querySelector('.hud')
    if (!hud) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', `${hud.getBoundingClientRect().height}px`))
    ro.observe(hud)
    return () => ro.disconnect()
  })

  const w = worldRef.current
  // Dev-only handle for debugging from the browser console.
  if (import.meta.env.DEV) (window as unknown as { __world?: World | null }).__world = w

  // Audio needs a user gesture to start; every button gets a click.
  useEffect(() => {
    const unlock = () => {
      sound.unlock()
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
    }
    const click = (e: MouseEvent) => (e.target as HTMLElement).closest('button, .list li') && sound.click()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('click', click)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('click', click)
    }
  }, [])

  // Simulation clock: real time drives game time at a fixed ratio.
  // The world never stops: nothing pauses it, not even a ringing phone.
  const step = useCallback((minutes: number) => {
    if (!w || w.gameOver) return
    const end = w.time + minutes
    while (w.time < end && !w.gameOver) {
      advance(w, end - w.time)
      w.pauseRequested = false
    }
    // Nobody lets a phone ring forever: after a few minutes it's a missed call.
    for (const m of w.player.messages ?? []) {
      if (m.call && m.from === 'them' && !m.answered && !m.read && w.time - m.time >= RING_MINUTES) decline(w, m.id)
    }
    bump()
  }, [w, bump])
  useEffect(() => {
    if (!w || w.gameOver) return
    let last = Date.now()
    let carry = 0
    const id = setInterval(() => {
      const now = Date.now()
      carry += now - last
      last = now
      const minutes = Math.min(600, Math.floor(carry / REAL_MS_PER_GAME_MINUTE)) // cap catch-up after sleep
      if (minutes > 0) {
        carry -= minutes * REAL_MS_PER_GAME_MINUTE
        step(minutes)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [w, step])

  // Police encounter: system notification, alarm, and a real-time deadline.
  const encounterAt = w?.player.encounter?.at
  const realDeadline = useRef(0)
  useEffect(() => {
    const e = worldRef.current?.player.encounter
    if (!e) return
    realDeadline.current = Date.now() + (e.deadline - worldRef.current!.time) * REAL_MS_PER_GAME_MINUTE
    notify('RESIDUE — POLICE', 'A patrol is on you. Run, hide or give up — you have 10 minutes.')
    sound.alarm()
    const id = setInterval(() => sound.alarm(), 6000)
    return () => clearInterval(id)
  }, [encounterAt])

  // Autosave, new-event toasts and sounds
  useEffect(() => {
    if (!w) return
    if (w.gameOver || Date.now() - lastSave.current > 3000) {
      writeSave(w)
      lastSave.current = Date.now()
    }
    sound.setMood(phaseOf(w.time) === 'night' || phaseOf(w.time) === 'dusk' ? 'night' : 'day')
    sound.setUrge(w.gameOver ? 0 : (w.player.urge ?? 0))
    sound.setWeather(weatherOn(w, w.time).kind)
    if (w.gameOver && !wasOver.current) sound.caught()
    wasOver.current = !!w.gameOver

    const msgs = w.player.messages ?? []
    if (msgs.length > lastMsgs.current) {
      const latest = msgs[msgs.length - 1]
      if (latest.from === 'them' && !latest.call) sound.text()
    }
    lastMsgs.current = msgs.length

    const idx = lastNews.current ? w.news.findIndex((n) => n.id === lastNews.current) : 0
    const fresh = (idx < 0 ? w.news.slice(0, 3) : w.news.slice(0, idx)).filter((n) => n.kind !== 'system')
    lastNews.current = w.news[0]?.id
    if (!fresh.length) return
    const worst = fresh.find((n) => DANGER.test(n.headline)) ?? fresh[0]
    playFor(worst)
    const add = fresh.slice(0, 3).map((n) => ({ ...n, danger: DANGER.test(n.headline) }))
    setToasts((t) => [...add, ...t].slice(0, 4))
    const ids = add.map((a) => a.id)
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.includes(x.id))), 7000)
  }, [w, rev])

  // Ring while a call is waiting.
  const ringingId = w?.player.messages?.find((m) => m.call && m.from === 'them' && !m.answered && !m.read)?.id
  useEffect(() => {
    if (!ringingId) return
    if (document.hidden) notify('RESIDUE — Incoming call', 'Your phone is ringing.')
    sound.ring()
    const id = setInterval(() => sound.ring(), 2600)
    return () => clearInterval(id)
  }, [ringingId])

  const start = (world: World) => {
    worldRef.current = world
    lastNews.current = world.news[0]?.id
    lastMsgs.current = world.player.messages?.length ?? 0
    setPage('dashboard')
    writeSave(world)
    sound.unlock()
    sound.start()
    bump()
  }

  const toggleMute = () => {
    sound.unlock()
    sound.setMuted(!muted)
    setMuted(!muted)
  }

  // The machine has had its one life, but the ending itself was deleted: there is still no new game.
  if (!w && MACHINE?.locked) return <LockedScreen lock={MACHINE} />
  if (!w) return <NewGame onStart={start} />

  const ctx: GameCtx = {
    w,
    rev,
    devMode,
    focus,
    act: (fn) => {
      const err = fn(w) ?? null
      bump()
      return err
    },
    go: (p, opts) => {
      setFocus(opts ?? {})
      setPage(p)
    },
  }

  if (w.gameOver) {
    return (
      <Ctx.Provider value={ctx}>
        <div className="fx" />
        <GameOverScreen devReset={import.meta.env.DEV ? devWipe : undefined} />
      </Ctx.Provider>
    )
  }

  const busy = busyWith(w)
  const s = busy ?? w.player.agenda.find((x) => x.started) ?? w.player.agenda[0]
  const ringing = (w.player.messages ?? []).find((m) => m.call && m.from === 'them' && !m.answered && !m.read)
  const phase = phaseOf(w.time)
  const fear = paranoia(w)
  return (
    <Ctx.Provider value={ctx}>
      <div className={`app phase-${phase} ${s?.started && s.activity.kind === 'operation' ? 'op-live' : ''} ${urgeClass(w.player.urge ?? 0)} wx-${weatherOn(w, w.time).kind}`}>
        <div className="weather-fx" />
        <UrgeOverlay />
        <div className="fx" />
        <header className="hud">
          <div className="brand">RESIDUE<small>{w.killerName ? <span className="red">“{w.killerName}”</span> : w.cityName}{(w.outrage ?? 0) > 0.15 && <span className="red manhunt" title="The whole city is looking"> · MANHUNT</span>}</small></div>

          <div className="hud-clock">
            <span className={`phase-icon ${phase}`}><Icon name={phase === 'night' || phase === 'dusk' ? 'moon' : 'sun'} size={22} /></span>
            <div>
              <div className="hud-day">{fmtDay(w.time)}</div>
              <div className="hud-time">{fmtClock(w.time)}</div>
            </div>
            <div className="speeds">
              <span className="live" title={`Time never stops. 1 real hour = ${TIME_SCALE} game hours.`}>● LIVE</span>
              {devMode && <button className="speed" onClick={() => step(60)} title="Dev: skip one game hour">+1h</button>}
            </div>
          </div>

          <div className="hud-stat">
            <span className="hud-label"><Icon name="cash" size={14} /> Cash</span>
            <span className={`hud-value ${w.player.money < 0 ? 'red' : 'green'}`}>${w.player.money.toLocaleString()}</span>
          </div>
          <div className="hud-stat">
            <span className="hud-label"><Icon name="alert" size={14} /> Paranoia</span>
            <Meter value={fear} label="How hunted you feel, based on what you can see" />
          </div>
          <div className="hud-stat">
            <span className="hud-label">{seasonOf(w.time)} · day {dayOfSeason(w.time)}</span>
            <span className="hud-weather" title={WEATHER_LABEL[weatherOn(w, w.time).kind]}>{WEATHER_ICON[weatherOn(w, w.time).kind]} {weatherOn(w, w.time).temp}°{eventsOn(w, w.time)[0] && <span className="hud-event">{eventsOn(w, w.time)[0].name}</span>}</span>
          </div>
          <div className="hud-stat">
            <span className="hud-label">☠ Kills</span>
            <span className="hud-value">{w.victims.length}</span>
          </div>
          <div className="hud-stat urge-stat">
            <span className="hud-label">✦ Urge</span>
            <Meter value={w.player.urge ?? 0} label="The need" />
          </div>
          <div className="hud-activity">
            {s ? (
              <>
                <span className="hud-label">{busy ? `● Busy until ${fmtClock(busy.returnAt)}` : '◷ Planned'}</span>
                <span className={`hud-act ${busy ? 'live' : ''}`}>{s.label}</span>
              </>
            ) : (
              <span className="hud-label">Idle — living your normal life</span>
            )}
          </div>
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
        </header>

        <nav className="sidenav">
          {NAV.map((n, i) => (
            <div key={n.page} className="nav-item">
            {NAV[i - 1]?.group !== n.group && <div className="nav-group">{n.group}</div>}
            <button className={page === n.page ? 'on' : ''} onClick={() => ctx.go(n.page)} title={`${n.label} (${n.key.toUpperCase()})`} aria-keyshortcuts={n.key}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              <kbd>{n.key.toUpperCase()}</kbd>
              {n.page === 'news' && w.news[0] && w.time - w.news[0].time < 120 && <span className="dot" />}
              {n.page === 'phone' && unreadCount(w) > 0 && <span className="nav-count">{unreadCount(w)}</span>}
            </button>
            </div>
          ))}
          <div className="spacer" />
          <label className="check small dev">
            <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
            <span>Dev: show truth</span>
          </label>
          {devMode && (
            <button className={page === 'truth' ? 'on' : ''} onClick={() => ctx.go('truth')}>
              <Icon name="truth" />
              <span>Truth</span>
            </button>
          )}
          {w.victims.length > 0 && (
            <button className="ghost small surrender" onClick={() => confirm('Walk into the police station and confess? This ends the game — forever. There is no second chance.') && ctx.act((w) => surrender(w, 'station'))}>Turn yourself in</button>
          )}
        </nav>

        <main className="content" key={page}>
          {w.player.custody?.inCustody && page !== 'phone' && page !== 'news' ? <LegalPanel /> : <>
          {page === 'dashboard' && <Dashboard />}
          {page === 'people' && <People key={focus.personId} />}
          {page === 'locations' && <Locations key={focus.locationId} />}
          {page === 'plan' && <Plan key={focus.personId} />}
          {page === 'shop' && <Shop />}
          {page === 'inventory' && <Inventory />}
          {page === 'phone' && <Mobile />}
          {page === 'news' && <News />}
          {page === 'work' && <Work />}
          {page === 'money' && <Money />}
          {page === 'black' && <BlackMarket />}
          {page === 'calendar' && <Calendar />}
          {page === 'truth' && devMode && <Truth />}
          </>}
        </main>

        {w.player.encounter && <EncounterAlert key={w.player.encounter.at} realDeadline={realDeadline.current || Date.now() + 10 * 60_000} />}

        {ringing && (
          <IncomingCall
            key={ringing.id}
            m={ringing}
            onAnswer={(c) => ctx.act((w) => answer(w, ringing.id, c))}
            onDecline={() => ctx.act((w) => decline(w, ringing.id))}
            onHangUp={() => ctx.act(() => {
              ringing.call = false
              ringing.read = true
            })}
          />
        )}

        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind} ${t.danger ? 'danger' : ''}`} onClick={() => ctx.go('news')}>
              <span className="toast-kind"><Icon name={t.kind === 'scanner' ? 'radio' : t.kind === 'news' ? 'news' : 'phone'} size={14} /> {t.kind}</span>
              <strong>{t.headline}</strong>
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  )
}

function LockedScreen({ lock }: { lock: MachineLock }) {
  return (
    <div className="title-screen">
      <div className="title-card">
        <div className="title">RESIDUE</div>
        <div className="title-form">
          <span className="field-label">One life</span>
          <p className="lead">This machine has already had its life in the city.</p>
          {lock.reason && <p>{lock.reason}</p>}
          {lock.endedOn && <p className="muted small">Ended {new Date(lock.endedOn).toLocaleString()}.</p>}
          <p className="muted small">There is no new game. There never was.</p>
        </div>
      </div>
    </div>
  )
}

function NewGame({ onStart }: { onStart: (w: World) => void }) {
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 8))
  return (
    <div className="title-screen">
      <div className="fx" />
      <Skyline />
      <div className="title-card">
        <h1 className="title" data-text="RESIDUE">RESIDUE</h1>
        <p className="tagline">A living city that remembers everything.<br />You are the killer. Every mistake is waiting to be found.</p>
        <div className="title-form">
          <label className="field">
            <span className="field-label">World seed</span>
            <div className="row">
              <input value={seed} onChange={(e) => setSeed(e.target.value)} className="mono" />
              <button className="ghost" onClick={() => setSeed(Math.random().toString(36).slice(2, 8))}>Reroll</button>
            </div>
          </label>
          <button className="danger big" onClick={() => onStart(generateWorld(seed || 'residue'))}>Generate city</button>
          <p className="hint center">You get one life. Get caught or give up and it’s over — for good.</p>
        </div>
      </div>
    </div>
  )
}

/** Procedural night skyline with lit windows. */
function Skyline() {
  const [bldgs] = useState(() => {
    let x = 0
    const out: { x: number; w: number; h: number; lit: [number, number][] }[] = []
    while (x < 1600) {
      const w = 40 + Math.random() * 90
      const h = 80 + Math.random() * 260
      const lit: [number, number][] = []
      for (let wy = 12; wy < h - 10; wy += 16) for (let wx = 8; wx < w - 8; wx += 14) if (Math.random() < 0.12) lit.push([wx, wy])
      out.push({ x, w, h, lit })
      x += w + 4
    }
    return out
  })
  return (
    <svg className="skyline" viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {bldgs.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${400 - b.h})`}>
          <rect width={b.w} height={b.h} className="bldg" />
          {b.lit.map(([wx, wy], j) => <rect key={j} x={wx} y={wy} width="6" height="8" className="win" style={{ animationDelay: `${(i * 7 + j) % 13}s` }} />)}
        </g>
      ))}
    </svg>
  )
}
