import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import type { BoardQuest, WriteathonConfig, WriteathonFileData, WriteathonMilestone } from '../types'
import {
  calendarDailyTarget,
  createCalendarDays,
  getWriteathonToday,
  migrateWriteathonData,
  WRITEATHON_MODEL,
  type CalendarWriteathonData,
  type WriteathonDay,
} from '../lib/writeathon'
import { todayKey } from '../lib/metrics'
import { parseDayKey } from '../lib/days'
import { usePlayerStore } from './playerStore'
import { useImageRevealStore } from './imageRevealStore'
import { addToast } from '../components/quests/rewardToastStore'

interface WriteathonState {
  config: WriteathonConfig | null
  /** One entry per calendar date of the writeathon (see WriteathonDay). */
  milestones: WriteathonDay[]
  /** Data model marker: 2 = calendar days. */
  model: typeof WRITEATHON_MODEL
  /** Book word count at the last update — the start-of-day count for the next new date. */
  lastSeenBookWords: number | null
  villagerQuests: BoardQuest[]
  activeBoardQuests: BoardQuest[]
  dailyQuestAccepted: boolean
  _hasHydrated: boolean

  startWriteathon: (startingWordCount: number, targetWordCount: number, totalBlocks?: number, now?: number) => void
  updateProgress: (currentBookWordCount: number, now?: number) => void
  acceptDailyQuest: () => void
  completeDailyQuest: (sessionId: string) => void
  addVillagerQuest: (quest: BoardQuest) => void
  removeVillagerQuest: (questId: string) => void
  acceptBoardQuest: (quest: BoardQuest, sessionId: string) => void
  completeBoardQuest: (questId: string) => void
  endBoardQuest: (questId: string) => void
  resetWriteathon: () => void
  pauseWriteathon: () => void
  resumeWriteathon: () => void

  /** 1-based day number of today (clamped to the plan). */
  getCurrentBlock: (now?: number) => number
  /** Words needed today to stay on pace (0 when paused, finished or over). */
  getDailyTarget: (now?: number) => number
  /** Dates left including today. */
  getRemainingBlocks: (now?: number) => number
  /** Dates that paid out. */
  getCompletedBlocks: () => number
}

const localforageStorage = localforageJSONStorage<WriteathonState>()

export const useWriteathonStore = create<WriteathonState>()(
  persist(
    (set, get) => ({
      config: null,
      milestones: [],
      model: WRITEATHON_MODEL,
      lastSeenBookWords: null,
      villagerQuests: [],
      activeBoardQuests: [],
      dailyQuestAccepted: false,
      _hasHydrated: false,

      startWriteathon: (startingWordCount, targetWordCount, totalBlocks = 24, now = Date.now()) => {
        const wordsPerBlock = Math.ceil((targetWordCount - startingWordCount) / totalBlocks)
        const startDay = todayKey(now)
        const config: WriteathonConfig = {
          id: crypto.randomUUID(),
          startDate: parseDayKey(startDay).toISOString(),
          startingWordCount,
          targetWordCount,
          totalBlocks,
          wordsPerBlock,
          active: true,
        }
        const milestones = createCalendarDays(startDay, startingWordCount, wordsPerBlock, totalBlocks)
        set({
          config,
          milestones,
          model: WRITEATHON_MODEL,
          lastSeenBookWords: startingWordCount,
          villagerQuests: [],
          dailyQuestAccepted: false,
        })
      },

      updateProgress: (currentBookWordCount, now = Date.now()) => {
        const { config, milestones, lastSeenBookWords } = get()
        if (!config || !config.active || config.completedAt) {
          set({ lastSeenBookWords: currentBookWordCount })
          return
        }
        if (config.paused) {
          set({ lastSeenBookWords: currentBookWordCount })
          return
        }

        const today = getWriteathonToday(config, milestones, currentBookWordCount, now)
        let nextMilestones = milestones
        if (today.phase === 'active') {
          const index = today.index
          let day = milestones[index]
          if (day.dayStartWordCount === undefined) {
            // First update of this date: the count before this edit is where today began.
            const dayStart = Math.min(lastSeenBookWords ?? currentBookWordCount, currentBookWordCount)
            day = {
              ...day,
              dayStartWordCount: dayStart,
              dayTarget: calendarDailyTarget(config.targetWordCount, dayStart, today.remainingDays),
            }
          }
          const target = day.dayTarget ?? 0
          const written = currentBookWordCount - (day.dayStartWordCount ?? currentBookWordCount)
          const reachedGoal = currentBookWordCount >= config.targetWordCount
          if (!day.completed && ((target > 0 && written >= target) || reachedGoal)) {
            usePlayerStore.getState().addCoins(day.coinsAwarded)
            const tierLabel = day.tier.charAt(0).toUpperCase() + day.tier.slice(1)
            addToast(day.coinsAwarded, `Writeathon day ${day.blockNumber} — ${tierLabel}`)
            day = {
              ...day,
              completed: true,
              completedAt: new Date(now).toISOString(),
              targetWordCount: (day.dayStartWordCount ?? 0) + target,
            }
          }
          if (day !== milestones[index]) {
            nextMilestones = [...milestones]
            nextMilestones[index] = day
          }
        }

        const finished = currentBookWordCount >= config.targetWordCount && today.phase !== 'before'
        set({
          lastSeenBookWords: currentBookWordCount,
          ...(nextMilestones !== milestones ? { milestones: nextMilestones } : {}),
          ...(finished ? { config: { ...config, completedAt: new Date(now).toISOString() } } : {}),
        })
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

      // Failed or abandoned: drop the quest from the board without paying out.
      endBoardQuest: (questId: string) => {
        set((state) => ({
          activeBoardQuests: state.activeBoardQuests.filter((q) => q.id !== questId),
        }))
      },

      resetWriteathon: () => {
        set({ config: null, milestones: [], villagerQuests: [], activeBoardQuests: [], dailyQuestAccepted: false })
      },

      pauseWriteathon: () => {
        set((state) => ({
          config: state.config ? { ...state.config, paused: true } : null,
        }))
      },

      resumeWriteathon: () => {
        set((state) => ({
          config: state.config ? { ...state.config, paused: false } : null,
        }))
      },

      getCurrentBlock: (now = Date.now()) => {
        const { config, milestones } = get()
        if (!config) return 1
        const today = getWriteathonToday(config, milestones, get().lastSeenBookWords ?? 0, now)
        return Math.max(1, Math.min(today.index + 1, config.totalBlocks))
      },

      getDailyTarget: (now = Date.now()) => {
        const { config, milestones, lastSeenBookWords } = get()
        if (!config || config.paused) return 0
        const today = getWriteathonToday(config, milestones, lastSeenBookWords ?? config.startingWordCount, now)
        return today.phase === 'active' ? today.target : 0
      },

      getRemainingBlocks: (now = Date.now()) => {
        const { config, milestones } = get()
        if (!config) return 0
        return getWriteathonToday(config, milestones, 0, now).remainingDays
      },

      getCompletedBlocks: () => {
        const { milestones } = get()
        return milestones.filter((m) => m.completed).length
      },
    }),
    {
      name: 'writinator-writeathon',
      storage: localforageStorage,
      version: 2,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted as WriteathonState
        const s = persisted as Partial<WriteathonState> & { milestones?: WriteathonMilestone[] }
        if (version < 2) {
          const migrated = migrateWriteathonData({ config: s.config ?? null, milestones: s.milestones ?? [] })
          return { ...s, ...migrated } as WriteathonState
        }
        return s as WriteathonState
      },
      partialize: (state) =>
        ({
          config: state.config,
          milestones: state.milestones,
          model: state.model,
          lastSeenBookWords: state.lastSeenBookWords,
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

// Settle board quests when their linked image reveal session ends. Only a
// successful reveal pays the board reward; failed/abandoned quests just end.
useImageRevealStore.subscribe((state, prevState) => {
  const prevActiveIds = new Set(prevState.activeSessions.map((s) => s.id))
  const justEnded = state.completedSessions.filter((s) => prevActiveIds.has(s.id))
  if (justEnded.length === 0) return

  const { activeBoardQuests, completeBoardQuest, endBoardQuest } = useWriteathonStore.getState()
  for (const session of justEnded) {
    const quest = activeBoardQuests.find((q) => q.imageRevealSessionId === session.id)
    if (!quest) continue
    if (session.result === 'success') completeBoardQuest(quest.id)
    else endBoardQuest(quest.id)
  }
})

// ---------------------------------------------------------------------------
// File serialization helpers — used by fileSystem.ts section registry
// ---------------------------------------------------------------------------

/** Book-file shape: the shared WriteathonFileData plus the calendar-model fields. */
export type WriteathonFileSection = WriteathonFileData & Pick<CalendarWriteathonData, 'model' | 'lastSeenBookWords'>

export function serializeWriteathon(): WriteathonFileSection {
  const { config, milestones, model, lastSeenBookWords, villagerQuests, activeBoardQuests, dailyQuestAccepted } =
    useWriteathonStore.getState()
  return { config, milestones, model, lastSeenBookWords, villagerQuests, activeBoardQuests, dailyQuestAccepted }
}

export function hydrateWriteathon(data: WriteathonFileData | undefined): void {
  if (data === undefined) return
  // Files written before calendar days carry the checkpoint model.
  const calendar = migrateWriteathonData(data as Partial<WriteathonFileSection> & WriteathonFileData)
  useWriteathonStore.setState({
    config: calendar.config,
    milestones: calendar.milestones,
    model: calendar.model,
    lastSeenBookWords: calendar.lastSeenBookWords,
    villagerQuests: data.villagerQuests,
    activeBoardQuests: data.activeBoardQuests,
    dailyQuestAccepted: data.dailyQuestAccepted,
  })
}
