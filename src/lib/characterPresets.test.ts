import { describe, it, expect } from 'vitest'
import { CHARACTER_PRESETS, createCharacterFromPreset } from './characterPresets'
import { resolveStatblockDefinitions } from './markerUtils'

describe('character presets', () => {
  it('offers Fighter, Mage, Rogue, Minimal and Blank', () => {
    expect(CHARACTER_PRESETS.map((p) => p.label)).toEqual(['LitRPG Fighter', 'LitRPG Mage', 'LitRPG Rogue', 'Minimal', 'Blank'])
  })

  it('gives every stat a base value of the matching kind', () => {
    for (const p of CHARACTER_PRESETS) {
      const c = createCharacterFromPreset(p.id, 'Kael', '#f87171')
      expect(c.name).toBe('Kael')
      expect(c.color).toBe('#f87171')
      expect(c.id).not.toBe('')
      for (const s of c.stats) expect(c.baseValues[s.id]?.kind).toBe(s.type)
      expect(Object.keys(c.baseValues).sort()).toEqual(c.stats.map((s) => s.id).sort())
    }
  })

  it('Minimal tracks HP, Level and Inventory only', () => {
    const c = createCharacterFromPreset('minimal', 'A', '#fff')
    expect(c.stats.map((s) => s.name)).toEqual(['HP', 'Level', 'Inventory'])
    expect(c.equipmentSlots).toEqual([])
  })

  it('Blank has nothing', () => {
    const c = createCharacterFromPreset('blank', 'A', '#fff')
    expect(c.stats).toEqual([])
    expect(c.equipmentSlots).toEqual([])
  })

  it('Mage leans on MP and spells; the Fighter on STR and slots', () => {
    const mage = createCharacterFromPreset('mage', 'M', '#fff')
    expect(mage.baseValues.mp).toEqual({ kind: 'numberWithMax', value: 60, max: 60 })
    expect(mage.stats.find((s) => s.id === 'spells')?.manaStatId).toBe('mp')
    const spells = mage.baseValues.spells
    expect(spells.kind === 'spellList' && spells.items.length).toBeGreaterThan(0)
    const fighter = createCharacterFromPreset('fighter', 'F', '#fff')
    const attrs = fighter.baseValues.attributes
    expect(attrs.kind === 'attributeSet' && attrs.values.STR).toBe(15)
    expect(fighter.equipmentSlots).toContain('Weapon')
  })

  it('uses the stat ids status blocks look for by default', () => {
    const c = createCharacterFromPreset('rogue', 'R', '#fff')
    expect(resolveStatblockDefinitions(c, undefined).map((s) => s.id)).toEqual(['hp', 'level', 'xp', 'attributes'])
  })
})
