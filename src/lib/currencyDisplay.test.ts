import { beforeEach, describe, expect, it } from 'vitest'
import { formatStatValue, formatStatValueInline, EXPORT_VALUE_FORMAT } from './statFormat'
import { renderStatblockText } from './export'
import { useItemCatalogStore } from '../stores/itemCatalogStore'
import { makeCharacter } from '../test/fixtures'
import type { StatDefinition } from '../types'

const gold: StatDefinition = { id: 'gold', name: 'Gold', type: 'number' }
const hero = makeCharacter('hero', [gold], { gold: { kind: 'number', value: 2.5 } })

describe('coins outside the editor chips', () => {
  beforeEach(() => {
    useItemCatalogStore.setState(useItemCatalogStore.getInitialState())
  })

  it('a {Gold} reference reads as coins', () => {
    expect(formatStatValueInline({ kind: 'number', value: 2.5 }, null, gold)).toBe('2g 50s')
  })

  it('exported status blocks show coins', () => {
    expect(formatStatValue({ kind: 'number', value: 2.5 }, EXPORT_VALUE_FORMAT, gold)).toBe('2g 50s')
    const text = renderStatblockText(hero, { base: hero.baseValues, equipped: {}, activeBuffs: [] }, hero.baseValues, ['gold'], 'markdown')
    expect(text).toContain('Gold: 2g 50s')
  })

  it('stats that are not currency are unchanged', () => {
    const hp: StatDefinition = { id: 'hp', name: 'Level', type: 'number' }
    expect(formatStatValueInline({ kind: 'number', value: 3 }, null, hp)).toBe('3')
  })
})
