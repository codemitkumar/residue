import { chance, pick } from './rng'
import type { ItemId, World } from './types'
import { HOUR, hourOf } from './time'
import { generateCalls } from './calls'
import { processBodies } from './bodies'
import { processPolice } from './police'
import { completeActivity, startActivity } from './actions'
import { ITEMS, SHOP_ITEMS } from './items'
import { addEvidence, addNews, fullName } from './world'
import { processMessages } from './messages'
import { processJobs, processShifts } from './jobs'
import { processLife } from './life'
import { processUrge } from './urge'
import { processEnvironment } from './environment'
import { processMoney } from './money'
import { processUnderworld } from './underworld'
import { checkEncounter } from './patrol'
import { processLegal } from './legal'
import { processPopulation } from './population'

const STEP = 10 // minutes per simulation step

/** Advance the world. Stops early if something happens that should pause the game. */
export function advance(w: World, minutes: number) {
  const end = w.time + minutes
  while (w.time < end && !w.gameOver) {
    const prevHour = Math.floor(w.time / HOUR)
    w.time = Math.min(end, w.time + STEP)
    tickActivity(w)
    checkEncounter(w)
    const hour = Math.floor(w.time / HOUR)
    for (let h = prevHour + 1; h <= hour; h++) hourly(w, h * HOUR)
    if (w.pauseRequested) break
  }
}

function tickActivity(w: World) {
  for (const s of [...w.player.agenda]) {
    if (!s.started && w.time >= s.startAt) startActivity(w, s)
    if (s.started && !s.done && w.time >= s.endAt) {
      s.done = true
      completeActivity(w, s)
    }
    // Gone from the agenda once you are home again.
    if (s.done && w.time >= s.returnAt) w.player.agenda = w.player.agenda.filter((x) => x !== s)
  }
}

function hourly(w: World, t: number) {
  processEnvironment(w, t)
  generateCalls(w, t)
  processShifts(w, t)
  processBodies(w, t)
  processPolice(w, t)
  if (w.gameOver) return
  processMessages(w, t)
  processJobs(w, t)
  processLife(w, t)
  processUrge(w, t)
  processMoney(w, t)
  processUnderworld(w, t)
  processLegal(w, t)
  processPopulation(w, t)
  if (hourOf(t) === 0) {
    if ((w.player.food ?? 0) > 0) w.player.food! -= 1
    else {
      w.player.money -= 25
      addNews(w, 'personal', 'Nothing in the fridge', 'You ate out again: $25. Buy groceries.')
    }
    if (w.player.money < 0) addNews(w, 'personal', 'You are in debt', 'Rent and bills are due.')
  }
  // Ordinary people buy ordinary things — noise in the store records.
  if (chance(w.rng, 0.25)) {
    const buyer = pick(w.rng, w.people.filter((p) => p.alive && !p.isPlayer))
    const item: ItemId = pick(w.rng, SHOP_ITEMS)
    const store = pick(w.rng, w.locations.filter((l) => ITEMS[item].sold.includes(l.kind)))
    addEvidence(w, { kind: 'purchase', via: 'purchase_check', time: t, locationId: store.id, districtId: store.districtId, item, pointsTo: buyer.id, strength: ITEMS[item].trace, description: `Card purchase: ${ITEMS[item].name} at ${store.name} by ${fullName(buyer)}.` })
  }
}
