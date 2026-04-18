import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { PlayerFileData, PlayerStats } from '../types'
import { getItemById } from '../lib/items'

interface PlayerState {
  coins: number
  ownedItems: string[]
  equippedWeapon: string
  equippedArmor: string
  consumableInventory: Record<string, number>
  questStats: PlayerStats
  retroactiveGrantApplied: boolean

  addCoins: (amount: number) => void
  spendCoins: (amount: number) => boolean
  purchaseItem: (itemId: string) => boolean
  equipItem: (itemId: string, slot: 'weapon' | 'armor') => void
  unequipItem: (slot: 'weapon' | 'armor') => void
  useConsumable: (itemId: string) => boolean
  addQuestStats: (completed: number, words: number, coinsEarned: number) => void
  setRetroactiveGrantApplied: () => void
}

const localforageStorage = createJSONStorage<PlayerState>(() => ({
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

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      coins: 0,
      ownedItems: ['wooden-pencil', 'cloth-tunic'],
      equippedWeapon: 'wooden-pencil',
      equippedArmor: 'cloth-tunic',
      consumableInventory: {},
      questStats: { totalCompleted: 0, totalWords: 0, totalCoins: 0 },
      retroactiveGrantApplied: false,

      addCoins: (amount: number) => {
        set((state) => ({ coins: state.coins + amount }))
      },

      spendCoins: (amount: number) => {
        const { coins } = get()
        if (coins < amount) return false
        set((state) => ({ coins: state.coins - amount }))
        return true
      },

      purchaseItem: (itemId: string) => {
        const { coins, ownedItems } = get()
        const item = getItemById(itemId)
        if (!item) return false
        if (coins < item.price) return false

        if (item.category === 'consumable') {
          set((state) => ({
            coins: state.coins - item.price,
            consumableInventory: {
              ...state.consumableInventory,
              [itemId]: (state.consumableInventory[itemId] ?? 0) + 1,
            },
          }))
          return true
        }

        // weapon or armor — cannot purchase if already owned
        if (ownedItems.includes(itemId)) return false

        set((state) => ({
          coins: state.coins - item.price,
          ownedItems: [...state.ownedItems, itemId],
        }))
        return true
      },

      equipItem: (itemId: string, slot: 'weapon' | 'armor') => {
        const { ownedItems } = get()
        if (!ownedItems.includes(itemId)) return
        if (slot === 'weapon') {
          set({ equippedWeapon: itemId })
        } else {
          set({ equippedArmor: itemId })
        }
      },

      unequipItem: (slot: 'weapon' | 'armor') => {
        if (slot === 'weapon') {
          set({ equippedWeapon: 'wooden-pencil' })
        } else {
          set({ equippedArmor: 'cloth-tunic' })
        }
      },

      useConsumable: (itemId: string) => {
        const { consumableInventory } = get()
        const count = consumableInventory[itemId] ?? 0
        if (count <= 0) return false
        set((state) => ({
          consumableInventory: {
            ...state.consumableInventory,
            [itemId]: count - 1,
          },
        }))
        return true
      },

      addQuestStats: (completed: number, words: number, coinsEarned: number) => {
        set((state) => ({
          questStats: {
            totalCompleted: state.questStats.totalCompleted + completed,
            totalWords: state.questStats.totalWords + words,
            totalCoins: state.questStats.totalCoins + coinsEarned,
          },
        }))
      },

      setRetroactiveGrantApplied: () => {
        set({ retroactiveGrantApplied: true })
      },
    }),
    {
      name: 'writinator-player',
      version: 1,
      storage: localforageStorage,
      partialize: (state) =>
        ({
          coins: state.coins,
          ownedItems: state.ownedItems,
          equippedWeapon: state.equippedWeapon,
          equippedArmor: state.equippedArmor,
          consumableInventory: state.consumableInventory,
          questStats: state.questStats,
          retroactiveGrantApplied: state.retroactiveGrantApplied,
        }) as unknown as PlayerState,
    }
  )
)

// ---------------------------------------------------------------------------
// File serialization helpers — used by fileSystem.ts section registry
// ---------------------------------------------------------------------------

export function serializePlayer(): PlayerFileData {
  const { coins, ownedItems, equippedWeapon, equippedArmor, consumableInventory, questStats, retroactiveGrantApplied } =
    usePlayerStore.getState()
  return { coins, ownedItems, equippedWeapon, equippedArmor, consumableInventory, questStats, retroactiveGrantApplied }
}

export function hydratePlayer(data: PlayerFileData | undefined): void {
  if (data === undefined) return
  usePlayerStore.setState({
    coins: data.coins,
    ownedItems: data.ownedItems,
    equippedWeapon: data.equippedWeapon,
    equippedArmor: data.equippedArmor,
    consumableInventory: data.consumableInventory,
    questStats: data.questStats,
    retroactiveGrantApplied: data.retroactiveGrantApplied,
  })
}
