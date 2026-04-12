import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type {
  Character,
  StatDefinition,
  StatValue,
  StatDelta,
} from '../types'

interface CharacterState {
  characters: Character[]
  /**
   * Markers keyed by marker UUID (matching `<!-- stat:uuid -->`).
   * Value is the list of deltas attached to the marker (compound supported).
   */
  markers: Record<string, StatDelta[]>
  hasHydrated: boolean

  // Character CRUD
  addCharacter: (character: Character) => void
  createCharacter: (name: string, color?: string) => string
  updateCharacter: (id: string, patch: Partial<Omit<Character, 'id' | 'createdAt'>>) => void
  removeCharacter: (id: string) => void

  // Base-value editing
  setBaseValue: (characterId: string, statId: string, value: StatValue) => void

  // Stat-definition management
  addStat: (characterId: string, stat: StatDefinition, defaultValue: StatValue) => void
  removeStat: (characterId: string, statId: string) => void
  updateStat: (characterId: string, statId: string, patch: Partial<Omit<StatDefinition, 'id'>>) => void
  reorderStats: (characterId: string, statIds: string[]) => void

  // Equipment slot management
  setEquipmentSlots: (characterId: string, slots: string[]) => void

  // Marker CRUD
  setMarker: (markerId: string, deltas: StatDelta[]) => void
  updateMarker: (markerId: string, deltas: StatDelta[]) => void
  removeMarker: (markerId: string) => void
  clearMarkers: () => void

  // Bulk load (for file load)
  loadFromFile: (characters: Character[], markers: Record<string, StatDelta[]>) => void
  reset: () => void
}

function generateId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

// Palette for assigning default character colors round-robin
const DEFAULT_COLORS = [
  '#f87171', // red-400
  '#fb923c', // orange-400
  '#facc15', // yellow-400
  '#4ade80', // green-400
  '#22d3ee', // cyan-400
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
]

export const DEFAULT_RANK_TIERS = ['F', 'E', 'D', 'C', 'B', 'A', 'S']

export const DEFAULT_ATTRIBUTE_KEYS = [
  'STR',
  'DEX',
  'CON',
  'INT',
  'WIS',
  'CHA',
  'LUCK',
]

/**
 * Build a fully-populated default Character with the baseline stat template.
 * Stats: HP, MP, Level, XP, Gold, Class, Status Effects, Inventory, Spells, Skills, Attributes.
 * Equipment slots: Weapon, Armor, Accessory.
 */
export function createDefaultCharacter(name: string, color?: string): Character {
  const stats: StatDefinition[] = [
    { id: 'hp', name: 'HP', type: 'numberWithMax' },
    { id: 'mp', name: 'MP', type: 'numberWithMax' },
    { id: 'level', name: 'Level', type: 'number' },
    { id: 'xp', name: 'XP', type: 'number' },
    { id: 'gold', name: 'Gold', type: 'number' },
    { id: 'class', name: 'Class', type: 'text' },
    { id: 'status_effects', name: 'Status Effects', type: 'list' },
    { id: 'inventory', name: 'Inventory', type: 'list' },
    { id: 'spells', name: 'Spells', type: 'list' },
    { id: 'skills', name: 'Skills', type: 'list' },
    {
      id: 'attributes',
      name: 'Attributes',
      type: 'attributeSet',
      attributeKeys: [...DEFAULT_ATTRIBUTE_KEYS],
    },
  ]

  const baseValues: Record<string, StatValue> = {
    hp: { kind: 'numberWithMax', value: 10, max: 10 },
    mp: { kind: 'numberWithMax', value: 10, max: 10 },
    level: { kind: 'number', value: 1 },
    xp: { kind: 'number', value: 0 },
    gold: { kind: 'number', value: 0 },
    class: { kind: 'text', value: '' },
    status_effects: { kind: 'list', items: [] },
    inventory: { kind: 'list', items: [] },
    spells: { kind: 'list', items: [] },
    skills: { kind: 'list', items: [] },
    attributes: {
      kind: 'attributeSet',
      values: Object.fromEntries(DEFAULT_ATTRIBUTE_KEYS.map((k) => [k, 10])),
    },
  }

  const timestamp = nowIso()
  return {
    id: generateId(),
    name,
    color: color ?? DEFAULT_COLORS[0],
    stats,
    baseValues,
    equipmentSlots: ['Weapon', 'Armor', 'Accessory'],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const localforageStorage = createJSONStorage<CharacterState>(() => ({
  getItem: async (name: string) => {
    const value = await localforage.getItem<string>(name)
    return value
  },
  setItem: async (name: string, value: string) => {
    await localforage.setItem(name, value)
  },
  removeItem: async (name: string) => {
    await localforage.removeItem(name)
  },
}))

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      characters: [],
      markers: {},
      hasHydrated: false,

      addCharacter: (character: Character) => {
        set((state) => ({ characters: [...state.characters, character] }))
      },

      createCharacter: (name: string, color?: string) => {
        const existing = get().characters.length
        const assignedColor = color ?? DEFAULT_COLORS[existing % DEFAULT_COLORS.length]
        const character = createDefaultCharacter(name, assignedColor)
        set((state) => ({ characters: [...state.characters, character] }))
        return character.id
      },

      updateCharacter: (id, patch) => {
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c
          ),
        }))
      },

      removeCharacter: (id: string) => {
        set((state) => ({
          characters: state.characters.filter((c) => c.id !== id),
          // Drop markers whose deltas all belonged to this character
          markers: Object.fromEntries(
            Object.entries(state.markers)
              .map(([mid, deltas]) => [mid, deltas.filter((d) => d.characterId !== id)] as const)
              .filter(([, deltas]) => deltas.length > 0)
          ),
        }))
      },

      setBaseValue: (characterId, statId, value) => {
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === characterId
              ? {
                  ...c,
                  baseValues: { ...c.baseValues, [statId]: value },
                  updatedAt: nowIso(),
                }
              : c
          ),
        }))
      },

      addStat: (characterId, stat, defaultValue) => {
        set((state) => ({
          characters: state.characters.map((c) => {
            if (c.id !== characterId) return c
            if (c.stats.some((s) => s.id === stat.id)) return c
            return {
              ...c,
              stats: [...c.stats, stat],
              baseValues: { ...c.baseValues, [stat.id]: defaultValue },
              updatedAt: nowIso(),
            }
          }),
        }))
      },

      removeStat: (characterId, statId) => {
        set((state) => ({
          characters: state.characters.map((c) => {
            if (c.id !== characterId) return c
            const nextValues = { ...c.baseValues }
            delete nextValues[statId]
            return {
              ...c,
              stats: c.stats.filter((s) => s.id !== statId),
              baseValues: nextValues,
              updatedAt: nowIso(),
            }
          }),
        }))
      },

      updateStat: (characterId, statId, patch) => {
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === characterId
              ? {
                  ...c,
                  stats: c.stats.map((s) =>
                    s.id === statId ? { ...s, ...patch } : s
                  ),
                  updatedAt: nowIso(),
                }
              : c
          ),
        }))
      },

      reorderStats: (characterId, statIds) => {
        set((state) => ({
          characters: state.characters.map((c) => {
            if (c.id !== characterId) return c
            const byId = new Map(c.stats.map((s) => [s.id, s]))
            const reordered = statIds
              .map((id) => byId.get(id))
              .filter((s): s is StatDefinition => s !== undefined)
            // Preserve any stats not listed (defensive)
            const missing = c.stats.filter((s) => !statIds.includes(s.id))
            return {
              ...c,
              stats: [...reordered, ...missing],
              updatedAt: nowIso(),
            }
          }),
        }))
      },

      setEquipmentSlots: (characterId, slots) => {
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === characterId
              ? { ...c, equipmentSlots: slots, updatedAt: nowIso() }
              : c
          ),
        }))
      },

      setMarker: (markerId, deltas) => {
        set((state) => ({
          markers: { ...state.markers, [markerId]: deltas },
        }))
      },

      updateMarker: (markerId, deltas) => {
        set((state) => ({
          markers: { ...state.markers, [markerId]: deltas },
        }))
      },

      removeMarker: (markerId) => {
        set((state) => {
          const next = { ...state.markers }
          delete next[markerId]
          return { markers: next }
        })
      },

      clearMarkers: () => {
        set({ markers: {} })
      },

      loadFromFile: (characters, markers) => {
        set({ characters, markers })
      },

      reset: () => {
        set({ characters: [], markers: {} })
      },
    }),
    {
      name: 'writinator-characters',
      version: 1,
      storage: localforageStorage,
      partialize: (state) =>
        ({
          characters: state.characters,
          markers: state.markers,
        }) as unknown as CharacterState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[characterStore] rehydration error:', error)
        }
        useCharacterStore.setState({ hasHydrated: true })
      },
    }
  )
)
