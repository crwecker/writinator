import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestBoardPanel } from './QuestBoardPanel'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { render, type Rendered } from '../../test/render'

vi.mock('../../lib/unsplash', () => ({ fetchRandomImage: vi.fn(), loadImage: vi.fn(() => new Promise(() => {})) }))

let view: Rendered | null = null

beforeEach(() => {
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  useWriteathonStore.setState({ activeBoardQuests: [], villagerQuests: [], config: null })
})

afterEach(() => {
  view?.unmount()
  view = null
})

function checkedTimers(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[role="radiogroup"][aria-label="Time limit"] [aria-checked="true"]')].map(
    (el) => el.textContent ?? '',
  )
}

describe('QuestBoardPanel default timer', () => {
  it('pre-selects the default timer on every guild contract', () => {
    useGameSettingsStore.getState().setDefaultTimer(20)
    view = render(<QuestBoardPanel />)
    const checked = checkedTimers(view.container)
    expect(checked.length).toBeGreaterThan(0)
    expect(new Set(checked)).toEqual(new Set(['20m']))
  })

  it('lets a card switch back to no timer', () => {
    useGameSettingsStore.getState().setDefaultTimer(20)
    view = render(<QuestBoardPanel />)
    const noTimer = view.container.querySelector('[role="radiogroup"][aria-label="Time limit"] [role="radio"]') as HTMLButtonElement
    act(() => noTimer.click())
    expect(checkedTimers(view.container)[0]).toBe('No timer')
  })
})
