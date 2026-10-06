import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageRevealPanel } from './ImageRevealPanel'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { makeSession } from '../../test/questFixtures'
import { render, type Rendered } from '../../test/render'

vi.mock('../../lib/pixelate', () => ({ drawPixelated: vi.fn(), animateReveal: vi.fn(() => () => {}) }))
vi.mock('../../lib/unsplash', () => ({ loadImage: vi.fn(() => new Promise(() => {})) }))

let view: Rendered | null = null

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

afterEach(() => {
  view?.unmount()
  view = null
  act(() => {
    useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  })
  vi.useRealTimers()
})

function expandPanel(container: HTMLElement) {
  const btn = container.querySelector('button[title="Expand image quests"]') as HTMLButtonElement
  act(() => btn.click())
}

describe('ImageRevealPanel results', () => {
  it("shows Time's Up for the session that actually failed", () => {
    const timed = makeSession('timed', {
      wordsWritten: 30,
      timeMinutes: 10,
      pausedDuration: 0,
      startedAt: new Date().toISOString(),
    })
    useImageRevealStore.setState({
      activeSessions: [timed],
      completedSessions: [makeSession('old', { completed: true, result: 'success', wordsWritten: 100 })],
    })
    view = render(<ImageRevealPanel />)
    expandPanel(view.container)

    act(() => useImageRevealStore.getState().failSession('timed'))

    expect(view.container.textContent).toContain('Time’s Up!')
    expect(view.container.textContent).toContain('30 / 100 words')
  })

  it('keeps tracking timed quests while the panel is hidden, and shows the result when it returns', () => {
    vi.useFakeTimers()
    const startedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    act(() => {
      useImageRevealStore.setState({
        activeSessions: [makeSession('timed', { wordsWritten: 40, timeMinutes: 1, pausedDuration: 0, startedAt })],
      })
    })

    // Panel not mounted (typewriter / distraction-free mode)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(useImageRevealStore.getState().activeSessions).toHaveLength(0)
    expect(useImageRevealStore.getState().completedSessions[0]?.result).toBe('failure')

    view = render(<ImageRevealPanel />)
    expandPanel(view.container)
    expect(view.container.textContent).toContain('Time’s Up!')
    expect(view.container.textContent).toContain('40 / 100 words')
  })
})
