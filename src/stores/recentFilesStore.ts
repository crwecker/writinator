import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { RecentFile } from '../types'

interface RecentFilesState {
  recentFiles: RecentFile[]
  addRecent: (file: RecentFile) => void
  removeRecent: (name: string) => void
  clearRecents: () => void
}

const localforageStorage = createJSONStorage<RecentFilesState>(() => ({
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

export const useRecentFilesStore = create<RecentFilesState>()(
  persist(
    (set, get) => ({
      recentFiles: [],

      addRecent: (file: RecentFile) => {
        const filtered = get().recentFiles.filter((f) => f.name !== file.name)
        const updated = [file, ...filtered]
          .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
          .slice(0, 10)
        set({ recentFiles: updated })
      },

      removeRecent: (name: string) => {
        set({ recentFiles: get().recentFiles.filter((f) => f.name !== name) })
      },

      clearRecents: () => {
        set({ recentFiles: [] })
      },
    }),
    {
      name: 'writinator-recent-files',
      storage: localforageStorage,
      version: 1,
      partialize: (state) =>
        ({ recentFiles: state.recentFiles }) as unknown as RecentFilesState,
    }
  )
)
