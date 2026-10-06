import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import type { WordCountMode } from '../lib/wordAccounting'
import type { AmbientId } from '../lib/cosmetics'

/** Unsplash search query used for quest pictures. */
export type ImageTheme = 'nature' | 'cities' | 'ocean' | 'space' | 'fantasy art'

export const IMAGE_THEMES: { query: ImageTheme; label: string }[] = [
  { query: 'nature', label: 'Nature' },
  { query: 'cities', label: 'Cities' },
  { query: 'ocean', label: 'Ocean' },
  { query: 'space', label: 'Space' },
  { query: 'fantasy art', label: 'Fantasy art' },
]

export type DifficultyPreset = 'relaxed' | 'standard' | 'hardcore'

export interface DifficultyPresetConfig {
  label: string
  hint: string
  sessionGoal: number
  timerMinutes: number | null
  payoutMultiplier: number
}

export const DIFFICULTY_PRESETS: Record<DifficultyPreset, DifficultyPresetConfig> = {
  relaxed: { label: 'Relaxed', hint: '250-word sessions, no timer, 0.8× coins', sessionGoal: 250, timerMinutes: null, payoutMultiplier: 0.8 },
  standard: { label: 'Standard', hint: '500-word sessions, no timer, normal coins', sessionGoal: 500, timerMinutes: null, payoutMultiplier: 1 },
  hardcore: { label: 'Hardcore', hint: '1,000-word sessions, 20-minute timer, 1.3× coins', sessionGoal: 1000, timerMinutes: 20, payoutMultiplier: 1.3 },
}

/** Writing sounds (unlocked in the Armory). Off by default; quiet mode doesn't mute them. */
export interface SoundSettings {
  keySounds: boolean
  /** Soundscape playing in the background, or null for silence. */
  ambient: AmbientId | null
  /** 0–1. */
  volume: number
}

export interface AutoQuestSettings {
  /** Start an untimed "Session quest" when writing begins and none is running. */
  enabled: boolean
  wordGoal: number
}

interface GameSettingsState {
  autoQuest: AutoQuestSettings
  /** Timer pre-selected on new guild contracts; null = no timer. */
  defaultTimerMinutes: number | null
  /** Hide game UI (toasts, widget, badges, flashes) except the status-bar ring. */
  quietMode: boolean
  imageTheme: ImageTheme
  difficulty: DifficultyPreset
  /** What quests, streaks and goals count: gross typing (default) or net growth. */
  wordCountMode: WordCountMode
  sound: SoundSettings

  setSound: (patch: Partial<SoundSettings>) => void

  setWordCountMode: (mode: WordCountMode) => void
  setDifficulty: (preset: DifficultyPreset) => void
  setAutoQuest: (patch: Partial<AutoQuestSettings>) => void
  setDefaultTimer: (minutes: number | null) => void
  setQuietMode: (quiet: boolean) => void
  toggleQuietMode: () => void
  setImageTheme: (theme: ImageTheme) => void
}

const MAX_GOAL = 100_000

export const useGameSettingsStore = create<GameSettingsState>()(
  persist(
    (set) => ({
      autoQuest: { enabled: true, wordGoal: 500 },
      defaultTimerMinutes: null,
      quietMode: false,
      imageTheme: 'nature',
      difficulty: 'standard',
      wordCountMode: 'gross',
      sound: { keySounds: false, ambient: null, volume: 0.4 },

      setSound: (patch) => {
        set((state) => {
          const next = { ...state.sound, ...patch }
          next.volume = Number.isFinite(next.volume) ? Math.min(1, Math.max(0, next.volume)) : state.sound.volume
          return { sound: next }
        })
      },

      setWordCountMode: (mode) => {
        set({ wordCountMode: mode })
      },

      setDifficulty: (preset) => {
        const p = DIFFICULTY_PRESETS[preset]
        set((state) => ({
          difficulty: preset,
          autoQuest: { ...state.autoQuest, wordGoal: p.sessionGoal },
          defaultTimerMinutes: p.timerMinutes,
        }))
      },

      setAutoQuest: (patch) => {
        set((state) => {
          const next = { ...state.autoQuest, ...patch }
          const goal = Math.round(next.wordGoal)
          if (!Number.isFinite(goal) || goal < 1 || goal > MAX_GOAL) next.wordGoal = state.autoQuest.wordGoal
          else next.wordGoal = goal
          return { autoQuest: next }
        })
      },
      // Braces: persist's `set` returns a promise, which actions shouldn't leak.
      setDefaultTimer: (minutes) => {
        set({ defaultTimerMinutes: minutes })
      },
      setQuietMode: (quiet) => {
        set({ quietMode: quiet })
      },
      toggleQuietMode: () => {
        set((state) => ({ quietMode: !state.quietMode }))
      },
      setImageTheme: (theme) => {
        set({ imageTheme: theme })
      },
    }),
    {
      name: 'writinator-game-settings',
      version: 1,
      storage: localforageJSONStorage<GameSettingsState>(),
      partialize: (state) =>
        ({
          autoQuest: state.autoQuest,
          defaultTimerMinutes: state.defaultTimerMinutes,
          quietMode: state.quietMode,
          imageTheme: state.imageTheme,
          difficulty: state.difficulty,
          wordCountMode: state.wordCountMode,
          sound: state.sound,
        }) as unknown as GameSettingsState,
    },
  ),
)

/** Coin multiplier of the chosen difficulty preset. */
export function currentPayoutMultiplier(): number {
  return DIFFICULTY_PRESETS[useGameSettingsStore.getState().difficulty]?.payoutMultiplier ?? 1
}

/** Resolves once saved settings have loaded (immediately if they already have). */
export function gameSettingsReady(): Promise<void> {
  if (useGameSettingsStore.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const off = useGameSettingsStore.persist.onFinishHydration(() => {
      off()
      resolve()
    })
  })
}
