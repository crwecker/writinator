import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CURRENCY,
  carriedWeight,
  collectUsedItemNames,
  currencyStatOf,
  currencyUnitValue,
  findCatalogItem,
  formatCoins,
  formatStatValueWithCurrency,
  parseCoins,
  resolveCatalogModifiers,
  capacityOf,
  equipFromCatalog,
} from './itemCatalog'
import { item, makeHero, initialState } from '../test/characterFixtures'
import { catalogItem, withNumberStat } from '../test/itemFixtures'
import type { CurrencyConfig, StatDelta } from '../types'

describe('currency', () => {
  it('formats smallest units as gold/silver/copper by default', () => {
    expect(formatCoins(25000, DEFAULT_CURRENCY)).toBe('2g 50s')
    expect(formatCoins(10203, DEFAULT_CURRENCY)).toBe('1g 2s 3c')
    expect(formatCoins(0, DEFAULT_CURRENCY)).toBe('0g')
    expect(formatCoins(-150, DEFAULT_CURRENCY)).toBe('-1s 50c')
  })

  it('parses coin amounts by abbreviation or name', () => {
    expect(parseCoins('2g 50s', DEFAULT_CURRENCY)).toBe(25000)
    expect(parseCoins('3 silver 4 copper', DEFAULT_CURRENCY)).toBe(304)
    expect(parseCoins('1 gold', DEFAULT_CURRENCY)).toBe(10000)
    expect(parseCoins('2gp', DEFAULT_CURRENCY)).toBeNull()
    expect(parseCoins('3 Arrows', DEFAULT_CURRENCY)).toBeNull()
    expect(parseCoins('', DEFAULT_CURRENCY)).toBeNull()
  })

  it('honours custom denominations', () => {
    const cfg: CurrencyConfig = {
      denominations: [
        { name: 'crown', abbr: 'cr', value: 20 },
        { name: 'penny', abbr: 'p', value: 1 },
      ],
    }
    expect(parseCoins('1cr 5p', cfg)).toBe(25)
    expect(formatCoins(45, cfg)).toBe('2cr 5p')
  })

  it('finds a flagged currency stat, else a stat named for a coin', () => {
    const kael = makeHero('kael')
    expect(currencyStatOf(kael, DEFAULT_CURRENCY)?.id).toBe('gold')
    const off = { ...kael, stats: kael.stats.map((s) => (s.id === 'gold' ? { ...s, currency: false } : s)) }
    expect(currencyStatOf(off, DEFAULT_CURRENCY)).toBeUndefined()
    const purse = withNumberStat(kael, 'purse', 'Purse', 0, { currency: true })
    expect(currencyStatOf(purse, DEFAULT_CURRENCY)?.id).toBe('purse')
  })

  it('counts a stat in the denomination its name matches, else the largest', () => {
    expect(currencyUnitValue({ id: 'gold', name: 'Gold', type: 'number' }, DEFAULT_CURRENCY)).toBe(10000)
    expect(currencyUnitValue({ id: 's', name: 'Silver', type: 'number' }, DEFAULT_CURRENCY)).toBe(100)
    expect(currencyUnitValue({ id: 'p', name: 'Purse', type: 'number' }, DEFAULT_CURRENCY)).toBe(10000)
  })

  it('formats currency stat values as coins, others unchanged', () => {
    const def = { id: 'gold', name: 'Gold', type: 'number' as const, currency: true }
    expect(formatStatValueWithCurrency({ kind: 'number', value: 2.5 }, def, DEFAULT_CURRENCY)).toBe('2g 50s')
    const named = { id: 'gold', name: 'Gold', type: 'number' as const }
    expect(formatStatValueWithCurrency({ kind: 'number', value: 2.5 }, named, DEFAULT_CURRENCY)).toBe('2g 50s')
    const off = { ...named, currency: false }
    expect(formatStatValueWithCurrency({ kind: 'number', value: 2.5 }, off, DEFAULT_CURRENCY)).toBeNull()
    const plain = { id: 'xp', name: 'XP', type: 'number' as const }
    expect(formatStatValueWithCurrency({ kind: 'number', value: 2.5 }, plain, DEFAULT_CURRENCY)).toBeNull()
  })
})

describe('catalog lookups', () => {
  const catalog = [
    catalogItem('Iron Sword', { slot: 'Weapon', weight: 3, modifiers: [{ stat: 'STR', amount: 2 }, { stat: 'HP', amount: 5, max: true }] }),
    catalogItem('Rope', { weight: 1.5 }),
  ]

  it('finds items case-insensitively', () => {
    expect(findCatalogItem(catalog, 'iron sword')?.name).toBe('Iron Sword')
    expect(findCatalogItem(catalog, 'Axe')).toBeUndefined()
  })

  it('resolves modifiers against a character’s stats and attribute keys', () => {
    const kael = makeHero('kael')
    expect(resolveCatalogModifiers(catalog[0], kael)).toEqual([
      { statId: 'attributes', kind: 'flat', amount: 2, attributeKey: 'STR' },
      { statId: 'hp', kind: 'maxFlat', amount: 5 },
    ])
  })

  it('drops modifiers for stats the character lacks', () => {
    const odd = catalogItem('Odd', { modifiers: [{ stat: 'Sanity', amount: 1 }] })
    expect(resolveCatalogModifiers(odd, makeHero('kael'))).toEqual([])
  })

  it('totals carried weight from inventory quantities', () => {
    const kael = makeHero('kael', { inventory: [item('Rope', 2), item('Iron Sword'), item('Mystery')] })
    expect(carriedWeight(kael, initialState(kael).base, catalog)).toBe(6)
  })

  it('reads carry capacity only when a capacity stat exists', () => {
    const kael = makeHero('kael')
    expect(capacityOf(kael, initialState(kael).base)).toBeNull()
    const strong = withNumberStat(kael, 'capacity', 'Capacity', 50)
    expect(capacityOf(strong, initialState(strong).base)).toBe(50)
  })
})

describe('collectUsedItemNames', () => {
  it('collects inventory items from base values, markers and equips', () => {
    const kael = makeHero('kael', { inventory: [item('Rope')], spells: [{ name: 'Fireball', fields: { level: 1, mana: 2 } }] })
    const markers: Record<string, StatDelta[]> = {
      m1: [
        { id: 'd1', characterId: 'kael', op: { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } } },
        { id: 'd2', characterId: 'kael', op: { kind: 'itemAdd', statId: 'spells', name: 'Frost', fields: { level: 1, mana: 0 } } },
        { id: 'd3', characterId: 'kael', op: { kind: 'equip', slot: 'Weapon', itemId: 'Axe', itemName: 'Axe', modifiers: [] } },
        { id: 'd4', characterId: 'ghost', op: { kind: 'itemAdd', statId: 'inventory', name: 'Nope', fields: { qty: 1 } } },
      ],
    }
    expect(collectUsedItemNames([kael], markers)).toEqual(['Rope', 'Wolf Pelt', 'Axe'])
  })
})

describe('equipFromCatalog', () => {
  const sword = catalogItem('Iron Sword', { slot: 'weapon', modifiers: [{ stat: 'STR', amount: 2 }] })
  const base = { kind: 'equip' as const, slot: 'Armor', itemId: '', modifiers: [] }

  it('fills slot, name and modifiers when the typed name is a catalog item', () => {
    expect(equipFromCatalog(base, 'iron sword', makeHero('kael'), [sword])).toEqual({
      kind: 'equip',
      slot: 'Weapon',
      itemId: 'Iron Sword',
      itemName: 'Iron Sword',
      modifiers: [{ statId: 'attributes', kind: 'flat', amount: 2, attributeKey: 'STR' }],
    })
  })

  it('just sets the id for other names', () => {
    expect(equipFromCatalog(base, 'Stick', makeHero('kael'), [sword])).toEqual({ ...base, itemId: 'Stick' })
  })
})
