import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { ImageRevealSession } from '../types'

// Pixelation levels: fully pixelated → fully clear
export const PIXEL_LEVELS = [128, 64, 32, 16, 8, 4, 2, 0] as const

export function getPixelLevelIndex(progress: number): number {
  return Math.min(
    Math.floor(progress * PIXEL_LEVELS.length),
    PIXEL_LEVELS.length - 1
  )
}

export function getPixelLevel(progress: number): number {
  return PIXEL_LEVELS[getPixelLevelIndex(progress)]
}

interface ImageRevealState {
  activeSessions: ImageRevealSession[]
  completedSessions: ImageRevealSession[]
  startSession: (imageUrl: string, imageWidth: number, imageHeight: number, wordGoal: number, photographer?: string, photographerUrl?: string, unsplashId?: string) => void
  addWords: (count: number) => void
  abandonSession: (sessionId: string) => void
  abandonAllSessions: () => void
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
      activeSessions: [],
      completedSessions: [],

      startSession: (imageUrl: string, imageWidth: number, imageHeight: number, wordGoal: number, photographer?: string, photographerUrl?: string, unsplashId?: string) => {
        if (get().activeSessions.length >= 25) return
        const newSession: ImageRevealSession = {
          id: crypto.randomUUID(),
          unsplashId,
          imageUrl,
          imageWidth,
          imageHeight,
          wordGoal,
          wordsWritten: 0,
          currentLevel: 0,
          completed: false,
          startedAt: new Date().toISOString(),
          ...(photographer ? { photographer, photographerUrl } : {}),
        }
        set({ activeSessions: [...get().activeSessions, newSession] })
      },

      addWords: (count: number) => {
        if (count <= 0) return
        const { activeSessions, completedSessions } = get()
        const stillActive: ImageRevealSession[] = []
        const newlyCompleted: ImageRevealSession[] = []

        for (const session of activeSessions) {
          if (session.completed) {
            stillActive.push(session)
            continue
          }
          const newWordsWritten = Math.min(session.wordsWritten + count, session.wordGoal)
          const progress = newWordsWritten / session.wordGoal
          const currentLevel = getPixelLevelIndex(progress)
          const completed = newWordsWritten >= session.wordGoal
          const updated: ImageRevealSession = {
            ...session,
            wordsWritten: newWordsWritten,
            currentLevel,
            completed,
            ...(completed ? { completedAt: new Date().toISOString() } : {}),
          }
          if (completed) {
            newlyCompleted.push(updated)
          } else {
            stillActive.push(updated)
          }
        }

        set({
          activeSessions: stillActive,
          completedSessions: [...completedSessions, ...newlyCompleted],
        })
      },

      abandonSession: (sessionId: string) => {
        set({
          activeSessions: get().activeSessions.filter((s) => s.id !== sessionId),
        })
      },

      abandonAllSessions: () => {
        set({ activeSessions: [] })
      },
    }),
    {
      name: 'writinator-image-reveal',
      storage: localforageStorage,
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) {
          // v0: activeSession was a single T | null; convert to activeSessions array
          const state = persisted as Record<string, unknown>
          if ('activeSession' in state) {
            const old = state.activeSession as ImageRevealSession | null
            state.activeSessions = old ? [old] : []
            delete state.activeSession
          }
        }
        return persisted as ImageRevealState
      },
      partialize: (state) =>
        ({
          activeSessions: state.activeSessions,
          completedSessions: state.completedSessions,
        }) as unknown as ImageRevealState,
    }
  )
)
