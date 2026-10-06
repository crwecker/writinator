import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestReminder } from './QuestReminder'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'
import { render, type Rendered } from '../../test/render'
import { useStoryletStore } from '../../stores/storyletStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'

let view: Rendered | null = null

beforeEach(() => {
  vi.useFakeTimers()
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  // The reminder only exists when the auto session quest is off.
  useGameSettingsStore.getState().setAutoQuest({ enabled: false })
  seedStore(makeBook([makeStorylet('s1', 'one two')]))
})

afterEach(() => {
  view?.unmount()
  view = null
  vi.useRealTimers()
})

function isShown(container: HTMLElement): boolean {
  return container.querySelector('.translate-y-0') !== null
}

describe('QuestReminder', () => {
  it('appears 5s after writing starts, even if the parent re-renders meanwhile', () => {
    view = render(<QuestReminder onStartQuest={() => {}} />)
    expect(isShown(view.container)).toBe(false)

    act(() => {
      seedStore(makeBook([makeStorylet('s1', 'one two three four')]))
    })
    act(() => { vi.advanceTimersByTime(1000) })
    // Parent re-render (AppShell used to re-render on every keystroke)
    view.rerender(<QuestReminder onStartQuest={() => {}} />)
    act(() => {
      useStoryletStore.setState({ lastSavedCounter: 1 })
    })
    act(() => { vi.advanceTimersByTime(4500) })

    expect(isShown(view.container)).toBe(true)
  })

  function writeAndWait(view: Rendered) {
    act(() => {
      seedStore(makeBook([makeStorylet('s1', 'one two three four')]))
    })
    act(() => { vi.advanceTimersByTime(6000) })
    void view
  }

  it('never appears while the auto session quest is on (it would be redundant)', () => {
    useGameSettingsStore.getState().setAutoQuest({ enabled: true })
    view = render(<QuestReminder onStartQuest={() => {}} />)
    writeAndWait(view)
    expect(view.container.innerHTML).toBe('')
  })

  it('never appears in quiet mode', () => {
    useGameSettingsStore.getState().setQuietMode(true)
    view = render(<QuestReminder onStartQuest={() => {}} />)
    writeAndWait(view)
    expect(view.container.innerHTML).toBe('')
  })
})
