import type { ItemId, LocationKind } from './types'

export interface ItemDef {
  name: string
  price: number
  desc: string
  sold: LocationKind[]
  /** How much a card purchase of this item implicates the buyer, if police check. */
  trace: number
  /** Everyday household item. */
  home?: boolean
  /** Only from the black market. */
  black?: boolean
}

export const ITEMS: Record<ItemId, ItemDef> = {
  gloves: { name: 'Latex gloves', price: 15, desc: 'Box of 100, disposable.', sold: ['hardware', 'pharmacy', 'grocery'], trace: 0.03 },
  knife: { name: 'Hunting knife', price: 40, desc: 'Fixed blade, 6 inch.', sold: ['hardware'], trace: 0.15 },
  rope: { name: 'Nylon rope', price: 20, desc: '20 m, heavy duty.', sold: ['hardware'], trace: 0.12 },
  bleach: { name: 'Bleach', price: 8, desc: 'Household bleach, 2 L.', sold: ['pharmacy', 'grocery'], trace: 0.06 },
  shovel: { name: 'Shovel', price: 35, desc: 'Steel garden shovel.', sold: ['hardware'], trace: 0.1 },
  tarp: { name: 'Tarp', price: 25, desc: 'Heavy plastic sheet, 3×4 m.', sold: ['hardware'], trace: 0.1 },
  weights: { name: 'Chain & weights', price: 45, desc: 'Steel chain and two 10 kg weights.', sold: ['hardware'], trace: 0.15 },
  mask: { name: 'Balaclava', price: 20, desc: 'Black knit balaclava.', sold: ['hardware', 'pharmacy'], trace: 0.08 },
  burner: { name: 'Burner phone', price: 60, desc: 'Prepaid phone, no contract.', sold: ['grocery', 'pharmacy'], trace: 0.2 },
  scanner: { name: 'Police scanner', price: 150, desc: 'Handheld radio scanner.', sold: ['hardware'], trace: 0.05 },
  victim_phone: { name: "Victim's phone", price: 0, desc: 'Switched off.', sold: [], trace: 0 },
  groceries: { name: 'Weekly groceries', price: 70, desc: 'A week of food for one.', sold: ['grocery'], trace: 0, home: true },
  flowers: { name: 'Flowers', price: 25, desc: 'A nice bouquet.', sold: ['grocery'], trace: 0, home: true },
  wine: { name: 'Bottle of wine', price: 18, desc: 'Red, decent.', sold: ['grocery'], trace: 0, home: true },
  cleaner: { name: 'Cleaning supplies', price: 15, desc: 'Sponges, spray, paper towels.', sold: ['grocery', 'pharmacy'], trace: 0, home: true },
  spray: { name: 'Spray paint', price: 12, desc: 'Black, matte.', sold: ['hardware'], trace: 0.05 },
  // Black market — cash only, no receipts.
  fake_id_cheap: { name: 'Fake ID (cheap)', price: 150, desc: 'Laminated at home by the look of it.', sold: [], trace: 0, black: true },
  fake_id_good: { name: 'Fake ID (quality)', price: 1400, desc: 'Holograms, real paper stock. You’d believe it.', sold: [], trace: 0, black: true },
  clean_burner: { name: 'Clean burner', price: 90, desc: 'Prepaid phone bought by someone else, nowhere near here.', sold: [], trace: 0, black: true },
  stolen_plates: { name: 'Stolen licence plates', price: 250, desc: 'Off a car the same make as yours.', sold: [], trace: 0, black: true },
  sedative: { name: 'Sedative', price: 300, desc: 'A syringe. Works in seconds.', sold: [], trace: 0, black: true },
  pistol: { name: 'Unregistered pistol', price: 900, desc: 'Serial number filed off. Loud.', sold: [], trace: 0, black: true },
  fixer: { name: 'The Cleaner’s number', price: 2500, desc: 'One call. A body disappears. No questions.', sold: [], trace: 0, black: true },
}

export const BLACK_ITEMS = (Object.keys(ITEMS) as ItemId[]).filter((k) => ITEMS[k].black)

/** Ordinary household shopping. */
export const isHomeItem = (id: ItemId) => !!ITEMS[id].home

export const SHOP_ITEMS = (Object.keys(ITEMS) as ItemId[]).filter((k) => ITEMS[k].sold.length > 0)
