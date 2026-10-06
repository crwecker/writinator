import { beforeEach, describe, expect, it } from 'vitest'
import { dailyDeal, dealPrice, dealPool } from './dailyDeal'
import { getItemById } from './items'
import { usePlayerStore } from '../stores/playerStore'

const day = (d: number, hour = 12) => new Date(2026, 9, d, hour).getTime()

beforeEach(() => {
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

describe('dailyDeal', () => {
  it('is the same all day (deterministic per local date)', () => {
    expect(dailyDeal(day(6, 0))).toEqual(dailyDeal(day(6, 23)))
  })

  it('discounts a priced item 20–40%', () => {
    for (let d = 1; d <= 60; d++) {
      const deal = dailyDeal(new Date(2026, 0, d).getTime())
      expect(deal.percentOff).toBeGreaterThanOrEqual(20)
      expect(deal.percentOff).toBeLessThanOrEqual(40)
      const entry = dealPool().find((p) => p.id === deal.itemId)
      expect(entry?.price).toBeGreaterThan(0)
    }
  })

  it('rotates across days', () => {
    const ids = new Set(Array.from({ length: 30 }, (_, i) => dailyDeal(new Date(2026, 0, i + 1).getTime()).itemId))
    expect(ids.size).toBeGreaterThan(5)
  })

  it('prices only the deal item down', () => {
    const now = day(6)
    const deal = dailyDeal(now)
    const base = dealPool().find((p) => p.id === deal.itemId)!.price
    expect(dealPrice(deal.itemId, base, now)).toBe(Math.round((base * (100 - deal.percentOff)) / 100))
    const other = dealPool().find((p) => p.id !== deal.itemId)!
    expect(dealPrice(other.id, other.price, now)).toBe(other.price)
  })

  it('the armory charges the deal price', () => {
    // Find a day whose deal is a catalog item (not a cosmetic).
    let now = day(1)
    for (let d = 1; d < 400; d++) {
      now = new Date(2026, 0, d, 12).getTime()
      if (getItemById(dailyDeal(now).itemId)) break
    }
    const deal = dailyDeal(now)
    const item = getItemById(deal.itemId)!
    const price = dealPrice(item.id, item.price, now)
    expect(price).toBeLessThan(item.price)
    usePlayerStore.setState({ coins: price })
    expect(usePlayerStore.getState().purchaseItem(item.id, now)).toBe(true)
    expect(usePlayerStore.getState().coins).toBe(0)
  })
})
