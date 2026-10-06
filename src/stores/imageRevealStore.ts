import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import type { ActiveEffect, ImageRevealFileData, ImageRevealSession } from '../types'
import { getWeaponMultiplier, getArmorTimeBonus, getItemById } from '../lib/items'
import { calculateQuestReward, sessionDifficulty } from '../lib/questRewards'
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

/** What one batch of counted words (or a timer running out) did for the player. */
export interface QuestProgressEvent {
  /** Words counted as writing (0 for a timed-out quest). */
  words: number
  /** Coins the player gained, including board-quest rewards paid alongside. */
  coins: number
  /** Quests completed successfully. */
  finished: number
}

type QuestProgressListener = (e: QuestProgressEvent) => void
const progressListeners = new Set<QuestProgressListener>()

/**
 * Subscribe to counted words and quest payouts. Fires on every `addWords`
 * (even with no quest running) and when a timed quest runs out. Returns an
 * unsubscribe function.
 */
export function onQuestProgress(listener: QuestProgressListener): () => void {
  progressListeners.add(listener)
  return () => {
    progressListeners.delete(listener)
  }
}

function emitProgress(e: QuestProgressEvent): void {
  for (const l of [...progressListeners]) l(e)
}

/** Coins a successful session pays, including its Word Burst bonus. */
function completionCoins(session: ImageRevealSession, wordsWritten: number, isPaused: boolean, pauseStartedAt: number | null): number {
  const weaponMultiplier = getWeaponMultiplier(usePlayerStore.getState().equippedWeapon)
  let coins: number
  if (session.timeMinutes !== undefined && session.pausedDuration !== undefined) {
    const timerState = getTimerState(
      Date.parse(session.startedAt),
      session.timeMinutes * 60,
      session.pausedDuration,
      isPaused && pauseStartedAt !== null ? pauseStartedAt : undefined,
    )
    coins = calculateQuestReward({
      wordGoal: session.wordGoal,
      wordsWritten,
      weaponMultiplier,
      timeMinutes: session.timeMinutes,
      timeUsedSeconds: timerState.elapsedSeconds,
      difficulty: sessionDifficulty({ ...session, timeMinutes: session.timeMinutes }),
      boardCoins: session.boardCoins,
    })
  } else {
    coins = calculateQuestReward({ wordGoal: session.wordGoal, wordsWritten, weaponMultiplier })
  }
  // Word Burst: burst words earn their share of the whole payout a second time.
  const burstWords = session.burstWords ?? 0
  if (burstWords > 0 && session.wordGoal > 0) {
    coins += Math.floor((coins + (session.boardCoins ?? 0)) * Math.min(burstWords, session.wordGoal) / session.wordGoal)
  }
  return coins
}

interface ImageRevealState {
  activeSessions: ImageRevealSession[]
  completedSessions: ImageRevealSession[]
  isPaused: boolean
  pauseStartedAt: number | null
  activeEffects: ActiveEffect[]
  /**
   * Transient (not persisted): sessions that just succeeded or failed, oldest
   * first, waiting for the panel to show their celebration / result overlay.
   * Lives here rather than in the panel so results that land while the panel
   * is hidden (distraction-free mode) are still shown when it returns.
   */
  resultQueue: ImageRevealSession[]

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
    title?: string,
    options?: { boardCoins?: number; progressSource?: ImageRevealSession['progressSource'] },
  ) => string
  addWords: (count: number) => void
  creditWords: (sessionId: string, count: number) => void
  tickTimer: () => void
  pauseTimer: () => void
  resumeTimer: () => void
  failSession: (sessionId: string) => void
  abandonSession: (sessionId: string) => void
  abandonAllSessions: () => void
  useConsumable: (itemId: string) => boolean
  dismissResult: () => void
}

const localforageStorage = localforageJSONStorage<ImageRevealState>()

/** Returns true if there are no timed sessions remaining among activeSessions */
function noTimedSessionsRemain(sessions: ImageRevealSession[]): boolean {
  return !sessions.some((s) => s.timeMinutes !== undefined)
}

export const useImageRevealStore = create<ImageRevealState>()(
  persist(
    (set, get) => {
      /**
       * Add `count` real words to the active sessions matching `include`,
       * completing (and paying for) any that reach their goal. Gear never
       * changes word progress. Returns how many sessions completed.
       */
      function applyWords(
        count: number,
        burstCount: number,
        include: (s: ImageRevealSession) => boolean,
        effects: ActiveEffect[],
      ): number {
        const { activeSessions, completedSessions, isPaused, pauseStartedAt, resultQueue } = get()
        const playerState = usePlayerStore.getState()
        const stillActive: ImageRevealSession[] = []
        const newlyCompleted: ImageRevealSession[] = []

        for (const session of activeSessions) {
          // Skip finished sessions, ones not targeted, and timed sessions while paused
          if (session.completed || !include(session) || (session.timeMinutes !== undefined && isPaused)) {
            stillActive.push(session)
            continue
          }

          const newWordsWritten = Math.min(session.wordsWritten + count, session.wordGoal)
          const applied = newWordsWritten - session.wordsWritten
          const burstWords = (session.burstWords ?? 0) + Math.min(burstCount, applied)
          const withWords: ImageRevealSession = {
            ...session,
            wordsWritten: newWordsWritten,
            currentLevel: getPixelLevelIndex(newWordsWritten / session.wordGoal),
            ...(burstWords > 0 ? { burstWords } : {}),
          }

          if (newWordsWritten >= session.wordGoal) {
            const coinsEarned = completionCoins(withWords, newWordsWritten, isPaused, pauseStartedAt)
            if (coinsEarned > 0) playerState.addCoins(coinsEarned)
            playerState.addQuestStats(1, newWordsWritten, coinsEarned)
            newlyCompleted.push({
              ...withWords,
              completed: true,
              completedAt: new Date().toISOString(),
              result: 'success',
              coinsEarned,
            })
          } else {
            stillActive.push(withWords)
          }
        }

        const updates: Partial<ImageRevealState> = {
          activeSessions: stillActive,
          completedSessions: [...completedSessions, ...newlyCompleted],
          activeEffects: effects,
          ...(newlyCompleted.length > 0 ? { resultQueue: [...resultQueue, ...newlyCompleted] } : {}),
        }
        // If all timed sessions are gone, clear timer state (Word Burst is kept:
        // it pays out on any quest).
        if (noTimedSessionsRemain(stillActive)) {
          updates.isPaused = false
          updates.pauseStartedAt = null
        }
        set(updates)
        return newlyCompleted.length
      }

      return {
      activeSessions: [],
      completedSessions: [],
      isPaused: false,
      pauseStartedAt: null,
      activeEffects: [],
      resultQueue: [],

      startSession: (
        imageUrl: string,
        imageWidth: number,
        imageHeight: number,
        wordGoal: number,
        photographer?: string,
        photographerUrl?: string,
        unsplashId?: string,
        timeMinutes?: number,
        title?: string,
        options?: { boardCoins?: number; progressSource?: ImageRevealSession['progressSource'] },
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
          ...(title ? { title } : {}),
          ...(photographer ? { photographer, photographerUrl } : {}),
          ...(adjustedTimeMinutes !== undefined
            ? { timeMinutes: adjustedTimeMinutes, baseTimeMinutes: timeMinutes, pausedDuration: 0 }
            : {}),
          ...(options?.boardCoins ? { boardCoins: options.boardCoins } : {}),
          ...(options?.progressSource ? { progressSource: options.progressSource } : {}),
        }
        set({ activeSessions: [...activeSessions, newSession] })
        return id
      },

      addWords: (count: number) => {
        if (count <= 0) return
        const { activeEffects } = get()

        // Word Burst: the next N counted words earn double coins (progress is unchanged).
        const burstIdx = activeEffects.findIndex((e) => e.type === 'wordBurst')
        let burstCount = 0
        let newEffects = activeEffects
        if (burstIdx !== -1) {
          const burst = activeEffects[burstIdx]
          burstCount = Math.min(count, burst.remainingValue)
          const remaining = burst.remainingValue - count
          newEffects = remaining <= 0
            ? activeEffects.filter((_, i) => i !== burstIdx)
            : activeEffects.map((e, i) => (i === burstIdx ? { ...e, remainingValue: remaining } : e))
        }

        const coinsBefore = usePlayerStore.getState().coins
        // Chapter and revision quests progress on their own measure, not typing.
        const finished = applyWords(count, burstCount, (s) => s.progressSource === undefined, newEffects)
        emitProgress({ words: count, coins: Math.max(0, usePlayerStore.getState().coins - coinsBefore), finished })
      },

      creditWords: (sessionId: string, count: number) => {
        if (count <= 0) return
        applyWords(count, 0, (s) => s.id === sessionId, get().activeEffects)
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
          resultQueue: [...get().resultQueue, failedSession],
        }

        if (noTimedSessionsRemain(newActiveSessions)) {
          updates.isPaused = false
          updates.pauseStartedAt = null
        }

        set(updates)
        emitProgress({ words: 0, coins: partialCoins, finished: 0 })
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

      dismissResult: () => {
        set((state) => ({ resultQueue: state.resultQueue.slice(1) }))
      },
    }
    },
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

// ---------------------------------------------------------------------------
// Timed-quest ticker. Runs at store level (not in a component) so quests keep
// expiring on schedule while the panel is hidden in distraction-free mode.
// ---------------------------------------------------------------------------

let tickInterval: ReturnType<typeof setInterval> | null = null

function syncTickInterval(state: ImageRevealState): void {
  const hasTimed = state.activeSessions.some((s) => s.timeMinutes !== undefined)
  if (hasTimed && tickInterval === null) {
    tickInterval = setInterval(() => useImageRevealStore.getState().tickTimer(), 1000)
  } else if (!hasTimed && tickInterval !== null) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

useImageRevealStore.subscribe(syncTickInterval)
syncTickInterval(useImageRevealStore.getState())

// ---------------------------------------------------------------------------
// File serialization helpers — used by fileSystem.ts section registry
// ---------------------------------------------------------------------------

export function serializeImageReveal(): ImageRevealFileData {
  const { activeSessions, completedSessions, isPaused, pauseStartedAt, activeEffects } =
    useImageRevealStore.getState()
  return { activeSessions, completedSessions, isPaused, pauseStartedAt, activeEffects }
}

export function hydrateImageReveal(data: ImageRevealFileData | undefined): void {
  if (data === undefined) return
  // Leave transient timer intervals (managed externally) untouched — only set persisted fields.
  useImageRevealStore.setState({
    activeSessions: data.activeSessions,
    completedSessions: data.completedSessions,
    isPaused: data.isPaused,
    pauseStartedAt: data.pauseStartedAt,
    activeEffects: data.activeEffects,
  })
}
