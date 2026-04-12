import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { WriteathonConfig, WriteathonMilestone, BoardQuest } from '../types'
import { calculateDailyTarget, createMilestones } from '../lib/writeathon'
import { usePlayerStore } from './playerStore'
import { useImageRevealStore } from './imageRevealStore'
import { addToast } from '../components/quests/rewardToastStore'

interface WriteathonState {
  config: WriteathonConfig | null
  milestones: WriteathonMilestone[]
  villagerQuests: BoardQuest[]
  activeBoardQuests: BoardQuest[]
  dailyQuestAccepted: boolean
  _hasHydrated: boolean

  startWriteathon: (startingWordCount: number, targetWordCount: number, totalBlocks?: number) => void
  updateProgress: (currentBookWordCount: number) => void
  acceptDailyQuest: () => void
  completeDailyQuest: (sessionId: string) => void
  addVillagerQuest: (quest: BoardQuest) => void
  removeVillagerQuest: (questId: string) => void
  acceptBoardQuest: (quest: BoardQuest, sessionId: string) => void
  completeBoardQuest: (questId: string) => void
  resetWriteathon: () => void

  getCurrentBlock: () => number
  getDailyTarget: () => number
  getRemainingBlocks: () => number
  getCompletedBlocks: () => number
}

const localforageStorage = createJSONStorage<WriteathonState>(() => ({
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

export const useWriteathonStore = create<WriteathonState>()(
  persist(
    (set, get) => ({
      config: null,
      milestones: [],
      villagerQuests: [],
      activeBoardQuests: [],
      dailyQuestAccepted: false,
      _hasHydrated: false,

      startWriteathon: (startingWordCount: number, targetWordCount: number, totalBlocks = 24) => {
        const wordsPerBlock = Math.ceil((targetWordCount - startingWordCount) / totalBlocks)
        const config: WriteathonConfig = {
          id: crypto.randomUUID(),
          startDate: new Date().toISOString(),
          startingWordCount,
          targetWordCount,
          totalBlocks,
          wordsPerBlock,
          active: true,
        }
        const milestones = createMilestones(startingWordCount, wordsPerBlock, totalBlocks)
        set({ config, milestones, villagerQuests: [], dailyQuestAccepted: false })
      },

      updateProgress: (currentBookWordCount: number) => {
        const { config, milestones } = get()
        if (!config || !config.active) return

        let anyNewlyCompleted = false
        const playerStore = usePlayerStore.getState()

        const updatedMilestones = milestones.map((milestone) => {
          if (milestone.completed) return milestone
          if (currentBookWordCount >= milestone.targetWordCount) {
            anyNewlyCompleted = true
            playerStore.addCoins(milestone.coinsAwarded)
            const tierLabel = milestone.tier.charAt(0).toUpperCase() + milestone.tier.slice(1)
            addToast(milestone.coinsAwarded, `Block ${milestone.blockNumber} — ${tierLabel}`)
            return {
              ...milestone,
              completed: true,
              completedAt: new Date().toISOString(),
            }
          }
          return milestone
        })

        const allComplete = updatedMilestones.every((m) => m.completed)

        if (allComplete && anyNewlyCompleted) {
          set({
            milestones: updatedMilestones,
            config: {
              ...config,
              active: false,
              completedAt: new Date().toISOString(),
            },
          })
        } else if (anyNewlyCompleted) {
          set({ milestones: updatedMilestones })
        }
      },

      acceptDailyQuest: () => {
        set({ dailyQuestAccepted: true })
      },

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      completeDailyQuest: (_sessionId: string) => {
        // Phase 2 will flesh this out
      },

      addVillagerQuest: (quest: BoardQuest) => {
        set((state) => ({ villagerQuests: [...state.villagerQuests, quest] }))
      },

      removeVillagerQuest: (questId: string) => {
        set((state) => ({
          villagerQuests: state.villagerQuests.filter((q) => q.id !== questId),
        }))
      },

      acceptBoardQuest: (quest: BoardQuest, sessionId: string) => {
        const accepted: BoardQuest = {
          ...quest,
          accepted: true,
          acceptedAt: new Date().toISOString(),
          imageRevealSessionId: sessionId,
        }
        set((state) => ({
          activeBoardQuests: [
            ...state.activeBoardQuests.filter((q) => q.id !== quest.id),
            accepted,
          ],
        }))
      },

      completeBoardQuest: (questId: string) => {
        const { activeBoardQuests } = get()
        const quest = activeBoardQuests.find((q) => q.id === questId)
        if (!quest) return

        set((state) => ({
          activeBoardQuests: state.activeBoardQuests.filter((q) => q.id !== questId),
        }))

        const reward = quest.coinReward + (quest.bonusCoins ?? 0)
        usePlayerStore.getState().addCoins(reward)
        console.info(`[writeathonStore] Board quest completed: "${quest.title}" (+${reward} coins)`)

        if (quest.type === 'daily') {
          const bonus = Math.floor(get().getDailyTarget() * 0.15)
          if (bonus > 0) {
            usePlayerStore.getState().addCoins(bonus)
            addToast(bonus, 'Daily Quest Bonus!')
          }
        }
      },

      resetWriteathon: () => {
        set({ config: null, milestones: [], villagerQuests: [], activeBoardQuests: [], dailyQuestAccepted: false })
      },

      getCurrentBlock: () => {
        const { config, milestones } = get()
        if (!config) return 1
        const completedCount = milestones.filter((m) => m.completed).length
        return Math.min(completedCount + 1, config.totalBlocks)
      },

      getDailyTarget: () => {
        const { config, milestones } = get()
        if (!config) return 0
        const completedCount = milestones.filter((m) => m.completed).length
        const remainingBlocks = config.totalBlocks - completedCount
        // currentWordCount is the target of the last completed milestone, or startingWordCount
        const lastCompleted = milestones.filter((m) => m.completed).at(-1)
        const currentWordCount = lastCompleted?.targetWordCount ?? config.startingWordCount
        return calculateDailyTarget(config.targetWordCount, currentWordCount, remainingBlocks)
      },

      getRemainingBlocks: () => {
        const { config, milestones } = get()
        if (!config) return 0
        const completedCount = milestones.filter((m) => m.completed).length
        return config.totalBlocks - completedCount
      },

      getCompletedBlocks: () => {
        const { milestones } = get()
        return milestones.filter((m) => m.completed).length
      },
    }),
    {
      name: 'writinator-writeathon',
      storage: localforageStorage,
      version: 1,
      partialize: (state) =>
        ({
          config: state.config,
          milestones: state.milestones,
          villagerQuests: state.villagerQuests,
          activeBoardQuests: state.activeBoardQuests,
          dailyQuestAccepted: state.dailyQuestAccepted,
        }) as unknown as WriteathonState,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[writeathonStore] rehydration error:', error)
        }
        if (state) {
          useWriteathonStore.setState({ _hasHydrated: true })
        }
      },
    }
  )
)

// Auto-complete board quests when their linked image reveal session completes
useImageRevealStore.subscribe((state, prevState) => {
  const prevActiveIds = new Set(prevState.activeSessions.map((s) => s.id))
  const currCompletedIds = new Set(state.completedSessions.map((s) => s.id))
  const justCompleted = [...currCompletedIds].filter((id) => prevActiveIds.has(id))
  if (justCompleted.length === 0) return

  const { activeBoardQuests, completeBoardQuest } = useWriteathonStore.getState()
  for (const sessionId of justCompleted) {
    const quest = activeBoardQuests.find((q) => q.imageRevealSessionId === sessionId)
    if (quest) completeBoardQuest(quest.id)
  }
})
