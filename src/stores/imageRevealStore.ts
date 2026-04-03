import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { ImageRevealSession } from '../types'
import { getPixelLevelIndex } from './questStore'

interface ImageRevealState {
  activeSession: ImageRevealSession | null
  completedSessions: ImageRevealSession[]
  startSession: (imageUrl: string, imageWidth: number, imageHeight: number, wordGoal: number, photographer?: string, photographerUrl?: string) => void
  addWords: (count: number) => void
  abandonSession: () => void
}

const localforageStorage = createJSONStorage<ImageRevealState>(() => ({
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

export const useImageRevealStore = create<ImageRevealState>()(
  persist(
    (set, get) => ({
      activeSession: null,
      completedSessions: [],

      startSession: (imageUrl: string, imageWidth: number, imageHeight: number, wordGoal: number, photographer?: string, photographerUrl?: string) => {
        set({
          activeSession: {
            id: crypto.randomUUID(),
            imageUrl,
            imageWidth,
            imageHeight,
            wordGoal,
            wordsWritten: 0,
            currentLevel: 0,
            completed: false,
            startedAt: new Date().toISOString(),
            ...(photographer ? { photographer, photographerUrl } : {}),
          },
        })
      },

      addWords: (count: number) => {
        const { activeSession } = get()
        if (!activeSession || activeSession.completed || count <= 0) return

        const newWordsWritten = Math.min(activeSession.wordsWritten + count, activeSession.wordGoal)
        const progress = newWordsWritten / activeSession.wordGoal
        const currentLevel = getPixelLevelIndex(progress)
        const completed = newWordsWritten >= activeSession.wordGoal

        const updated: ImageRevealSession = {
          ...activeSession,
          wordsWritten: newWordsWritten,
          currentLevel,
          completed,
          ...(completed ? { completedAt: new Date().toISOString() } : {}),
        }

        if (completed) {
          set({
            activeSession: null,
            completedSessions: [...get().completedSessions, updated],
          })
        } else {
          set({ activeSession: updated })
        }
      },

      abandonSession: () => {
        set({ activeSession: null })
      },
    }),
    {
      name: 'writinator-image-reveal',
      storage: localforageStorage,
      partialize: (state) =>
        ({
          activeSession: state.activeSession,
          completedSessions: state.completedSessions,
        }) as unknown as ImageRevealState,
    }
  )
)
