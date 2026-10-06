import { beforeEach, describe, expect, it } from 'vitest'
import { hydrateItemCatalog, serializeItemCatalog, useItemCatalogStore } from './itemCatalogStore'
import { useCharacterStore } from './characterStore'
import { buildWritinatorFile, parseFileJSON } from '../lib/fileSystem'
import { DEFAULT_CURRENCY } from '../lib/itemCatalog'
import { makeBook, makeStorylet } from '../test/fixtures'
import { item, makeHero } from '../test/characterFixtures'

beforeEach(() => {
  useItemCatalogStore.setState(useItemCatalogStore.getInitialState(), true)
  useCharacterStore.setState({ characters: [], markers: {} })
})

describe('item catalog store', () => {
  it('adds used items once, case-insensitively, keeping details', () => {
    const s = useItemCatalogStore.getState()
    const id = s.addItem('Iron Sword')
    s.updateItem(id, { weight: 3 })
    s.ensureItems(['iron sword', 'Rope', 'Rope'])
    const items = useItemCatalogStore.getState().items
    expect(items.map((i) => i.name)).toEqual(['Iron Sword', 'Rope'])
    expect(items[0].weight).toBe(3)
  })

  it('serializes items, macros and currency, adding items in use', () => {
    useCharacterStore.setState({ characters: [makeHero('kael', { inventory: [item('Wolf Pelt')] })], markers: {} })
    useItemCatalogStore.getState().addMacro({ name: 'level up', body: '+1 Level' })
    const data = serializeItemCatalog()
    expect(data.items.map((i) => i.name)).toEqual(['Wolf Pelt'])
    expect(data.macros.map((m) => m.name)).toEqual(['level up'])
    expect(data.currency).toEqual(DEFAULT_CURRENCY)
  })

  it('hydrates from a file and starts empty for a file without a catalog', () => {
    hydrateItemCatalog({
      items: [{ id: 'a', name: 'Rope', weight: 1 }],
      macros: [{ id: 'm', name: 'rest', body: 'fill HP' }],
    })
    let s = useItemCatalogStore.getState()
    expect(s.items).toHaveLength(1)
    expect(s.macros).toHaveLength(1)
    expect(s.currency).toEqual(DEFAULT_CURRENCY)
    hydrateItemCatalog(undefined)
    s = useItemCatalogStore.getState()
    expect(s.items).toEqual([])
    expect(s.macros).toEqual([])
  })

  it('drops malformed entries when hydrating', () => {
    hydrateItemCatalog({
      items: [{ id: 'a', name: 'Rope' }, { id: 'b' } as never, null as never],
      macros: 'nope' as never,
    })
    const s = useItemCatalogStore.getState()
    expect(s.items.map((i) => i.name)).toEqual(['Rope'])
    expect(s.macros).toEqual([])
  })
})

describe('item catalog in book files', () => {
  it('round-trips through save and open', async () => {
    const s = useItemCatalogStore.getState()
    const id = s.addItem('Lantern')
    s.updateItem(id, { description: 'Lights the way.', value: 250 })
    s.setCurrency({ denominations: [{ name: 'crown', abbr: 'cr', value: 1 }] })

    const file = await buildWritinatorFile(makeBook([makeStorylet('a', 'x')]), {}, 1)
    const reopened = parseFileJSON(JSON.stringify(file))
    expect(reopened?.itemCatalog?.items[0]).toMatchObject({ name: 'Lantern', description: 'Lights the way.', value: 250 })

    useItemCatalogStore.setState(useItemCatalogStore.getInitialState(), true)
    hydrateItemCatalog(reopened?.itemCatalog)
    expect(useItemCatalogStore.getState().items[0].description).toBe('Lights the way.')
    expect(useItemCatalogStore.getState().currency.denominations[0].name).toBe('crown')
  })

  it('opens older files without a catalog', async () => {
    const file = await buildWritinatorFile(makeBook([makeStorylet('a', 'x')]), {}, 1)
    const { itemCatalog: _drop, ...older } = file
    void _drop
    const reopened = parseFileJSON(JSON.stringify(older))
    expect(reopened).not.toBeNull()
    expect(reopened?.itemCatalog).toBeUndefined()
  })
})
