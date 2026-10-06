import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'

/** Unsplash search query used for quest pictures. */
export type ImageTheme = 'nature' | 'cities' | 'ocean' | 'space' | 'fantasy art'

export const IMAGE_THEMES: { query: ImageTheme; label: string }[] = [
  { query: 'nature', label: 'Nature' },
  { query: 'cities', label: 'Cities' },
  { query: 'ocean', label: 'Ocean' },
  { query: 'space', label: 'Space' },
  { query: 'fantasy art', label: 'Fantasy art' },
]

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
        }) as unknown as GameSettingsState,
    },
  ),
)

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
