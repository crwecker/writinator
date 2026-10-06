import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installAutoSessionQuest, resetAutoSessionQuest } from './autoSessionQuest'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { fetchRandomImage } from '../../lib/unsplash'
import { makeSession } from '../../test/questFixtures'

vi.mock('../../lib/unsplash', () => ({
  fetchRandomImage: vi.fn(),
  loadImage: vi.fn(() => new Promise(() => {})),
}))
vi.mock('../../stores/genericToastStore', () => ({ showToast: vi.fn() }))

let uninstall: () => void = () => {}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  vi.mocked(fetchRandomImage).mockReset().mockResolvedValue({
    id: 'p1', url: 'https://images.unsplash.com/p1', width: 8, height: 6, photographer: 'A', photographerUrl: 'u', downloadLocationUrl: 'd',
  })
  resetAutoSessionQuest()
  uninstall = installAutoSessionQuest()
})

afterEach(() => uninstall())

describe('auto session quest with chapter/revision quests running', () => {
  it('still starts a session quest when only a chapter quest is underway', async () => {
    useImageRevealStore.setState({ activeSessions: [makeSession('ch', { progressSource: 'storylet' })] })
    useImageRevealStore.getState().addWords(10)
    await flush()
    const titles = useImageRevealStore.getState().activeSessions.map((s) => s.title)
    expect(titles).toContain('Session quest')
  })
})
