import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { TimedQuest } from '../types'
import { getWeaponMultiplier, getArmorTimeBonus, getItemById } from '../lib/items'
import { calculateDifficulty, calculateReward } from '../lib/questRewards'
import { getTimerState } from '../lib/timer'
import { usePlayerStore } from './playerStore'

interface ActiveEffect {
  type: string
  remainingValue: number
}

interface TimedQuestState {
  activeQuest: TimedQuest | null
  completedQuests: TimedQuest[]
  isPaused: boolean
  pauseStartedAt: number | null
  activeEffects: ActiveEffect[]

  startQuest: (wordGoal: number, timeMinutes: number) => void
  addWords: (count: number) => void
  tickTimer: () => void
  pauseTimer: () => void
  resumeTimer: () => void
  completeQuest: () => void
  failQuest: () => void
  abandonQuest: () => void
  useConsumable: (itemId: string) => boolean
}

const localforageStorage = createJSONStorage<TimedQuestState>(() => ({
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

export const useTimedQuestStore = create<TimedQuestState>()(
  persist(
    (set, get) => ({
      activeQuest: null,
      completedQuests: [],
      isPaused: false,
      pauseStartedAt: null,
      activeEffects: [],

      startQuest: (wordGoal: number, timeMinutes: number) => {
        const playerState = usePlayerStore.getState()
        const armorTimeBonus = getArmorTimeBonus(playerState.equippedArmor)
        const adjustedTimeMinutes = timeMinutes * (1 + armorTimeBonus)

        const quest: TimedQuest = {
          id: crypto.randomUUID(),
          wordGoal,
          timeMinutes: adjustedTimeMinutes,
          wordsWritten: 0,
          startedAt: new Date().toISOString(),
          pausedDuration: 0,
        }

        set({
          activeQuest: quest,
          isPaused: false,
          pauseStartedAt: null,
          activeEffects: [],
        })
      },

      addWords: (count: number) => {
        const { activeQuest, isPaused, activeEffects } = get()
        if (!activeQuest || isPaused) return

        const playerState = usePlayerStore.getState()
        const weaponMultiplier = getWeaponMultiplier(playerState.equippedWeapon)

        const wordBurstIdx = activeEffects.findIndex((e) => e.type === 'wordBurst')
        const hasWordBurst = wordBurstIdx !== -1

        const effectiveWords = Math.round(count * weaponMultiplier * (hasWordBurst ? 2 : 1))

        let newEffects = [...activeEffects]
        if (hasWordBurst) {
          const burst = newEffects[wordBurstIdx]
          const newRemaining = burst.remainingValue - count
          if (newRemaining <= 0) {
            newEffects = newEffects.filter((_, i) => i !== wordBurstIdx)
          } else {
            newEffects = newEffects.map((e, i) =>
              i === wordBurstIdx ? { ...e, remainingValue: newRemaining } : e
            )
          }
        }

        const newWordsWritten = activeQuest.wordsWritten + effectiveWords
        const updatedQuest: TimedQuest = { ...activeQuest, wordsWritten: newWordsWritten }

        set({ activeQuest: updatedQuest, activeEffects: newEffects })

        if (newWordsWritten >= activeQuest.wordGoal) {
          get().completeQuest()
        }
      },

      tickTimer: () => {
        const { activeQuest, isPaused, pauseStartedAt } = get()
        if (!activeQuest || isPaused) return

        const totalSeconds = activeQuest.timeMinutes * 60
        const startedAtMs = Date.parse(activeQuest.startedAt)
        const timerState = getTimerState(
          startedAtMs,
          totalSeconds,
          activeQuest.pausedDuration,
          pauseStartedAt ?? undefined,
        )

        if (timerState.isExpired) {
          get().failQuest()
        }
      },

      pauseTimer: () => {
        const { activeQuest, isPaused } = get()
        if (!activeQuest || isPaused) return
        set({ isPaused: true, pauseStartedAt: Date.now() })
      },

      resumeTimer: () => {
        const { activeQuest, isPaused, pauseStartedAt } = get()
        if (!activeQuest || !isPaused || pauseStartedAt === null) return

        const additionalPause = Date.now() - pauseStartedAt
        const updatedQuest: TimedQuest = {
          ...activeQuest,
          pausedDuration: activeQuest.pausedDuration + additionalPause,
        }

        set({ activeQuest: updatedQuest, isPaused: false, pauseStartedAt: null })
      },

      completeQuest: () => {
        const { activeQuest, pauseStartedAt } = get()
        if (!activeQuest) return

        const totalSeconds = activeQuest.timeMinutes * 60
        const startedAtMs = Date.parse(activeQuest.startedAt)
        const timerState = getTimerState(
          startedAtMs,
          totalSeconds,
          activeQuest.pausedDuration,
          pauseStartedAt ?? undefined,
        )

        const timeUsedSeconds = timerState.elapsedSeconds
        const difficulty = calculateDifficulty(activeQuest.wordGoal, activeQuest.timeMinutes)
        const reward = calculateReward(
          activeQuest.wordGoal,
          activeQuest.timeMinutes,
          activeQuest.wordsWritten,
          timeUsedSeconds,
          difficulty,
        )

        const completedQuest: TimedQuest = {
          ...activeQuest,
          completedAt: new Date().toISOString(),
          result: 'success',
        }

        usePlayerStore.getState().addCoins(reward)
        usePlayerStore.getState().addQuestStats(1, activeQuest.wordsWritten, reward)

        set((state) => ({
          activeQuest: null,
          completedQuests: [completedQuest, ...state.completedQuests],
          isPaused: false,
          pauseStartedAt: null,
          activeEffects: [],
        }))
      },

      failQuest: () => {
        const { activeQuest } = get()
        if (!activeQuest) return

        // Partial reward: fraction of full reward based on completion, times 0.5
        const difficulty = calculateDifficulty(activeQuest.wordGoal, activeQuest.timeMinutes)
        const fullReward = calculateReward(
          activeQuest.wordGoal,
          activeQuest.timeMinutes,
          activeQuest.wordGoal, // pass wordGoal as wordsWritten to get base reward
          0,
          difficulty,
        )
        const completionFraction = activeQuest.wordsWritten / activeQuest.wordGoal
        const partialReward = Math.floor(fullReward * completionFraction * 0.5)

        const failedQuest: TimedQuest = {
          ...activeQuest,
          completedAt: new Date().toISOString(),
          result: 'failure',
        }

        if (partialReward > 0) {
          usePlayerStore.getState().addCoins(partialReward)
        }
        usePlayerStore.getState().addQuestStats(0, activeQuest.wordsWritten, partialReward)

        set((state) => ({
          activeQuest: null,
          completedQuests: [failedQuest, ...state.completedQuests],
          isPaused: false,
          pauseStartedAt: null,
          activeEffects: [],
        }))
      },

      abandonQuest: () => {
        const { activeQuest } = get()
        if (!activeQuest) return

        const abandonedQuest: TimedQuest = {
          ...activeQuest,
          completedAt: new Date().toISOString(),
          result: 'abandoned',
        }

        usePlayerStore.getState().addQuestStats(0, activeQuest.wordsWritten, 0)

        set((state) => ({
          activeQuest: null,
          completedQuests: [abandonedQuest, ...state.completedQuests],
          isPaused: false,
          pauseStartedAt: null,
          activeEffects: [],
        }))
      },

      useConsumable: (itemId: string) => {
        const success = usePlayerStore.getState().useConsumable(itemId)
        if (!success) return false

        const { activeQuest } = get()
        if (!activeQuest) return true

        const item = getItemById(itemId)
        if (!item || item.category !== 'consumable') return true

        const consumable = item
        // item is narrowed to Item (WeaponItem | ArmorItem | ConsumableItem)
        // We need to access .effect — only ConsumableItem has it
        if (consumable.category !== 'consumable') return true

        switch (consumable.effect) {
          case 'pause': {
            // 'pause' effect: add effectValue ms to pausedDuration (freeze the timer)
            const updatedQuest: TimedQuest = {
              ...activeQuest,
              pausedDuration: activeQuest.pausedDuration + consumable.effectValue * 1000,
            }
            set({ activeQuest: updatedQuest })
            break
          }
          case 'double-words': {
            // Word Burst: next N raw words count double
            set((state) => ({
              activeEffects: [
                ...state.activeEffects,
                { type: 'wordBurst', remainingValue: consumable.effectValue },
              ],
            }))
            break
          }
          case 'extend-time': {
            // Add effectValue seconds to timeMinutes
            const updatedQuest: TimedQuest = {
              ...activeQuest,
              timeMinutes: activeQuest.timeMinutes + consumable.effectValue / 60,
            }
            set({ activeQuest: updatedQuest })
            break
          }
        }

        return true
      },
    }),
    {
      name: 'writinator-timed-quest',
      version: 1,
      storage: localforageStorage,
      partialize: (state) =>
        ({
          activeQuest: state.activeQuest,
          completedQuests: state.completedQuests,
          isPaused: state.isPaused,
          pauseStartedAt: state.pauseStartedAt,
          activeEffects: state.activeEffects,
        }) as unknown as TimedQuestState,
    }
  )
)
