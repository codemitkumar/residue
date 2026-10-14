import { createContext, useContext } from 'react'
import type { World } from '../sim/types'

export type Page = 'dashboard' | 'people' | 'locations' | 'plan' | 'calendar' | 'work' | 'money' | 'black' | 'shop' | 'inventory' | 'phone' | 'news' | 'truth'

export interface GameCtx {
  w: World
  rev: number
  /** Run a mutation against the world and re-render. Returns an error message if the action failed. */
  act: (fn: (w: World) => string | null | void) => string | null
  go: (page: Page, opts?: { personId?: string; locationId?: string }) => void
  focus: { personId?: string; locationId?: string }
  devMode: boolean
}

export const Ctx = createContext<GameCtx | null>(null)
export const useGame = () => useContext(Ctx)!
