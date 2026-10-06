import { beforeEach, describe, expect, it } from 'vitest'
import { IMAGE_THEMES, useGameSettingsStore } from './gameSettingsStore'
import { localforageMemory } from '../test/setup'

beforeEach(() => {
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
})

describe('gameSettingsStore', () => {
  it('defaults: auto session quest on at 500 words, no timer, not quiet, nature photos', () => {
    const s = useGameSettingsStore.getState()
    expect(s.autoQuest).toEqual({ enabled: true, wordGoal: 500 })
    expect(s.defaultTimerMinutes).toBeNull()
    expect(s.quietMode).toBe(false)
    expect(s.imageTheme).toBe('nature')
  })

  it('offers the five image themes as Unsplash queries', () => {
    expect(IMAGE_THEMES.map((t) => t.query)).toEqual(['nature', 'cities', 'ocean', 'space', 'fantasy art'])
  })

  it('updates settings', () => {
    const s = useGameSettingsStore.getState()
    s.setAutoQuest({ wordGoal: 750 })
    s.setAutoQuest({ enabled: false })
    s.setDefaultTimer(20)
    s.toggleQuietMode()
    s.setImageTheme('space')
    expect(useGameSettingsStore.getState()).toMatchObject({
      autoQuest: { enabled: false, wordGoal: 750 },
      defaultTimerMinutes: 20,
      quietMode: true,
      imageTheme: 'space',
    })
  })

  it('ignores nonsense goals', () => {
    useGameSettingsStore.getState().setAutoQuest({ wordGoal: 0 })
    expect(useGameSettingsStore.getState().autoQuest.wordGoal).toBe(500)
  })

  it('persists to localforage', async () => {
    useGameSettingsStore.getState().setQuietMode(true)
    await Promise.resolve()
    const raw = localforageMemory.get('writinator-game-settings')
    expect(typeof raw).toBe('string')
    expect(JSON.parse(raw as string).state.quietMode).toBe(true)
  })
})
