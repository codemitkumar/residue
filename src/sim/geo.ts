import { hashSeed, next, type RngState } from './rng'
import type { World } from './types'

export const MAP_W = 1000
export const MAP_H = 680

export interface DistrictShape {
  id: string
  name: string
  points: [number, number][]
  cx: number
  cy: number
  box: { x: number; y: number; w: number; h: number }
}

export interface MapLayout {
  districts: DistrictShape[]
  pos: Record<string, { x: number; y: number }>
  river: string
  roads: [number, number, number, number][]
}

const cache = new Map<string, MapLayout>()

const SIZE: Record<string, number> = { lake: 46, forest: 52, park: 30, construction: 26, house: 14 }

/** Deterministic city layout. Uses its own RNG so it never disturbs the simulation. */
export function cityLayout(w: World): MapLayout {
  const hit = cache.get(w.seed)
  if (hit) return hit
  const r: RngState = { s: hashSeed(`${w.seed}:map`) }
  const j = (n: number) => (next(r) - 0.5) * 2 * n

  const n = w.districts.length
  const cols = n <= 4 ? 2 : 3
  const rows = Math.ceil(n / cols)
  const cw = MAP_W / cols
  const ch = MAP_H / rows
  const districts: DistrictShape[] = w.districts.map((d, i) => {
    const c = i % cols
    const row = Math.floor(i / cols)
    // Last row may be short: stretch its cells to fill the width.
    const inRow = row === rows - 1 ? n - row * cols : cols
    const wcell = MAP_W / inRow
    const x0 = c * wcell + 10
    const y0 = row * ch + 10
    const x1 = x0 + wcell - 20
    const y1 = y0 + ch - 20
    const points: [number, number][] = [
      [x0 + j(8), y0 + j(8)], [(x0 + x1) / 2 + j(20), y0 + j(10)], [x1 + j(8), y0 + j(8)],
      [x1 + j(10), (y0 + y1) / 2 + j(20)], [x1 + j(8), y1 + j(8)], [(x0 + x1) / 2 + j(20), y1 + j(10)],
      [x0 + j(8), y1 + j(8)], [x0 + j(10), (y0 + y1) / 2 + j(20)],
    ]
    return { id: d.id, name: d.name, points, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
  })


  // Scatter each district's places with a minimum spacing.
  const pos: MapLayout['pos'] = {}
  const placed: { x: number; y: number; s: number }[] = []
  // Schools came later (older saves gain them): place them last so nothing else moves.
  const order = [...w.locations].sort((a, b) => Number(a.kind === 'school') - Number(b.kind === 'school') || (SIZE[b.kind] ?? 20) - (SIZE[a.kind] ?? 20))
  for (const l of order) {
    const d = districts.find((x) => x.id === l.districtId)!
    const s = SIZE[l.kind] ?? 20
    const pad = 34
    let best = { x: d.cx, y: d.cy }
    let bestGap = -Infinity
    for (let k = 0; k < 40; k++) {
      const x = d.box.x + pad + next(r) * (d.box.w - pad * 2)
      const y = d.box.y + pad + 14 + next(r) * (d.box.h - pad * 2 - 14)
      const gap = Math.min(...placed.map((p) => Math.hypot(p.x - x, p.y - y) - p.s - s), 999)
      if (gap > bestGap) {
        bestGap = gap
        best = { x, y }
      }
      if (gap > 8) break
    }
    pos[l.id] = best
    placed.push({ ...best, s })
  }

  // A river winding across the city.
  const ry = MAP_H * (rows > 1 ? 0.5 : 0.75) + j(30)
  let river = `M -20 ${ry + j(40)}`
  for (let x = 0; x <= MAP_W + 40; x += 125) river += ` T ${x} ${ry + j(45)}`

  // Main roads between neighbouring districts.
  const roads: MapLayout['roads'] = []
  for (let i = 0; i < districts.length; i++)
    for (let k = i + 1; k < districts.length; k++) {
      const a = districts[i]
      const b = districts[k]
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < Math.max(cw, ch) * 1.02) roads.push([a.cx, a.cy, b.cx, b.cy])
    }

  const layout = { districts, pos, river, roads }
  cache.set(w.seed, layout)
  return layout
}

export const PIN: Record<string, string> = {
  house: '🏠', apartment: '🏬', office: '🏢', factory: '🏭', bar: '🍺', restaurant: '🍽️', hardware: '🔧', pharmacy: '💊',
  grocery: '🛒', gym: '🏋️', hospital: '🏥', park: '🌳', construction: '🚧', lake: '🌊', forest: '🌲', warehouse: '📦',
  alley: '🗑️', parking: '🅿️', police: '🚓', gas: '⛽', storage: '🔐', school: '🏫',
}

// ---------------------------------------------------------------- opening hours & travel

/** [open, close) in hours; close may run past midnight (> 24). Places not listed never close. */
export const OPEN_HOURS: Partial<Record<string, [number, number]>> = {
  grocery: [7, 23], pharmacy: [8, 21], hardware: [8, 20], bar: [17, 26], restaurant: [11, 23], gym: [6, 22],
  office: [8, 19], factory: [6, 22], warehouse: [6, 22], police: [0, 24], hospital: [0, 24], storage: [6, 22], school: [7, 17],
}

export function isOpen(kind: string, t: number): boolean {
  const hours = OPEN_HOURS[kind]
  if (!hours) return true
  const h = (t % 1440) / 60
  const [open, close] = hours
  return (h >= open && h < Math.min(close, 24)) || (close > 24 && h < close - 24)
}

export function hoursLabel(kind: string): string | null {
  const hours = OPEN_HOURS[kind]
  if (!hours) return null
  if (hours[0] === 0 && hours[1] === 24) return 'Open 24 hours'
  const f = (h: number) => `${String(h % 24).padStart(2, '0')}:00`
  return `${f(hours[0])}–${f(hours[1])}`
}

/** Minutes to get between two places (by car unless on foot). */
export function travelMinutes(w: World, fromId: string, toId: string, onFoot = false): number {
  if (fromId === toId) return 0
  const L = cityLayout(w)
  const a = L.pos[fromId]
  const b = L.pos[toId]
  if (!a || !b) return 20
  const km = Math.hypot(a.x - b.x, a.y - b.y)
  return Math.round((5 + km * (onFoot ? 0.18 : 0.05)) / 5) * 5
}
