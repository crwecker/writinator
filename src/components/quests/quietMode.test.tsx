import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageRevealPanel } from './ImageRevealPanel'
import { RewardToast } from './RewardToast'
import { addToast } from './rewardToastStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { makeSession } from '../../test/questFixtures'
import { render, type Rendered } from '../../test/render'

vi.mock('../../lib/pixelate', () => ({ drawPixelated: vi.fn(), animateReveal: vi.fn(() => () => {}) }))
vi.mock('../../lib/unsplash', () => ({ loadImage: vi.fn(() => new Promise(() => {})), fetchRandomImage: vi.fn() }))

let view: Rendered | null = null

beforeEach(() => {
  useImageRevealStore.setState({ ...useImageRevealStore.getInitialState(), activeSessions: [makeSession('a')] }, true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
})

afterEach(() => {
  view?.unmount()
  view = null
})

describe('quiet mode', () => {
  it('hides the image-reveal widget', () => {
    view = render(<ImageRevealPanel />)
    expect(view.container.innerHTML).not.toBe('')
    act(() => useGameSettingsStore.getState().setQuietMode(true))
    expect(view.container.innerHTML).toBe('')
  })

  it('hides coin toasts', () => {
    view = render(<RewardToast />)
    act(() => addToast(25, 'Quest'))
    expect(view.container.innerHTML).not.toBe('')
    act(() => useGameSettingsStore.getState().setQuietMode(true))
    act(() => addToast(30, 'Quest'))
    expect(view.container.innerHTML).toBe('')
  })
})
