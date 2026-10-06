import type { WeaponItem, ArmorItem, ConsumableItem, Item, ItemCategory } from '../types'

export const WEAPONS: WeaponItem[] = [
  {
    id: 'wooden-pencil',
    name: 'Wooden Pencil',
    description: 'A humble writing tool. Standard coin rewards.',
    category: 'weapon',
    rarity: 'common',
    price: 0,
    icon: '✏️',
    wordMultiplier: 1.0,
  },
  {
    id: 'enchanted-quill',
    name: 'Enchanted Quill',
    description: 'Imbued with minor magic. Quests pay a little more.',
    category: 'weapon',
    rarity: 'uncommon',
    price: 200,
    icon: '🪶',
    wordMultiplier: 1.15,
  },
  {
    id: 'phoenix-feather-pen',
    name: 'Phoenix Feather Pen',
    description: 'Burns with creative fire. Quests pay a quarter more.',
    category: 'weapon',
    rarity: 'rare',
    price: 500,
    icon: '🔥',
    wordMultiplier: 1.25,
  },
  {
    id: 'dragons-pen',
    name: "Dragon's Pen",
    description: 'Forged in dragonfire. Quests pay half again as much.',
    category: 'weapon',
    rarity: 'epic',
    price: 1500,
    icon: '🐉',
    wordMultiplier: 1.5,
  },
  {
    id: 'celestial-stylus',
    name: 'Celestial Stylus',
    description: 'Crafted from starlight. Quests pay double.',
    category: 'weapon',
    rarity: 'legendary',
    price: 5000,
    icon: '✨',
    wordMultiplier: 2.0,
  },
]

export const ARMORS: ArmorItem[] = [
  {
    id: 'cloth-tunic',
    name: 'Cloth Tunic',
    description: 'Basic protection. No time bonus.',
    category: 'armor',
    rarity: 'common',
    price: 0,
    icon: '👕',
    timeBonus: 0,
  },
  {
    id: 'leather-vest',
    name: 'Leather Vest',
    description: 'Sturdy leather. Grants 10% extra time.',
    category: 'armor',
    rarity: 'uncommon',
    price: 200,
    icon: '🦺',
    timeBonus: 0.10,
  },
  {
    id: 'chain-mail',
    name: 'Chain Mail',
    description: 'Linked steel. Grants 15% extra time.',
    category: 'armor',
    rarity: 'rare',
    price: 500,
    icon: '⛓️',
    timeBonus: 0.15,
  },
  {
    id: 'time-shield',
    name: 'Time Shield',
    description: 'Bends time itself. Grants 25% extra time.',
    category: 'armor',
    rarity: 'epic',
    price: 1500,
    icon: '🛡️',
    timeBonus: 0.25,
  },
  {
    id: 'chrono-plate',
    name: 'Chrono Plate',
    description: 'Master of time. Grants 40% extra time.',
    category: 'armor',
    rarity: 'legendary',
    price: 5000,
    icon: '⏳',
    timeBonus: 0.40,
  },
]

export const CONSUMABLES: ConsumableItem[] = [
  {
    id: 'time-freeze',
    name: 'Time Freeze',
    description: 'Pauses the quest timer for 2 minutes.',
    category: 'consumable',
    rarity: 'uncommon',
    price: 150,
    icon: '❄️',
    effect: 'pause',
    effectValue: 120,
  },
  {
    id: 'word-burst',
    name: 'Word Burst',
    description: 'Your next 50 words earn double coins.',
    category: 'consumable',
    rarity: 'uncommon',
    price: 100,
    icon: '💥',
    effect: 'double-words',
    effectValue: 50,
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    description: 'Adds 5 extra minutes to the quest timer.',
    category: 'consumable',
    rarity: 'rare',
    price: 300,
    icon: '🌬️',
    effect: 'extend-time',
    effectValue: 300,
  },
  {
    id: 'streak-freeze',
    name: 'Streak Freeze',
    description: 'Keeps your writing streak alive through a missed day. Used automatically.',
    category: 'consumable',
    rarity: 'rare',
    price: 150,
    icon: '🧊',
    effect: 'streak-freeze',
    effectValue: 1,
  },
]

/** Consumables that work on their own (never "used" from a quest card). */
export function isPassiveConsumable(item: ConsumableItem): boolean {
  return item.effect === 'streak-freeze'
}

export const ALL_ITEMS: Item[] = [...WEAPONS, ...ARMORS, ...CONSUMABLES]

export function getItemById(id: string): Item | undefined {
  return ALL_ITEMS.find((item) => item.id === id)
}

export function getItemsByCategory(category: ItemCategory): Item[] {
  return ALL_ITEMS.filter((item) => item.category === category)
}

/** Coin multiplier of a weapon. Gear raises coin rewards only, never word progress. */
export function getWeaponMultiplier(weaponId: string): number {
  const weapon = WEAPONS.find((w) => w.id === weaponId)
  return weapon?.wordMultiplier ?? 1.0
}

export function getArmorTimeBonus(armorId: string): number {
  const armor = ARMORS.find((a) => a.id === armorId)
  return armor?.timeBonus ?? 0
}
