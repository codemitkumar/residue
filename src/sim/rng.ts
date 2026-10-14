// Seeded PRNG (mulberry32). The whole world is reproducible from a seed,
// and the RNG state lives inside the World so saves resume deterministically.

export interface RngState {
  s: number
}

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) | 0
  let t = r.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const chance = (r: RngState, p: number) => next(r) < p
export const int = (r: RngState, min: number, max: number) => min + Math.floor(next(r) * (max - min + 1))
export const pick = <T>(r: RngState, arr: readonly T[]): T => arr[Math.floor(next(r) * arr.length)]

export function shuffle<T>(r: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(r) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
