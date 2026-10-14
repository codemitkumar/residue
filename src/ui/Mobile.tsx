import { useEffect, useRef, useState } from 'react'
import { useGame } from './state'
import { Face } from './Face'
import { Icon } from './icons'
import { answer, threadName } from '../sim/messages'
import { fmtClock, fmtTime } from '../sim/time'
import { nameOf } from '../sim/world'
import type { Message, World } from '../sim/types'

export function ThreadAvatar({ w, thread, size = 40 }: { w: World; thread: string; size?: number }) {
  const p = w.people.find((x) => x.id === thread)
  if (p) return <span className="avatar" style={{ width: size, height: size }}><Face p={p} size={size} /></span>
  return (
    <span className={`avatar sys ${thread}`} style={{ width: size, height: size }}>
      <Icon name={thread === 'police' ? 'alert' : 'dashboard'} size={size * 0.5} />
    </span>
  )
}

export const unreadCount = (w: World) => (w.player.messages ?? []).filter((m) => m.from === 'them' && !m.read).length

export function Mobile() {
  const { w, act } = useGame()
  const [tab, setTab] = useState<'messages' | 'calls'>('messages')
  const [open, setOpen] = useState<string | null>(null)
  const msgs = w.player.messages ?? []

  const threads = [...new Set(msgs.map((m) => m.thread))]
    .map((t) => {
      const list = msgs.filter((m) => m.thread === t)
      return { id: t, last: list[list.length - 1], unread: list.filter((m) => m.from === 'them' && !m.read).length }
    })
    .sort((a, b) => b.last.time - a.last.time)

  return (
    <div className="phone-wrap">
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-status">
          <span className="mono">{fmtClock(w.time)}</span>
          <span className="phone-icons">▂▄▆ 4G ▮</span>
        </div>
        <div className="phone-screen">
          {open ? (
            <Thread key={open} id={open} onBack={() => setOpen(null)} act={act} />
          ) : tab === 'messages' ? (
            <>
              <div className="app-title">Messages</div>
              {threads.length === 0 && <p className="phone-empty">No messages yet.</p>}
              <ul className="threads">
                {threads.map((t) => (
                  <li key={t.id} onClick={() => setOpen(t.id)} className={t.unread ? 'unread' : ''}>
                    <ThreadAvatar w={w} thread={t.id} />
                    <div className="thread-meta">
                      <div className="row between">
                        <b>{threadName(w, t.id)}</b>
                        <span className="muted small">{fmtClock(t.last.time)}</span>
                      </div>
                      <span className="preview">{t.last.from === 'me' ? 'You: ' : ''}{t.last.call ? '📞 ' : ''}{t.last.text}</span>
                    </div>
                    {t.unread > 0 && <span className="unread-dot">{t.unread}</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <CallLog />
          )}
        </div>
        {!open && (
          <div className="phone-tabs">
            <button className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>💬<span>Messages</span></button>
            <button className={tab === 'calls' ? 'on' : ''} onClick={() => setTab('calls')}>📞<span>Calls</span></button>
          </div>
        )}
      </div>
    </div>
  )
}

function Thread({ id, onBack, act }: { id: string; onBack: () => void; act: ReturnType<typeof useGame>['act'] }) {
  const { w } = useGame()
  const list = (w.player.messages ?? []).filter((m) => m.thread === id)
  const end = useRef<HTMLDivElement>(null)
  const unread = list.some((m) => !m.read)
  useEffect(() => {
    if (unread) act((w) => void w.player.messages.forEach((m) => m.thread === id && (m.read = true)))
  }, [unread, id, act])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [list.length])
  const pending = [...list].reverse().find((m) => m.from === 'them' && m.choices && !m.answered)

  return (
    <div className="thread">
      <div className="thread-head">
        <button className="ghost small" onClick={onBack}>‹</button>
        <ThreadAvatar w={w} thread={id} size={30} />
        <b>{threadName(w, id)}</b>
      </div>
      <div className="bubbles">
        {list.map((m, i) => (
          <div key={m.id}>
            {(i === 0 || m.time - list[i - 1].time > 120) && <div className="bubble-time">{fmtTime(m.time)}</div>}
            <div className={`bubble ${m.from} ${m.call ? 'call' : ''}`}>{m.call && m.from === 'them' ? '📞 ' : ''}{m.text}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {pending && (
        <div className="replies">
          {pending.choices!.map((c) => (
            <button key={c.id} className="reply" onClick={() => act((w) => answer(w, pending.id, c.id))}>{c.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function CallLog() {
  const { w } = useGame()
  const pid = w.player.personId
  const calls = w.calls.filter((c) => c.from === pid || c.to === pid).sort((a, b) => b.time - a.time)
  const police = (w.player.messages ?? []).filter((m) => m.thread === 'police' && m.from === 'them' && m.text.startsWith('This is Detective'))
  const rows = [
    ...calls.map((c) => ({ id: c.id, time: c.time, out: c.from === pid, who: nameOf(w, c.from === pid ? c.to : c.from) + (c.burner ? ' (burner)' : ''), status: c.answered ? `${c.durationMin} min` : 'missed', thread: c.from === pid ? c.to : c.from })),
    ...police.map((m) => ({ id: m.id, time: m.time, out: false, who: threadName(w, 'police'), status: m.answered && m.answered !== 'expired' ? 'answered' : 'missed', thread: 'police' })),
  ].sort((a, b) => b.time - a.time)
  return (
    <>
      <div className="app-title">Recents</div>
      <ul className="threads calls">
        {rows.map((r) => (
          <li key={r.id}>
            <ThreadAvatar w={w} thread={r.thread} size={34} />
            <div className="thread-meta">
              <b className={r.status === 'missed' && !r.out ? 'red' : ''}>{r.who}</b>
              <span className="preview">{r.out ? '↗ outgoing' : '↙ incoming'} · {r.status}</span>
            </div>
            <span className="muted small">{fmtTime(r.time)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Full-screen incoming call. */
export function IncomingCall({ m, onAnswer, onDecline, onHangUp }: { m: Message; onAnswer: (choice: string) => void; onDecline: () => void; onHangUp: () => void }) {
  const { w } = useGame()
  const [picked, setPicked] = useState(false)
  return (
    <div className="call-overlay">
      <div className="call-card">
        <ThreadAvatar w={w} thread={m.thread} size={96} />
        <div className="call-name">{threadName(w, m.thread)}</div>
        {!picked ? (
          <>
            <div className="call-status ringing">Incoming call…</div>
            <div className="call-buttons">
              <button className="call-btn decline" onClick={onDecline}>✕</button>
              <button className="call-btn accept" onClick={() => setPicked(true)}>✆</button>
            </div>
          </>
        ) : (
          <>
            <div className="call-status">On call</div>
            <p className="call-text">“{m.text}”</p>
            <div className="replies">
              {m.choices?.length
                ? m.choices.map((c) => <button key={c.id} className="reply" onClick={() => onAnswer(c.id)}>{c.label}</button>)
                : <button className="call-btn decline small-btn" onClick={onHangUp}>Hang up</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
