import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { QuestProgress } from '../types'
import { questArcs } from '../data/quests'

// Pixelation levels: fully pixelated → fully clear
// CSS filter uses svg for pixelation effect
export const PIXEL_LEVELS = [128, 64, 32, 16, 8, 4, 2, 0] as const

export function getPixelLevel(progress: number): number {
  // progress is 0..1, map to pixel level index
  const idx = Math.min(
    Math.floor(progress * PIXEL_LEVELS.length),
    PIXEL_LEVELS.length - 1
  )
  return PIXEL_LEVELS[idx]
}

interface QuestState {
  activeQuest: QuestProgress | null
  completedQuests: QuestProgress[]
  startQuest: (arcId: string, questId: string, currentTotalWords: number) => void
  addWords: (count: number) => void
  abandonQuest: () => void
}

const localforageStorage = createJSONStorage<QuestState>(() => ({
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

export const useQuestStore = create<QuestState>()(
  persist(
    (set, get) => ({
      activeQuest: null,
      completedQuests: [],

      startQuest: (arcId: string, questId: string, currentTotalWords: number) => {
        set({
          activeQuest: {
            questId,
            arcId,
            wordsAtStart: currentTotalWords,
            wordsWritten: 0,
            completed: false,
          },
        })
      },

      addWords: (count: number) => {
        const { activeQuest } = get()
        if (!activeQuest || activeQuest.completed || count <= 0) return

        const newWordsWritten = activeQuest.wordsWritten + count

        // Look up the quest to check if completed
        const arc = questArcs.find((a) => a.id === activeQuest.arcId)
        const quest = arc?.quests.find((q) => q.id === activeQuest.questId)
        const target = quest?.wordsToWin ?? Infinity
        const completed = newWordsWritten >= target

        const updated: QuestProgress = {
          ...activeQuest,
          wordsWritten: newWordsWritten,
          completed,
          ...(completed ? { completedAt: new Date().toISOString() } : {}),
        }

        set({
          activeQuest: updated,
          ...(completed
            ? { completedQuests: [...get().completedQuests, updated] }
            : {}),
        })
      },

      abandonQuest: () => {
        set({ activeQuest: null })
      },
    }),
    {
      name: 'writinator-quests',
      storage: localforageStorage,
      partialize: (state) =>
        ({
          activeQuest: state.activeQuest,
          completedQuests: state.completedQuests,
        }) as unknown as QuestState,
    }
  )
)
