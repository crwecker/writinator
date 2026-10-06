import { beforeEach, describe, expect, it } from 'vitest'
import { useCosmeticsStore, galleryFrameClassName } from './cosmeticsStore'
import { usePlayerStore } from './playerStore'
import { COSMETICS, EDITOR_THEMES, GALLERY_FRAMES, getCosmetic } from '../lib/cosmetics'
import { dailyDeal } from '../lib/dailyDeal'

const NOW = new Date(2026, 9, 6, 12).getTime()

beforeEach(() => {
  useCosmeticsStore.setState(useCosmeticsStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

/** A priced cosmetic that isn't today's deal (so its price is exact). */
function pricedCosmetic(kind: string) {
  const deal = dailyDeal(NOW).itemId
  return COSMETICS.find((c) => c.kind === kind && c.price > 0 && c.id !== deal)!
}

describe('cosmetics catalog', () => {
  it('has a free default and 4–6 paid editor themes', () => {
    expect(EDITOR_THEMES.filter((t) => t.price === 0)).toHaveLength(1)
    const paid = EDITOR_THEMES.filter((t) => t.price > 0).length
    expect(paid).toBeGreaterThanOrEqual(4)
    expect(paid).toBeLessThanOrEqual(6)
  })

  it('default gallery frame keeps the current look', () => {
    expect(galleryFrameClassName(useCosmeticsStore.getState().galleryFrame)).toBe('border-4 border-amber-950')
    expect(GALLERY_FRAMES.length).toBeGreaterThanOrEqual(4)
  })
})

describe('cosmeticsStore', () => {
  it('starts on the free defaults', () => {
    const s = useCosmeticsStore.getState()
    expect(getCosmetic(s.editorTheme)?.price).toBe(0)
    expect(getCosmetic(s.cursorStyle)?.price).toBe(0)
    expect(s.editorFont).toBeNull()
  })

  it('buys a cosmetic with coins, once', () => {
    const theme = pricedCosmetic('theme')
    usePlayerStore.setState({ coins: theme.price * 2 })
    expect(useCosmeticsStore.getState().purchase(theme.id, NOW)).toBe(true)
    expect(usePlayerStore.getState().coins).toBe(theme.price)
    expect(useCosmeticsStore.getState().owned).toContain(theme.id)
    expect(useCosmeticsStore.getState().purchase(theme.id, NOW)).toBe(false)
    expect(usePlayerStore.getState().coins).toBe(theme.price)
  })

  it('refuses when short of coins', () => {
    const theme = pricedCosmetic('theme')
    usePlayerStore.setState({ coins: theme.price - 1 })
    expect(useCosmeticsStore.getState().purchase(theme.id, NOW)).toBe(false)
    expect(useCosmeticsStore.getState().owned).not.toContain(theme.id)
  })

  it('charges the daily deal price for a cosmetic on deal', () => {
    let now = NOW
    for (let d = 1; d < 400; d++) {
      now = new Date(2026, 0, d, 12).getTime()
      if (getCosmetic(dailyDeal(now).itemId)) break
    }
    const c = getCosmetic(dailyDeal(now).itemId)!
    usePlayerStore.setState({ coins: c.price })
    expect(useCosmeticsStore.getState().purchase(c.id, now)).toBe(true)
    expect(usePlayerStore.getState().coins).toBeGreaterThan(0)
  })

  it('only switches to owned cosmetics, by kind', () => {
    const theme = pricedCosmetic('theme')
    const frame = pricedCosmetic('frame')
    const font = pricedCosmetic('font')
    useCosmeticsStore.getState().select(theme.id)
    expect(useCosmeticsStore.getState().editorTheme).not.toBe(theme.id)

    usePlayerStore.setState({ coins: 10_000 })
    for (const c of [theme, frame, font]) useCosmeticsStore.getState().purchase(c.id, NOW)
    useCosmeticsStore.getState().select(theme.id)
    useCosmeticsStore.getState().select(frame.id)
    useCosmeticsStore.getState().select(font.id)
    expect(useCosmeticsStore.getState()).toMatchObject({ editorTheme: theme.id, galleryFrame: frame.id, editorFont: font.id })

    useCosmeticsStore.getState().clearFont()
    expect(useCosmeticsStore.getState().editorFont).toBeNull()
  })
})
