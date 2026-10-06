import { describe, it, expect } from 'vitest'
import { renderThemedStatblockText, STATBLOCK_THEMES } from './statblockThemes'
import { processCharacterMarkers, renderStatblockText } from './export'
import { computeStateAt } from './characterState'
import { makeBook, makeStorylet } from '../test/fixtures'
import { makeHero, item } from '../test/characterFixtures'
import type { CharacterState } from '../types'

const kael = makeHero('kael', { hp: [25, 40], inventory: [item('Rope')] })
const state: CharacterState = {
  base: kael.baseValues,
  equipped: { Weapon: { itemId: 's', itemName: 'Iron Sword', modifiers: [] } },
  activeBuffs: [],
}
const fields = ['hp', 'level', 'inventory']

describe('statblock themes', () => {
  it('lists the three looks', () => {
    expect(STATBLOCK_THEMES.map((t) => t.id)).toEqual(['classic', 'system', 'minimal'])
  })

  it('minimal is one line in every format', () => {
    expect(renderThemedStatblockText(kael, state, kael.baseValues, fields, 'plain', 'minimal')).toBe(
      'Kael — HP 25/40 · Level 1 · Inventory Rope',
    )
    expect(renderThemedStatblockText(kael, state, kael.baseValues, fields, 'markdown', 'minimal')).toBe(
      '*Kael — HP 25/40 · Level 1 · Inventory Rope*',
    )
    const html = renderThemedStatblockText(kael, state, kael.baseValues, fields, 'html', 'minimal')
    expect(html).toMatch(/^<p class="writinator-statblock writinator-statblock-minimal"[^>]*>Kael — HP 25\/40 · Level 1 · Inventory Rope<\/p>$/)
  })

  it('system reads like a LitRPG window', () => {
    expect(renderThemedStatblockText(kael, state, kael.baseValues, fields, 'plain', 'system')).toBe(
      ['[ STATUS — Kael ]', 'HP: 25/40', 'Level: 1', 'Inventory: Rope', 'Equipped: Weapon: Iron Sword'].join('\n'),
    )
    const md = renderThemedStatblockText(kael, state, kael.baseValues, fields, 'markdown', 'system')
    expect(md.split('\n')[0]).toBe('```')
    expect(md).toContain('[ STATUS — Kael ]')
    const html = renderThemedStatblockText(kael, state, kael.baseValues, fields, 'html', 'system')
    expect(html).toContain('writinator-statblock-system')
    expect(html).toContain('STATUS — Kael')
  })

  it('escapes HTML in names', () => {
    const evil = { ...kael, name: '<b>Kael</b>' }
    const html = renderThemedStatblockText(evil, state, kael.baseValues, fields, 'html', 'minimal')
    expect(html).toContain('&lt;b&gt;Kael&lt;/b&gt;')
  })

  it('renderStatblockText keeps the classic look by default and switches by theme', () => {
    const classic = renderStatblockText(kael, state, kael.baseValues, fields, 'plain')
    expect(classic.startsWith('> **Kael — Status**')).toBe(true)
    expect(renderStatblockText(kael, state, kael.baseValues, fields, 'plain', 'minimal')).toBe(
      'Kael — HP 25/40 · Level 1 · Inventory Rope',
    )
  })

  it('exports use the book’s theme from the marker context', () => {
    const book = makeBook([makeStorylet('c1', 'Before <!-- statblock:kael:fields=hp --> after')])
    const out = processCharacterMarkers(
      book.storylets[0].content!,
      { book, storyletId: 'c1', characters: [kael], markers: {}, snippets: undefined, statblockTheme: 'minimal' },
      'plain',
    )
    expect(out).toContain('Kael — HP 25/40')
    expect(computeStateAt(kael, book, {}).effective.hp).toEqual({ kind: 'numberWithMax', value: 25, max: 40 })
  })
})
