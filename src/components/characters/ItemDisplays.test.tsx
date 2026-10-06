import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { act } from 'react'
import StatBlockWidget from './StatBlockWidget'
import { ItemsTab } from './ItemsTab'
import { StatsTab } from './StatsTab'
import { useItemCatalogStore } from '../../stores/itemCatalogStore'
import { useCharacterStore } from '../../stores/characterStore'
import { makeBook, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import { item, makeHero } from '../../test/characterFixtures'
import { catalogItem, withNumberStat } from '../../test/itemFixtures'
import { render, type Rendered } from '../../test/render'
import type { Character } from '../../types'

let rendered: Rendered | null = null

beforeEach(() => {
  useItemCatalogStore.setState(useItemCatalogStore.getInitialState(), true)
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function renderBlock(c: Character, fields: string[]) {
  seedStore(makeBook([makeStorylet('c1', 'Text.')]), 'c1')
  seedCharacters([c], {})
  rendered = render(createElement(StatBlockWidget, { characterId: c.id, fields, storyletId: 'c1', offsetInStorylet: 0 }))
  return rendered.container
}

describe('statblock item details', () => {
  it('shows an item’s catalog description on hover', () => {
    useItemCatalogStore.setState({ items: [catalogItem('Rope', { description: 'Fifty feet of hemp.' })] })
    const el = renderBlock(makeHero('kael', { inventory: [item('Rope', 2)] }), ['inventory'])
    const chip = [...el.querySelectorAll('span')].find((s) => s.textContent === 'Rope ×2')
    expect(chip?.getAttribute('title')).toBe('Fifty feet of hemp.')
  })

  it('shows currency stats as coins', () => {
    const kael = withNumberStat(makeHero('kael'), 'purse', 'Purse', 2.5, { currency: true })
    const el = renderBlock(kael, ['purse'])
    expect(el.textContent).toContain('2g 50s')
  })

  it('shows carried weight against capacity when tracked', () => {
    useItemCatalogStore.setState({ items: [catalogItem('Anvil', { weight: 60 })] })
    const kael = withNumberStat(makeHero('kael', { inventory: [item('Anvil')] }), 'capacity', 'Capacity', 50)
    const el = renderBlock(kael, ['hp'])
    const load = el.querySelector('[data-testid="statblock-load"]')
    expect(load?.textContent).toContain('60 / 50')
  })
})

describe('items tab', () => {
  it('lists items in use without adding them by hand', () => {
    seedCharacters([makeHero('kael', { inventory: [item('Wolf Pelt')] })], {})
    rendered = render(createElement(ItemsTab))
    expect(rendered.container.querySelector('[data-testid="items-row-Wolf Pelt"]')).not.toBeNull()
  })

  it('creates a party stash', () => {
    seedCharacters([makeHero('kael')], {})
    rendered = render(createElement(ItemsTab))
    const sectionBtn = [...rendered.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Party stash'))
    act(() => sectionBtn?.click())
    const create = rendered.container.querySelector<HTMLButtonElement>('[data-testid="party-create"]')
    act(() => create?.click())
    const party = useCharacterStore.getState().characters.find((c) => c.kind === 'party')
    expect(party?.name).toBe('Party')
  })
})

describe('stats tab items', () => {
  function renderStats(c: Character) {
    const state = { base: structuredClone(c.baseValues), equipped: {}, activeBuffs: [] }
    const computed = new Map([[c.id, { state, effective: structuredClone(c.baseValues) }]])
    rendered = render(
      createElement(StatsTab, {
        characters: [c],
        computedPerCharacter: computed,
        hasStorylet: true,
        canEdit: false,
        editorView: null,
      }),
    )
    return rendered.container
  }

  it('shows currency stats as coins', () => {
    const kael = withNumberStat(makeHero('kael'), 'purse', 'Purse', 1.0203, { currency: true })
    const el = renderStats(kael)
    expect(el.querySelector('[data-testid="character-panel-effective-kael-purse"]')?.textContent).toBe('1g 2s 3c')
  })

  it('warns when carrying more than capacity', () => {
    useItemCatalogStore.setState({ items: [catalogItem('Anvil', { weight: 60 })] })
    const kael = withNumberStat(makeHero('kael', { inventory: [item('Anvil')] }), 'capacity', 'Capacity', 50)
    const el = renderStats(kael)
    const load = el.querySelector('[data-testid="character-panel-load-kael"]')
    expect(load?.textContent).toContain('60 / 50')
    expect(load?.textContent).toContain('Over capacity')
  })

  it('shows no load line without a capacity stat', () => {
    const el = renderStats(makeHero('kael', { inventory: [item('Anvil')] }))
    expect(el.querySelector('[data-testid="character-panel-load-kael"]')).toBeNull()
  })
})
