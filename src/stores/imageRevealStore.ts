import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { ImageRevealSession, ActiveEffect } from '../types'
import { getWeaponMultiplier, getArmorTimeBonus, getItemById } from '../lib/items'
import { calculateDifficulty, calculateQuestReward } from '../lib/questRewards'
import { getTimerState } from '../lib/timer'
import { usePlayerStore } from './playerStore'

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
  isPaused: boolean
  pauseStartedAt: number | null
  activeEffects: ActiveEffect[]

  // Returns the new session ID, or empty string if the session could not be started (e.g., capacity limit reached).
  startSession: (
    imageUrl: string,
    imageWidth: number,
    imageHeight: number,
    wordGoal: number,
    photographer?: string,
    photographerUrl?: string,
    unsplashId?: string,
    timeMinutes?: number,
  ) => string
  addWords: (count: number) => void
  tickTimer: () => void
  pauseTimer: () => void
  resumeTimer: () => void
  failSession: (sessionId: string) => void
  abandonSession: (sessionId: string) => void
  abandonAllSessions: () => void
  useConsumable: (itemId: string) => boolean
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

/** Returns true if there are no timed sessions remaining among activeSessions */
function noTimedSessionsRemain(sessions: ImageRevealSession[]): boolean {
  return !sessions.some((s) => s.timeMinutes !== undefined)
}

export const useImageRevealStore = create<ImageRevealState>()(
  persist(
    (set, get) => ({
      activeSessions: [],
      completedSessions: [],
      isPaused: false,
      pauseStartedAt: null,
      activeEffects: [],

      startSession: (
        imageUrl: string,
        imageWidth: number,
        imageHeight: number,
        wordGoal: number,
        photographer?: string,
        photographerUrl?: string,
        unsplashId?: string,
        timeMinutes?: number,
      ) => {
        const { activeSessions } = get()
        if (activeSessions.length >= 25) return ''

        // Reject if a timed session already exists and we're trying to add another
        if (timeMinutes !== undefined && activeSessions.some((s) => s.timeMinutes !== undefined)) {
          return ''
        }

        let adjustedTimeMinutes: number | undefined
        if (timeMinutes !== undefined) {
          const playerState = usePlayerStore.getState()
          const armorTimeBonus = getArmorTimeBonus(playerState.equippedArmor)
          adjustedTimeMinutes = timeMinutes * (1 + armorTimeBonus)
        }

        const id = crypto.randomUUID()
        const newSession: ImageRevealSession = {
          id,
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
          ...(adjustedTimeMinutes !== undefined
            ? { timeMinutes: adjustedTimeMinutes, pausedDuration: 0 }
            : {}),
        }
        set({ activeSessions: [...activeSessions, newSession] })
        return id
      },

      addWords: (count: number) => {
        if (count <= 0) return
        const { activeSessions, completedSessions, isPaused, activeEffects } = get()

        const playerState = usePlayerStore.getState()
        const weaponMultiplier = getWeaponMultiplier(playerState.equippedWeapon)

        // Apply Word Burst effect
        const wordBurstIdx = activeEffects.findIndex((e) => e.type === 'wordBurst')
        const hasWordBurst = wordBurstIdx !== -1
        const effectiveCount = Math.ceil(count * weaponMultiplier * (hasWordBurst ? 2 : 1))

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

        const stillActive: ImageRevealSession[] = []
        const newlyCompleted: ImageRevealSession[] = []

        for (const session of activeSessions) {
          if (session.completed) {
            stillActive.push(session)
            continue
          }

          // Skip timed sessions while paused
          if (session.timeMinutes !== undefined && isPaused) {
            stillActive.push(session)
            continue
          }

          const newWordsWritten = Math.min(session.wordsWritten + effectiveCount, session.wordGoal)
          const progress = newWordsWritten / session.wordGoal
          const currentLevel = getPixelLevelIndex(progress)
          const completed = newWordsWritten >= session.wordGoal

          if (completed) {
            // Calculate reward
            const { pauseStartedAt } = get()
            let coinsEarned = 0
            if (session.timeMinutes !== undefined && session.pausedDuration !== undefined) {
              const totalSeconds = session.timeMinutes * 60
              const startedAtMs = Date.parse(session.startedAt)
              const timerState = getTimerState(
                startedAtMs,
                totalSeconds,
                session.pausedDuration,
                isPaused && pauseStartedAt !== null ? pauseStartedAt : undefined,
              )
              const difficulty = calculateDifficulty(session.wordGoal, session.timeMinutes)
              coinsEarned = calculateQuestReward({
                wordGoal: session.wordGoal,
                wordsWritten: newWordsWritten,
                weaponMultiplier,
                timeMinutes: session.timeMinutes,
                timeUsedSeconds: timerState.elapsedSeconds,
                difficulty,
              })
            } else {
              coinsEarned = calculateQuestReward({
                wordGoal: session.wordGoal,
                wordsWritten: newWordsWritten,
                weaponMultiplier,
              })
            }

            if (coinsEarned > 0) {
              playerState.addCoins(coinsEarned)
            }
            playerState.addQuestStats(1, newWordsWritten, coinsEarned)

            const updated: ImageRevealSession = {
              ...session,
              wordsWritten: newWordsWritten,
              currentLevel,
              completed: true,
              completedAt: new Date().toISOString(),
              result: 'success',
              coinsEarned,
            }
            newlyCompleted.push(updated)
          } else {
            const updated: ImageRevealSession = {
              ...session,
              wordsWritten: newWordsWritten,
              currentLevel,
            }
            stillActive.push(updated)
          }
        }

        const newActiveSessions = stillActive
        const updates: Partial<ImageRevealState> = {
          activeSessions: newActiveSessions,
          completedSessions: [...completedSessions, ...newlyCompleted],
          activeEffects: newEffects,
        }

        // If all timed sessions are gone, clear timer state
        if (noTimedSessionsRemain(newActiveSessions)) {
          updates.isPaused = false
          updates.pauseStartedAt = null
          updates.activeEffects = []
        }

        set(updates)
      },

      tickTimer: () => {
        const { activeSessions, isPaused, pauseStartedAt } = get()
        if (isPaused) return

        for (const session of activeSessions) {
          if (session.timeMinutes === undefined || session.pausedDuration === undefined) continue
          if (session.completed) continue

          const totalSeconds = session.timeMinutes * 60
          const startedAtMs = Date.parse(session.startedAt)
          const timerState = getTimerState(
            startedAtMs,
            totalSeconds,
            session.pausedDuration,
            pauseStartedAt ?? undefined,
          )

          if (timerState.isExpired) {
            get().failSession(session.id)
          }
        }
      },

      pauseTimer: () => {
        const { isPaused } = get()
        if (isPaused) return
        set({ isPaused: true, pauseStartedAt: Date.now() })
      },

      resumeTimer: () => {
        const { isPaused, pauseStartedAt, activeSessions } = get()
        if (!isPaused || pauseStartedAt === null) return

        const additionalPause = Date.now() - pauseStartedAt

        const updatedSessions = activeSessions.map((s) => {
          if (s.timeMinutes === undefined || s.pausedDuration === undefined) return s
          return { ...s, pausedDuration: s.pausedDuration + additionalPause }
        })

        set({
          activeSessions: updatedSessions,
          isPaused: false,
          pauseStartedAt: null,
        })
      },

      failSession: (sessionId: string) => {
        const { activeSessions, completedSessions } = get()
        const session = activeSessions.find((s) => s.id === sessionId)
        if (!session) return

        const playerState = usePlayerStore.getState()
        const weaponMultiplier = getWeaponMultiplier(playerState.equippedWeapon)

        // Partial reward: base reward * (wordsWritten/wordGoal) * 0.5
        const baseReward = calculateQuestReward({
          wordGoal: session.wordGoal,
          wordsWritten: session.wordGoal, // full base
          weaponMultiplier,
        })
        const completionFraction = session.wordGoal > 0 ? session.wordsWritten / session.wordGoal : 0
        const partialCoins = Math.floor(baseReward * completionFraction * 0.5)

        if (partialCoins > 0) {
          playerState.addCoins(partialCoins)
        }
        playerState.addQuestStats(0, session.wordsWritten, partialCoins)

        const failedSession: ImageRevealSession = {
          ...session,
          completedAt: new Date().toISOString(),
          result: 'failure',
          coinsEarned: partialCoins,
        }

        const newActiveSessions = activeSessions.filter((s) => s.id !== sessionId)
        const updates: Partial<ImageRevealState> = {
          activeSessions: newActiveSessions,
          completedSessions: [failedSession, ...completedSessions],
        }

        if (noTimedSessionsRemain(newActiveSessions)) {
          updates.isPaused = false
          updates.pauseStartedAt = null
          updates.activeEffects = []
        }

        set(updates)
      },

      abandonSession: (sessionId: string) => {
        const { activeSessions, completedSessions } = get()
        const session = activeSessions.find((s) => s.id === sessionId)

        if (!session) {
          // Fallback: just remove it
          set({ activeSessions: activeSessions.filter((s) => s.id !== sessionId) })
          return
        }

        const abandonedSession: ImageRevealSession = {
          ...session,
          completedAt: new Date().toISOString(),
          result: 'abandoned',
        }

        usePlayerStore.getState().addQuestStats(0, session.wordsWritten, 0)

        const newActiveSessions = activeSessions.filter((s) => s.id !== sessionId)
        const updates: Partial<ImageRevealState> = {
          activeSessions: newActiveSessions,
          completedSessions: [abandonedSession, ...completedSessions],
        }

        if (noTimedSessionsRemain(newActiveSessions)) {
          updates.isPaused = false
          updates.pauseStartedAt = null
          updates.activeEffects = []
        }

        set(updates)
      },

      abandonAllSessions: () => {
        const { activeSessions, completedSessions } = get()
        const now = new Date().toISOString()
        const abandoned = activeSessions.map((s) => ({
          ...s,
          completedAt: now,
          result: 'abandoned' as const,
        }))
        set({
          activeSessions: [],
          completedSessions: [...abandoned, ...completedSessions],
          isPaused: false,
          pauseStartedAt: null,
          activeEffects: [],
        })
      },

      useConsumable: (itemId: string) => {
        const success = usePlayerStore.getState().useConsumable(itemId)
        if (!success) return false

        const item = getItemById(itemId)
        if (!item || item.category !== 'consumable') return true

        const { activeSessions } = get()
        const timedSessions = activeSessions.filter((s) => s.timeMinutes !== undefined)

        switch (item.effect) {
          case 'pause': {
            // Add effectValue * 1000 ms to pausedDuration of all timed sessions
            const updatedSessions = activeSessions.map((s) => {
              if (s.timeMinutes === undefined || s.pausedDuration === undefined) return s
              return { ...s, pausedDuration: s.pausedDuration + item.effectValue * 1000 }
            })
            set({ activeSessions: updatedSessions })
            break
          }
          case 'double-words': {
            set((state) => ({
              activeEffects: [
                ...state.activeEffects,
                { type: 'wordBurst', remainingValue: item.effectValue },
              ],
            }))
            break
          }
          case 'extend-time': {
            // Add effectValue seconds (converted to minutes) to timeMinutes of all timed sessions
            const updatedSessions = activeSessions.map((s) => {
              if (s.timeMinutes === undefined) return s
              return { ...s, timeMinutes: s.timeMinutes + item.effectValue / 60 }
            })
            set({ activeSessions: updatedSessions })
            break
          }
        }

        // Suppress unused variable warning for timedSessions
        void timedSessions

        return true
      },
    }),
    {
      name: 'writinator-image-reveal',
      storage: localforageStorage,
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>
        if (version === 0) {
          // v0: activeSession was a single T | null; convert to activeSessions array
          if ('activeSession' in state) {
            const old = state.activeSession as ImageRevealSession | null
            state.activeSessions = old ? [old] : []
            delete state.activeSession
          }
        }
        if (version < 2) {
          // v1→v2: add isPaused, pauseStartedAt, activeEffects defaults
          if (!('isPaused' in state)) state.isPaused = false
          if (!('pauseStartedAt' in state)) state.pauseStartedAt = null
          if (!('activeEffects' in state)) state.activeEffects = []
        }
        return persisted as ImageRevealState
      },
      partialize: (state) =>
        ({
          activeSessions: state.activeSessions,
          completedSessions: state.completedSessions,
          isPaused: state.isPaused,
          pauseStartedAt: state.pauseStartedAt,
          activeEffects: state.activeEffects,
        }) as unknown as ImageRevealState,
    }
  )
)
