import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installSessionTracker, resetSessionTracker, RECAP_IDLE_MS, useSessionRecapStore } from './sessionRecap'
import { SessionRecapCard } from './SessionRecapCard'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { useRecordsStore } from '../../stores/recordsStore'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'
import { makeSession } from '../../test/questFixtures'
import { render, type Rendered } from '../../test/render'

let uninstall: () => void = () => {}
let view: Rendered | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-01T10:00:00Z'))
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  seedStore(makeBook([makeStorylet('s1', 'hello')]))
  useRecordsStore.setState({ breaks: [] })
  resetSessionTracker()
  uninstall = installSessionTracker()
})

afterEach(() => {
  view?.unmount()
  view = null
  uninstall()
  vi.useRealTimers()
})

const write = (n: number) => useImageRevealStore.getState().addWords(n)
const recap = () => useSessionRecapStore.getState().recap

describe('session recap', () => {
  it('appears after 10 idle minutes with words, minutes, quests and coins', () => {
    useImageRevealStore.setState({ activeSessions: [makeSession('a', { wordGoal: 100 })] })
    write(60)
    vi.advanceTimersByTime(90_000)
    write(40) // finishes the quest: 10 coins
    vi.advanceTimersByTime(RECAP_IDLE_MS - 1000)
    expect(recap()).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(recap()).toEqual({ words: 100, minutesActive: 2, questsFinished: 1, coinsEarned: 10, reason: 'idle', records: [] })
  })

  it('does not appear when nothing was written', () => {
    vi.advanceTimersByTime(RECAP_IDLE_MS * 2)
    expect(recap()).toBeNull()
  })

  it('writing again restarts the idle clock', () => {
    write(5)
    vi.advanceTimersByTime(RECAP_IDLE_MS - 1000)
    write(5)
    vi.advanceTimersByTime(RECAP_IDLE_MS - 1000)
    expect(recap()).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(recap()?.words).toBe(10)
  })

  it('appears right away when the book is closed', () => {
    write(25)
    useStoryletStore.setState({ book: null })
    expect(recap()).toMatchObject({ words: 25, reason: 'close' })
  })

  it('starts a fresh tally after a recap', () => {
    write(25)
    vi.advanceTimersByTime(RECAP_IDLE_MS)
    useSessionRecapStore.getState().dismiss()
    write(3)
    vi.advanceTimersByTime(RECAP_IDLE_MS)
    expect(recap()).toMatchObject({ words: 3, minutesActive: 1, questsFinished: 0, coinsEarned: 0 })
  })
})

describe('session recap personal bests', () => {
  it('includes records set or improved during the session, not older ones', () => {
    const t0 = Date.now()
    useRecordsStore.setState({
      breaks: [
        { kind: 'week', periodKey: 'old', value: 9000, previous: 8000, at: t0 - 86_400_000, updatedAt: t0 - 86_400_000 },
        { kind: 'day', periodKey: '2026-05-01', value: 2100, previous: 2000, at: t0 + 1000, updatedAt: t0 + 1000 },
      ],
    })
    write(5)
    vi.advanceTimersByTime(RECAP_IDLE_MS)
    expect(recap()?.records).toEqual([{ kind: 'day', periodKey: '2026-05-01', value: 2100, previous: 2000, at: t0 + 1000, updatedAt: t0 + 1000 }])
  })
})

describe('SessionRecapCard', () => {
  const data = { words: 1234, minutesActive: 42, questsFinished: 2, coinsEarned: 180, reason: 'idle' as const, records: [] }

  it('shows a personal best row when a record fell', () => {
    useSessionRecapStore.setState({
      recap: { ...data, records: [{ kind: 'day', periodKey: 'd', value: 2100, previous: 2000, at: 1, updatedAt: 1 }] },
    })
    view = render(<SessionRecapCard />)
    expect(view.container.textContent).toContain('Personal best')
    expect(view.container.textContent).toContain('Best day: 2,100 words')
  })

  it('has no personal best row otherwise', () => {
    useSessionRecapStore.setState({ recap: data })
    view = render(<SessionRecapCard />)
    expect(view.container.textContent).not.toContain('Personal best')
  })

  it('shows the session numbers and closes', () => {
    useSessionRecapStore.setState({ recap: data })
    view = render(<SessionRecapCard />)
    const text = view.container.textContent ?? ''
    expect(text).toContain('1,234')
    expect(text).toContain('42')
    expect(text).toContain('180')
    const close = [...view.container.querySelectorAll('button')].find((b) => /close|done/i.test(b.textContent ?? b.getAttribute('aria-label') ?? ''))
    act(() => close!.click())
    expect(recap()).toBeNull()
    expect(view.container.innerHTML).toBe('')
  })

  it('leaves out game rows in quiet mode', () => {
    useGameSettingsStore.getState().setQuietMode(true)
    useSessionRecapStore.setState({ recap: data })
    view = render(<SessionRecapCard />)
    const text = view.container.textContent ?? ''
    expect(text).toContain('1,234')
    expect(text).not.toContain('180')
  })
})
