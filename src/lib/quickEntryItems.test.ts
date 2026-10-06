import { describe, expect, it } from 'vitest'
import { opToQuickEntry, parseQuickEntry, quickEntryCompletions, type QuickEntryContext } from './quickEntry'
import { DEFAULT_CURRENCY } from './itemCatalog'
import { createPartyCharacter } from './party'
import { item, makeHero, initialState, stateLookup } from '../test/characterFixtures'
import { catalogItem, macro, withNumberStat } from '../test/itemFixtures'
import type { Character, CharacterState } from '../types'

const kael = makeHero('kael', { inventory: [item('Iron Sword'), item('Arrows', 5), item('Rope', 2)] })
const mira = makeHero('mira', { color: '#60a5fa', hp: [20, 30], inventory: [] })
const party: Character = { ...createPartyCharacter('Party', '#a3a3a3'), id: 'party' }
const catalog = [
  catalogItem('Iron Sword', {
    slot: 'Weapon',
    weight: 3,
    description: 'A plain blade.',
    modifiers: [{ stat: 'STR', amount: 2 }],
  }),
  catalogItem('Plate Mail', { slot: 'Armor', weight: 40, modifiers: [{ stat: 'HP', amount: 10, max: true }] }),
  catalogItem('Rope', { weight: 1 }),
  catalogItem('Lantern', { weight: 2 }),
]

function ctx(characters: Character[] = [kael, mira, party], extra: Partial<QuickEntryContext> = {}): QuickEntryContext {
  return {
    characters,
    stateFor: stateLookup(characters),
    defaultCharacterId: null,
    catalog,
    currency: DEFAULT_CURRENCY,
    macros: [],
    ...extra,
  }
}

function ops(input: string, c: QuickEntryContext = ctx()) {
  const r = parseQuickEntry(input, c)
  expect(r.clauses.map((cl) => cl.error).filter(Boolean)).toEqual([])
  return r.ops
}

function previews(input: string, c: QuickEntryContext = ctx()) {
  return parseQuickEntry(input, c).clauses.flatMap((cl) =>
    cl.preview.map((p) => `${p.characterName} · ${p.text}${p.warning ? ` [${p.warning}]` : ''}`),
  )
}

describe('quick entry — equipment from the catalog', () => {
  it('equips a catalog item into its slot with its modifiers', () => {
    expect(ops('Kael equips iron sword')).toEqual([
      {
        characterId: 'kael',
        op: {
          kind: 'equip',
          slot: 'Weapon',
          itemId: 'Iron Sword',
          itemName: 'Iron Sword',
          modifiers: [{ statId: 'attributes', kind: 'flat', amount: 2, attributeKey: 'STR' }],
        },
      },
    ])
  })

  it('previews the stat change the item brings', () => {
    expect(previews('Kael equips Plate Mail')).toEqual(['Kael · Armor: — → Plate Mail (HP max 40 → 50)'])
  })

  it('writes a catalog equip back as text that parses to the same op', () => {
    const [entry] = ops('Kael equips Iron Sword')
    const text = opToQuickEntry(entry.op, kael, initialState(kael), catalog)
    expect(text).toBe('Kael equips Iron Sword as Weapon')
    expect(ops(text ?? '')).toEqual([entry])
    expect(opToQuickEntry(entry.op, kael, initialState(kael))).toBeNull()
  })

  it('still equips unknown items without modifiers', () => {
    expect(ops('Kael equips Stick')[0].op).toMatchObject({ kind: 'equip', itemId: 'Stick', modifiers: [] })
  })
})

describe('quick entry — transfers', () => {
  it('unequips an equipped item when giving the last one away', () => {
    const equipped: CharacterState = {
      ...initialState(kael),
      equipped: { Weapon: { itemId: 'Iron Sword', itemName: 'Iron Sword', modifiers: [] } },
    }
    const c = ctx(undefined, { stateFor: stateLookup([kael, mira, party], { kael: equipped }) })
    expect(ops('Kael gives Mira Iron Sword', c)).toEqual([
      { characterId: 'kael', op: { kind: 'unequip', slot: 'Weapon' } },
      { characterId: 'kael', op: { kind: 'itemRemove', statId: 'inventory', name: 'Iron Sword' } },
      { characterId: 'mira', op: { kind: 'itemAdd', statId: 'inventory', name: 'Iron Sword', fields: { qty: 1 } } },
    ])
  })

  it('shows both sides of a transfer in the preview', () => {
    expect(previews('Kael gives Mira 2 Arrows')).toEqual(['Kael · Arrows ×5 → ×3', 'Mira · +Arrows ×2'])
  })
})

describe('quick entry — party stash', () => {
  it('adds to the party directly', () => {
    expect(ops('Party +200 Gold')).toEqual([{ characterId: 'party', op: { kind: 'adjust', statId: 'gold', delta: 200 } }])
  })

  it('takes an item from the party', () => {
    const stocked = { ...party, baseValues: { ...party.baseValues, inventory: { kind: 'inventory' as const, items: [item('Lantern')] } } }
    expect(ops('Mira takes Lantern from Party', ctx([kael, mira, stocked]))).toEqual([
      { characterId: 'party', op: { kind: 'itemRemove', statId: 'inventory', name: 'Lantern' } },
      { characterId: 'mira', op: { kind: 'itemAdd', statId: 'inventory', name: 'Lantern', fields: { qty: 1 } } },
    ])
  })

  it('stashes an item in the party', () => {
    expect(ops('Kael stashes Rope')).toEqual([
      { characterId: 'kael', op: { kind: 'itemFieldAdjust', statId: 'inventory', name: 'Rope', field: 'qty', delta: -1 } },
      { characterId: 'party', op: { kind: 'itemAdd', statId: 'inventory', name: 'Rope', fields: { qty: 1 } } },
    ])
  })

  it('offers to create the party stash when there is none', () => {
    const r = parseQuickEntry('Kael stashes Rope', ctx([kael, mira]))
    expect(r.clauses[0].create).toEqual({ kind: 'party', name: 'Party' })
    const r2 = parseQuickEntry('Party +5 Gold', ctx([kael, mira]))
    expect(r2.clauses[0].create).toEqual({ kind: 'party', name: 'Party' })
  })
})

describe('quick entry — currency', () => {
  it('adds coins to a gold stat in gold units', () => {
    expect(ops('Kael +2g 50s')).toEqual([{ characterId: 'kael', op: { kind: 'adjust', statId: 'gold', delta: 2.5 } }])
  })

  it('previews a default character’s Gold as coins', () => {
    expect(previews('Kael +2g 50s')).toEqual(['Kael · Gold 20g → 22g 50s'])
  })

  it('previews currency stats as coins', () => {
    expect(previews('Party +2g 50s')).toEqual(['Party · Gold 0g → 2g 50s'])
  })

  it('counts a flagged non-coin stat in the largest denomination', () => {
    const k = withNumberStat(makeHero('kael'), 'purse', 'Purse', 1, { currency: true })
    expect(ops('Kael -30c', ctx([k]))).toEqual([{ characterId: 'kael', op: { kind: 'adjust', statId: 'purse', delta: -0.003 } }])
  })

  it('gives coins between characters', () => {
    expect(ops('Kael gives Mira 5s')).toEqual([
      { characterId: 'kael', op: { kind: 'adjust', statId: 'gold', delta: -0.05 } },
      { characterId: 'mira', op: { kind: 'adjust', statId: 'gold', delta: 0.05 } },
    ])
  })

  it('offers a currency stat when there is nowhere to put coins', () => {
    const bare: Character = { ...kael, stats: kael.stats.filter((s) => s.id !== 'gold') }
    const r = parseQuickEntry('Kael +2g', ctx([bare]))
    expect(r.clauses[0].create).toEqual({ kind: 'stat', characterId: 'kael', name: 'Coins', type: 'number', currency: true })
  })

  it('keeps "+3 Arrows" an item', () => {
    expect(ops('Kael +3 Arrows')[0].op.kind).toBe('itemFieldAdjust')
  })
})

describe('quick entry — weight & capacity', () => {
  it('warns when a gain puts the character over capacity', () => {
    const strong = withNumberStat(kael, 'capacity', 'Capacity', 10)
    expect(previews('Kael +Plate Mail', ctx([strong]))).toEqual(['Kael · +Plate Mail ×1 [Over capacity: 45 / 10]'])
  })

  it('says nothing without a capacity stat', () => {
    expect(previews('Kael +Plate Mail')).toEqual(['Kael · +Plate Mail ×1'])
  })
})

describe('quick entry — macros', () => {
  const levelUp = macro('level up', '+1 Level, max HP +10, fill HP')

  it('expands a global macro for the named character', () => {
    expect(ops('Kael level up', ctx(undefined, { macros: [levelUp] }))).toEqual([
      { characterId: 'kael', op: { kind: 'adjust', statId: 'level', delta: 1 } },
      { characterId: 'kael', op: { kind: 'maxAdjust', statId: 'hp', delta: 10 } },
      { characterId: 'kael', op: { kind: 'fill', statId: 'hp' } },
    ])
  })

  it('previews each step on top of the previous one', () => {
    expect(previews('Mira level up', ctx(undefined, { macros: [levelUp] }))).toEqual([
      'Mira · Level 1 → 2',
      'Mira · HP max 30 → 40',
      'Mira · HP 20 → 40',
    ])
  })

  it('prefers a character’s own macro over a global one', () => {
    const own = macro('level up', '+2 Level', 'mira')
    const r = ops('Mira level up', ctx(undefined, { macros: [levelUp, own] }))
    expect(r).toEqual([{ characterId: 'mira', op: { kind: 'adjust', statId: 'level', delta: 2 } }])
    expect(ops('Kael level up', ctx(undefined, { macros: [own, levelUp] }))).toHaveLength(3)
  })

  it('reports an error inside a macro', () => {
    const bad = macro('oops', 'fill Sanity')
    const r = parseQuickEntry('Kael oops', ctx(undefined, { macros: [bad] }))
    expect(r.clauses[0].error).toMatch(/oops/)
  })

  it('does not loop on self-referencing macros', () => {
    const loop = macro('spin', 'spin')
    const r = parseQuickEntry('Kael spin', ctx(undefined, { macros: [loop] }))
    expect(r.ok).toBe(false)
  })
})

describe('quick entry — catalog completions', () => {
  it('completes catalog item names nobody owns yet', () => {
    const c = quickEntryCompletions('Kael +Lan', 9, ctx())
    expect(c?.options).toContain('Lantern')
  })

  it('completes macro names', () => {
    const c = quickEntryCompletions('Kael lev', 8, ctx(undefined, { macros: [macro('level up', '+1 Level')] }))
    expect(c?.options).toContain('level up')
  })
})
