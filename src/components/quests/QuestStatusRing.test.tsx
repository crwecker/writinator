import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestStatusRing } from './QuestStatusRing'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { makeSession } from '../../test/questFixtures'
import { render, type Rendered } from '../../test/render'

let view: Rendered | null = null

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
})

afterEach(() => {
  view?.unmount()
  view = null
})

describe('QuestStatusRing', () => {
  it('renders nothing without an active quest', () => {
    view = render(<QuestStatusRing onOpen={() => {}} />)
    expect(view.container.innerHTML).toBe('')
  })

  it('shows the quest closest to done, and follows progress', () => {
    useImageRevealStore.setState({
      activeSessions: [
        makeSession('a', { wordGoal: 2000, wordsWritten: 900 }),
        makeSession('b', { wordGoal: 500, wordsWritten: 312 }),
      ],
    })
    view = render(<QuestStatusRing onOpen={() => {}} />)
    expect(view.container.textContent).toContain('312 / 500')
    act(() => useImageRevealStore.getState().addWords(10))
    expect(view.container.textContent).toContain('322 / 500')
  })

  it('opens the journal on click', () => {
    const onOpen = vi.fn()
    useImageRevealStore.setState({ activeSessions: [makeSession('a', { wordsWritten: 5 })] })
    view = render(<QuestStatusRing onOpen={onOpen} />)
    act(() => view!.container.querySelector('button')!.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('stays visible in quiet mode', () => {
    useGameSettingsStore.getState().setQuietMode(true)
    useImageRevealStore.setState({ activeSessions: [makeSession('a', { wordsWritten: 5 })] })
    view = render(<QuestStatusRing onOpen={() => {}} />)
    expect(view.container.textContent).toContain('5 / 100')
  })
})
