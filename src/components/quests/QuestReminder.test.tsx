import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestReminder } from './QuestReminder'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'
import { render, type Rendered } from '../../test/render'
import { useStoryletStore } from '../../stores/storyletStore'

let view: Rendered | null = null

beforeEach(() => {
  vi.useFakeTimers()
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
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
})
