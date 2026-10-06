import { ALL_ITEMS } from './items'
import { COSMETICS } from './cosmetics'
import { todayKey } from './metrics'

/**
 * One discounted item per local day (20–40% off). A pure function of the
 * date, so buying the deal doesn't roll a new one.
 */
export interface DailyDeal {
  itemId: string
  percentOff: number
}

const DISCOUNTS = [20, 25, 30, 35, 40]

/** Everything that can be on deal: paid catalog items and cosmetics. */
export function dealPool(): Array<{ id: string; price: number }> {
  return [...ALL_ITEMS, ...COSMETICS].filter((i) => i.price > 0).map((i) => ({ id: i.id, price: i.price }))
}

/** FNV-1a: a small stable string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function dailyDeal(now: number = Date.now()): DailyDeal {
  const key = todayKey(now)
  const pool = dealPool()
  const h = hash(`deal:${key}`)
  return {
    itemId: pool.length > 0 ? pool[h % pool.length].id : '',
    percentOff: DISCOUNTS[hash(`pct:${key}`) % DISCOUNTS.length],
  }
}

/** What an item costs right now: its price, or the deal price if it's today's deal. */
export function dealPrice(id: string, basePrice: number, now: number = Date.now()): number {
  const deal = dailyDeal(now)
  if (deal.itemId !== id) return basePrice
  return Math.round((basePrice * (100 - deal.percentOff)) / 100)
}
