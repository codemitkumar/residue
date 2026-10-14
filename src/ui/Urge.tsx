import { useEffect, useState } from 'react'
import { useGame } from './state'

export const urgeClass = (u: number) => (u < 0.55 ? '' : u < 0.7 ? 'urge-1' : u < 0.85 ? 'urge-2' : 'urge-3')

const WORDS = ['NOW', 'DO IT', 'SOMEONE', 'TONIGHT', 'NO ONE WILL KNOW', 'YOU NEED THIS', 'LOOK AT THEM', 'QUIET', 'CLOSER']

interface Flash {
  id: number
  text: string
  x: number
  y: number
  size: number
}

/** Intrusive thoughts: words and names flicker across the screen as the urge climbs. */
export function UrgeOverlay() {
  const { w } = useGame()
  const u = w.player.urge ?? 0
  const [flashes, setFlashes] = useState<Flash[]>([])
  const level = u < 0.7 ? 0 : u < 0.85 ? 1 : 2
  useEffect(() => {
    if (level === 0) {
      setFlashes([])
      return
    }
    let n = 0
    const names = w.people.filter((p) => p.alive && !p.isPlayer && w.player.known?.[p.id]).map((p) => p.first.toUpperCase())
    const id = setInterval(() => {
      if (Math.random() > (level === 2 ? 0.75 : 0.4)) return
      const pool = names.length && Math.random() < 0.5 ? names : WORDS
      const f: Flash = { id: ++n, text: pool[Math.floor(Math.random() * pool.length)], x: 5 + Math.random() * 80, y: 10 + Math.random() * 75, size: 18 + Math.random() * (level === 2 ? 70 : 30) }
      setFlashes((fs) => [...fs.slice(-4), f])
      setTimeout(() => setFlashes((fs) => fs.filter((x) => x.id !== f.id)), 380 + Math.random() * 500)
    }, level === 2 ? 650 : 1400)
    return () => clearInterval(id)
    // names only need refreshing when the level changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  if (u < 0.55) return null
  return (
    <div className="urge-overlay" aria-hidden="true">
      <div className="urge-vignette" style={{ opacity: Math.min(1, (u - 0.5) * 2) }} />
      {flashes.map((f) => (
        <span key={f.id} className="urge-word" style={{ left: `${f.x}%`, top: `${f.y}%`, fontSize: f.size }}>{f.text}</span>
      ))}
    </div>
  )
}
