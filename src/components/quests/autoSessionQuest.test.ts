import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installAutoSessionQuest, resetAutoSessionQuest } from './autoSessionQuest'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { fetchRandomImage } from '../../lib/unsplash'
import { showToast } from '../../stores/genericToastStore'
import { makeSession } from '../../test/questFixtures'
import type { UnsplashImage } from '../../types'

vi.mock('../../lib/unsplash', () => ({
  fetchRandomImage: vi.fn(),
  loadImage: vi.fn(() => new Promise(() => {})),
}))
vi.mock('../../stores/genericToastStore', () => ({ showToast: vi.fn() }))

const photo: UnsplashImage = {
  id: 'p1',
  url: 'https://images.unsplash.com/p1',
  width: 800,
  height: 600,
  photographer: 'Ann',
  photographerUrl: 'https://unsplash.com/@ann',
  downloadLocationUrl: 'https://api.unsplash.com/dl/p1',
}

let uninstall: () => void = () => {}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  vi.mocked(fetchRandomImage).mockReset().mockResolvedValue(photo)
  vi.mocked(showToast).mockReset()
  resetAutoSessionQuest()
  uninstall = installAutoSessionQuest()
})

afterEach(() => {
  uninstall()
})

const active = () => useImageRevealStore.getState().activeSessions

describe('auto session quest', () => {
  it('starts an untimed "Session quest" on the first counted words, crediting them', async () => {
    useImageRevealStore.getState().addWords(12)
    await flush()
    expect(active()).toHaveLength(1)
    expect(active()[0]).toMatchObject({ title: 'Session quest', wordGoal: 500, wordsWritten: 12, imageUrl: photo.url })
    expect(active()[0].timeMinutes).toBeUndefined()
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('credits words written while the picture loads', async () => {
    let resolve: (p: UnsplashImage) => void = () => {}
    vi.mocked(fetchRandomImage).mockReturnValue(new Promise((r) => { resolve = r }))
    useImageRevealStore.getState().addWords(5)
    useImageRevealStore.getState().addWords(7)
    resolve(photo)
    await flush()
    expect(active()).toHaveLength(1)
    expect(active()[0].wordsWritten).toBe(12)
  })

  it('uses the configured goal and image theme', async () => {
    useGameSettingsStore.getState().setAutoQuest({ wordGoal: 750 })
    useGameSettingsStore.getState().setImageTheme('space')
    useImageRevealStore.getState().addWords(3)
    await flush()
    expect(fetchRandomImage).toHaveBeenCalledWith('space')
    expect(active()[0].wordGoal).toBe(750)
  })

  it('falls back to generated art when Unsplash fails', async () => {
    vi.mocked(fetchRandomImage).mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    useImageRevealStore.getState().addWords(3)
    await flush()
    expect(active()).toHaveLength(1)
    expect(active()[0].unsplashId).toBeUndefined()
  })

  it('does nothing when an untimed quest is already running', async () => {
    useImageRevealStore.setState({ activeSessions: [makeSession('mine')] })
    useImageRevealStore.getState().addWords(3)
    await flush()
    expect(active().map((s) => s.id)).toEqual(['mine'])
  })

  it('still starts alongside a timed quest', async () => {
    useImageRevealStore.setState({
      activeSessions: [makeSession('timed', { timeMinutes: 20, pausedDuration: 0, startedAt: new Date().toISOString() })],
    })
    useImageRevealStore.getState().addWords(3)
    await flush()
    expect(active().map((s) => s.title)).toContain('Session quest')
  })

  it('does nothing when turned off', async () => {
    useGameSettingsStore.getState().setAutoQuest({ enabled: false })
    useImageRevealStore.getState().addWords(3)
    await flush()
    expect(active()).toHaveLength(0)
  })

  it('only starts once per app session', async () => {
    useImageRevealStore.getState().addWords(3)
    await flush()
    useImageRevealStore.getState().abandonSession(active()[0].id)
    useImageRevealStore.getState().addWords(3)
    await flush()
    expect(active()).toHaveLength(0)
  })

  it('stays silent in quiet mode', async () => {
    useGameSettingsStore.getState().setQuietMode(true)
    useImageRevealStore.getState().addWords(3)
    await flush()
    expect(active()).toHaveLength(1)
    expect(showToast).not.toHaveBeenCalled()
  })
})
