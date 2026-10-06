import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArmoryPanel } from './ArmoryPanel'
import { usePlayerStore } from '../../stores/playerStore'
import { useCosmeticsStore } from '../../stores/cosmeticsStore'
import { dailyDeal, dealPrice } from '../../lib/dailyDeal'
import { getItemById } from '../../lib/items'
import { getCosmetic } from '../../lib/cosmetics'
import { render, type Rendered } from '../../test/render'

let view: Rendered | null = null

/** A noon on some day whose deal matches `pick`. */
function dayWhere(pick: (itemId: string) => boolean): number {
  for (let d = 1; d < 400; d++) {
    const t = new Date(2026, 0, d, 12).getTime()
    if (pick(dailyDeal(t).itemId)) return t
  }
  throw new Error('no such day')
}

function cards(name: string): HTMLElement[] {
  return [...view!.container.querySelectorAll('article')].filter((a) => a.textContent?.includes(name)) as HTMLElement[]
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const b = [...root.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  if (!b) throw new Error(`no button "${text}"`)
  return b
}

beforeEach(() => {
  vi.useFakeTimers()
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useCosmeticsStore.setState(useCosmeticsStore.getInitialState(), true)
})

afterEach(() => {
  view?.unmount()
  view = null
  vi.useRealTimers()
})

describe('ArmoryPanel', () => {
  it('highlights the daily deal and charges its price', () => {
    const now = dayWhere((id) => getItemById(id)?.category === 'weapon')
    vi.setSystemTime(now)
    const deal = dailyDeal(now)
    const item = getItemById(deal.itemId)!
    const price = dealPrice(item.id, item.price, now)
    usePlayerStore.setState({ coins: price })
    view = render(<ArmoryPanel />)

    expect(view.container.textContent).toContain(`${deal.percentOff}% off today only`)
    const banner = cards(item.name)[0]
    expect(banner.querySelector('.line-through')?.textContent).toBe(item.price.toLocaleString())
    act(() => button(banner, 'Buy').click())
    if (price > 500) act(() => button(banner, 'Buy').click())
    expect(usePlayerStore.getState().ownedItems).toContain(item.id)
    expect(usePlayerStore.getState().coins).toBe(0)
  })

  it('sells cosmetics on their own shelf, then puts them to use', () => {
    const now = dayWhere((id) => id !== 'theme-parchment')
    vi.setSystemTime(now)
    usePlayerStore.setState({ coins: 1000 })
    view = render(<ArmoryPanel />)
    act(() => button(view!.container, 'Cosmetics').click())

    const card = () => cards('Parchment').at(-1)!
    act(() => button(card(), 'Buy').click())
    expect(usePlayerStore.getState().coins).toBe(1000 - getCosmetic('theme-parchment')!.price)
    act(() => button(card(), 'Use').click())
    expect(useCosmeticsStore.getState().editorTheme).toBe('theme-parchment')
  })

  it('switches owned cosmetics from the loadout', () => {
    useCosmeticsStore.setState({ owned: ['theme-forest'] })
    view = render(<ArmoryPanel />)
    const select = view.container.querySelector('select[aria-label="Editor theme"]') as HTMLSelectElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'theme-forest')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useCosmeticsStore.getState().editorTheme).toBe('theme-forest')
  })
})
