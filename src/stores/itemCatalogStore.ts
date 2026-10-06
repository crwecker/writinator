import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import type {
  CatalogItem,
  CatalogModifier,
  CurrencyConfig,
  CurrencyDenomination,
  ItemCatalogFileData,
  ItemRarity,
  QuickMacro,
} from '../types'
import { DEFAULT_CURRENCY, collectUsedItemNames } from '../lib/itemCatalog'
// Runtime-only use (inside functions): keeps module init free of store cycles.
import { useCharacterStore } from './characterStore'

// ---------------------------------------------------------------------------
// Book-level item catalog, quick-entry macros and currency. Saved in the book
// file as the optional `itemCatalog` section; a file without one starts empty
// (the catalog rebuilds itself from the items in use).
// ---------------------------------------------------------------------------

interface ItemCatalogState {
  items: CatalogItem[]
  macros: QuickMacro[]
  currency: CurrencyConfig
  hasHydrated: boolean

  /** Add an item (or return the existing one's id, matched case-insensitively). */
  addItem: (name: string, details?: Partial<Omit<CatalogItem, 'id' | 'name'>>) => string
  updateItem: (id: string, patch: Partial<Omit<CatalogItem, 'id'>>) => void
  removeItem: (id: string) => void
  /** Add bare entries for names not yet in the catalog. */
  ensureItems: (names: string[]) => void

  addMacro: (macro: Omit<QuickMacro, 'id'>) => string
  updateMacro: (id: string, patch: Partial<Omit<QuickMacro, 'id'>>) => void
  removeMacro: (id: string) => void

  setCurrency: (currency: CurrencyConfig) => void

  loadFromFile: (data: ItemCatalogFileData | undefined) => void
  reset: () => void
}

const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

function cleanModifier(raw: unknown): CatalogModifier | null {
  if (!isRecord(raw)) return null
  const stat = str(raw.stat)
  const amount = num(raw.amount)
  if (!stat || amount === undefined) return null
  return { stat, amount, ...(raw.max === true ? { max: true } : {}) }
}

function cleanItem(raw: unknown): CatalogItem | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const name = str(raw.name)
  if (!id || !name) return null
  const out: CatalogItem = { id, name }
  const description = str(raw.description)
  if (description) out.description = description
  if (typeof raw.rarity === 'string' && RARITIES.includes(raw.rarity as ItemRarity)) out.rarity = raw.rarity as ItemRarity
  const value = num(raw.value)
  if (value !== undefined) out.value = value
  const weight = num(raw.weight)
  if (weight !== undefined) out.weight = weight
  const category = str(raw.category)
  if (category) out.category = category
  const slot = str(raw.slot)
  if (slot) out.slot = slot
  if (Array.isArray(raw.modifiers)) {
    const mods = raw.modifiers.map(cleanModifier).filter((m): m is CatalogModifier => m !== null)
    if (mods.length > 0) out.modifiers = mods
  }
  return out
}

function cleanMacro(raw: unknown): QuickMacro | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const name = str(raw.name)
  if (!id || !name || typeof raw.body !== 'string') return null
  return { id, name, body: raw.body, ...(str(raw.characterId) ? { characterId: raw.characterId as string } : {}) }
}

function cleanCurrency(raw: unknown): CurrencyConfig {
  if (!isRecord(raw) || !Array.isArray(raw.denominations)) return DEFAULT_CURRENCY
  const denominations = raw.denominations
    .map((d): CurrencyDenomination | null => {
      if (!isRecord(d)) return null
      const value = num(d.value)
      if (value === undefined || value <= 0) return null
      const name = typeof d.name === 'string' ? d.name : ''
      const abbr = typeof d.abbr === 'string' ? d.abbr : ''
      if (!name.trim() && !abbr.trim()) return null
      return { name, abbr, value }
    })
    .filter((d): d is CurrencyDenomination => d !== null)
  return denominations.length > 0 ? { denominations } : DEFAULT_CURRENCY
}

/** Sanitized catalog data from a (possibly hand-edited or partial) file section. */
export function cleanItemCatalogData(data: unknown): Pick<ItemCatalogState, 'items' | 'macros' | 'currency'> {
  if (!isRecord(data)) return { items: [], macros: [], currency: DEFAULT_CURRENCY }
  const items = Array.isArray(data.items) ? data.items.map(cleanItem).filter((i): i is CatalogItem => i !== null) : []
  const macros = Array.isArray(data.macros) ? data.macros.map(cleanMacro).filter((m): m is QuickMacro => m !== null) : []
  return { items, macros, currency: cleanCurrency(data.currency) }
}

const localforageStorage = localforageJSONStorage<ItemCatalogState>()

export const useItemCatalogStore = create<ItemCatalogState>()(
  persist(
    (set, get) => ({
      items: [],
      macros: [],
      currency: DEFAULT_CURRENCY,
      hasHydrated: false,

      addItem: (name, details) => {
        const trimmed = name.trim()
        const existing = get().items.find((i) => i.name.toLowerCase() === trimmed.toLowerCase())
        if (existing) return existing.id
        const item: CatalogItem = { id: crypto.randomUUID(), name: trimmed, ...details }
        set((s) => ({ items: [...s.items, item] }))
        return item.id
      },

      updateItem: (id, patch) => {
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
      },

      removeItem: (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
      },

      ensureItems: (names) => {
        const known = new Set(get().items.map((i) => i.name.toLowerCase()))
        const added: CatalogItem[] = []
        for (const raw of names) {
          const name = raw.trim()
          if (!name || known.has(name.toLowerCase())) continue
          known.add(name.toLowerCase())
          added.push({ id: crypto.randomUUID(), name })
        }
        if (added.length > 0) set((s) => ({ items: [...s.items, ...added] }))
      },

      addMacro: (macro) => {
        const m: QuickMacro = { id: crypto.randomUUID(), ...macro }
        set((s) => ({ macros: [...s.macros, m] }))
        return m.id
      },

      updateMacro: (id, patch) => {
        set((s) => ({ macros: s.macros.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
      },

      removeMacro: (id) => {
        set((s) => ({ macros: s.macros.filter((m) => m.id !== id) }))
      },

      setCurrency: (currency) => set({ currency }),

      loadFromFile: (data) => set(cleanItemCatalogData(data)),

      reset: () => set({ items: [], macros: [], currency: DEFAULT_CURRENCY }),
    }),
    {
      name: 'writinator-item-catalog',
      version: 1,
      storage: localforageStorage,
      partialize: (state) =>
        ({
          items: state.items,
          macros: state.macros,
          currency: state.currency,
        }) as unknown as ItemCatalogState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error('[itemCatalogStore] rehydration error:', error)
        useItemCatalogStore.setState({ hasHydrated: true })
      },
    },
  ),
)

/** Add every item in use (base values, markers, equips) to the catalog. */
export function syncCatalogWithUsage(): void {
  const { characters, markers } = useCharacterStore.getState()
  useItemCatalogStore.getState().ensureItems(collectUsedItemNames(characters, markers))
}

/** File section writer — also catches items used since the last sync. */
export function serializeItemCatalog(): ItemCatalogFileData {
  syncCatalogWithUsage()
  const { items, macros, currency } = useItemCatalogStore.getState()
  return { items, macros, currency }
}

/** File section reader. A file without a catalog starts this book's catalog empty. */
export function hydrateItemCatalog(data: ItemCatalogFileData | undefined): void {
  useItemCatalogStore.getState().loadFromFile(data)
}
