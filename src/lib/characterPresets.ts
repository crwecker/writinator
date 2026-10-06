import type { Character, StatDefinition, StatListItem, StatValue } from '../types'

export type CharacterPresetId = 'fighter' | 'mage' | 'rogue' | 'minimal' | 'blank'

export interface CharacterPresetInfo {
  id: CharacterPresetId
  label: string
  description: string
}

export const CHARACTER_PRESETS: CharacterPresetInfo[] = [
  { id: 'fighter', label: 'LitRPG Fighter', description: 'HP, stamina, STR-heavy attributes, weapon/shield/armor slots' },
  { id: 'mage', label: 'LitRPG Mage', description: 'Low HP, deep MP pool, starting spells' },
  { id: 'rogue', label: 'LitRPG Rogue', description: 'DEX-heavy, stamina, stealth skills, throwing knives' },
  { id: 'minimal', label: 'Minimal', description: 'Just HP, Level and Inventory' },
  { id: 'blank', label: 'Blank', description: 'No stats — build your own' },
]

const ATTRIBUTE_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

const hpMax = (n: number): StatValue => ({ kind: 'numberWithMax', value: n, max: n })
const inv = (...items: Array<[string, number]>): StatValue => ({
  kind: 'inventory',
  items: items.map(([name, qty]) => ({ name, fields: { qty } })),
})
const spell = (name: string, level: number, mana: number): StatListItem => ({ name, fields: { level, mana } })
const skill = (name: string, level = 1): StatListItem => ({ name, fields: { level } })
const attrs = (...values: number[]): StatValue => ({
  kind: 'attributeSet',
  values: Object.fromEntries(ATTRIBUTE_KEYS.map((k, i) => [k, values[i] ?? 10])),
})

interface Template {
  stats: StatDefinition[]
  baseValues: Record<string, StatValue>
  equipmentSlots: string[]
}

function adventurer(opts: {
  hp: number
  resource: { id: string; name: string; max: number }
  className: string
  attributes: number[]
  inventory: Array<[string, number]>
  abilities: { kind: 'spellList' | 'skillList'; items: StatListItem[] }
  slots: string[]
}): Template {
  const abilityId = opts.abilities.kind === 'spellList' ? 'spells' : 'skills'
  const stats: StatDefinition[] = [
    { id: 'hp', name: 'HP', type: 'numberWithMax' },
    { id: opts.resource.id, name: opts.resource.name, type: 'numberWithMax' },
    { id: 'level', name: 'Level', type: 'number' },
    { id: 'xp', name: 'XP', type: 'number' },
    { id: 'gold', name: 'Gold', type: 'number' },
    { id: 'class', name: 'Class', type: 'text' },
    { id: 'attributes', name: 'Attributes', type: 'attributeSet', attributeKeys: [...ATTRIBUTE_KEYS] },
    { id: 'status_effects', name: 'Status Effects', type: 'list' },
    { id: 'inventory', name: 'Inventory', type: 'inventory' },
    opts.abilities.kind === 'spellList'
      ? { id: abilityId, name: 'Spells', type: 'spellList', manaStatId: opts.resource.id }
      : { id: abilityId, name: 'Skills', type: 'skillList' },
  ]
  return {
    stats,
    baseValues: {
      hp: hpMax(opts.hp),
      [opts.resource.id]: hpMax(opts.resource.max),
      level: { kind: 'number', value: 1 },
      xp: { kind: 'number', value: 0 },
      gold: { kind: 'number', value: 10 },
      class: { kind: 'text', value: opts.className },
      attributes: attrs(...opts.attributes),
      status_effects: { kind: 'list', items: [] },
      inventory: inv(...opts.inventory),
      [abilityId]: { kind: opts.abilities.kind, items: opts.abilities.items },
    },
    equipmentSlots: opts.slots,
  }
}

function template(preset: CharacterPresetId): Template {
  switch (preset) {
    case 'fighter':
      return adventurer({
        hp: 50,
        resource: { id: 'sp', name: 'Stamina', max: 30 },
        className: 'Fighter',
        attributes: [15, 12, 14, 8, 10, 10],
        inventory: [['Healing Potion', 2], ['Rations', 3], ['Whetstone', 1]],
        abilities: { kind: 'skillList', items: [skill('Power Strike'), skill('Shield Bash')] },
        slots: ['Weapon', 'Off-hand', 'Armor', 'Accessory'],
      })
    case 'mage':
      return adventurer({
        hp: 30,
        resource: { id: 'mp', name: 'MP', max: 60 },
        className: 'Mage',
        attributes: [8, 11, 10, 16, 13, 11],
        inventory: [['Mana Potion', 3], ['Spellbook', 1]],
        abilities: { kind: 'spellList', items: [spell('Firebolt', 1, 5), spell('Mana Shield', 1, 10)] },
        slots: ['Staff', 'Robe', 'Accessory'],
      })
    case 'rogue':
      return adventurer({
        hp: 38,
        resource: { id: 'sp', name: 'Stamina', max: 35 },
        className: 'Rogue',
        attributes: [10, 16, 12, 12, 10, 12],
        inventory: [['Throwing Knife', 6], ['Lockpicks', 1], ['Smoke Bomb', 2]],
        abilities: { kind: 'skillList', items: [skill('Stealth'), skill('Lockpicking'), skill('Backstab')] },
        slots: ['Main Hand', 'Off-hand', 'Armor', 'Accessory'],
      })
    case 'minimal':
      return {
        stats: [
          { id: 'hp', name: 'HP', type: 'numberWithMax' },
          { id: 'level', name: 'Level', type: 'number' },
          { id: 'inventory', name: 'Inventory', type: 'inventory' },
        ],
        baseValues: { hp: hpMax(10), level: { kind: 'number', value: 1 }, inventory: inv() },
        equipmentSlots: [],
      }
    case 'blank':
      return { stats: [], baseValues: {}, equipmentSlots: [] }
  }
}

/** A new character built from a preset (fresh id, timestamps, deep-copied values). */
export function createCharacterFromPreset(preset: CharacterPresetId, name: string, color: string): Character {
  const t = template(preset)
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    color,
    stats: structuredClone(t.stats),
    baseValues: structuredClone(t.baseValues),
    equipmentSlots: [...t.equipmentSlots],
    createdAt: now,
    updatedAt: now,
  }
}
