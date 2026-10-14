// Don't touch the kids. Every child you kill makes the game angrier, and the anger
// leaks into everything: police, patrols, cameras, witnesses, juries. It never forgets.
import { chance, next } from './rng'
import type { World } from './types'
import { DAY } from './time'
import { addNews } from './world'

/** How angry the game is: the number of children you have killed (the truth, not what police know). */
export const anger = (w: World) => w.victims.filter((v) => (w.people.find((p) => p.id === v.personId)?.age ?? 99) < 16).length

/** Kills you can get away with in ten days before it catches up with you. */
const SPREE_FREE = 2
const SPREE_WINDOW = 10 * DAY

/**
 * Killing too much, too fast: kills in the last ten days beyond the first two. Wears off as the days roll on.
 * You get careless and the city notices the pattern — whether or not police know it's you.
 */
export const spree = (w: World, extra = 0) => Math.max(0, w.victims.filter((v) => w.time - v.killedAt < SPREE_WINDOW).length + extra - SPREE_FREE)

/** Police tasks take this fraction of their usual time. */
export const angerSpeed = (w: World) => Math.max(0.35, 1 - 0.12 * anger(w) - 0.15 * spree(w))
/** Multiplies how much suspicion counts toward questioning, warrants and arrest. */
export const angerHeat = (w: World) => Math.min(2.5, 1 + 0.15 * anger(w) + 0.2 * spree(w))
/** Added to every patrol chance. */
export const angerPatrol = (w: World) => 0.015 * anger(w) + 0.03 * spree(w)
/** Multiplies the chance a bystander notices what you're doing. */
export const angerNotice = (w: World) => 1 + 0.12 * anger(w) + 0.15 * spree(w)

/** Tired, shaking, rushing: how sloppy the kill about to happen is (0 = not at all). */
export function sloppiness(w: World) {
  const s = spree(w, 1)
  return { dna: 0.25 * s, printsThroughGloves: Math.min(0.6, 0.2 * s), weaker: 0.06 * s }
}

/** Once per spree: the city works out there's a pattern, and you feel it. */
export function spreeConsequences(w: World) {
  const s = spree(w)
  if (s < 1 || (w.spreeNoticedAt ?? -Infinity) > w.time - SPREE_WINDOW) return
  w.spreeNoticedAt = w.time
  addNews(w, 'personal', 'You can’t stop', 'You haven’t slept properly in days. Your hands shake. You keep forgetting things — where you parked, what you touched.', true)
  if (w.victims.filter((v) => v.foundAt).length >= 2) addNews(w, 'news', 'State investigators join the hunt', `With bodies turning up week after week, ${w.cityName} police have asked for outside help. Profilers and extra officers arrive tomorrow.`, true)
}

/** Days without progress before a child's case goes cold — later and later, then never. */
export const angerColdDays = (w: World) => (anger(w) >= 3 ? Infinity : 7 * (1 + anger(w)))
/** Witnesses' memories fade this much slower. */
export const angerFade = (w: World) => 1 / (1 + anger(w))
/** Hourly chance the reward line turns up something on a child's case. */
export const angerTips = (w: World) => 0.01 + 0.012 * anger(w)
/** Extra evidence weight a jury hears. */
export const angerJury = (w: World) => 0.25 * anger(w)

/**
 * Right after a child is killed: new cameras go up across the city, quietly.
 * The places you scouted before may not be the places they are now.
 */
export function installCameras(w: World) {
  const n = anger(w)
  const odds = Math.min(0.6, 0.12 + 0.1 * n)
  let added = 0
  for (const l of w.locations) {
    if (l.kind === 'house' || l.kind === 'police' || !chance(w.rng, odds)) continue
    l.cameras.push({ id: `cam${++w.counter}`, coverage: 0.6 + next(w.rng) * 0.3, hidden: chance(w.rng, 0.5), retentionDays: 30 })
    added++
  }
  return added
}

/** In-world word that the city is arming itself. Says nothing about where. */
export function camerasInTheNews(w: World) {
  addNews(w, 'news', 'Residents pay for new security cameras', `Shops, schools and neighbourhood groups across ${w.cityName} are putting up cameras. "We are not waiting for the city to protect our children."`)
}

export const DONT_TOUCH = 'You tried to harm a kid. The game got mad. Don’t touch the kids…'
