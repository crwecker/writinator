import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStoryletStore } from './storyletStore'
import { useCharacterStore } from './characterStore'
import { getSnapshots } from './snapshotStore'
import { useNotesStore } from './notesStore'
import { useMetricsStore } from './metricsStore'
import { useWriteathonStore } from './writeathonStore'
import { useImageRevealStore } from './imageRevealStore'
import { todayKey } from '../lib/metrics'
import { computeStateAt } from '../lib/characterState'
import {
  delta,
  makeBook,
  makeCharacter,
  makeFile,
  makeStorylet,
  seedCharacters,
  seedStore,
  storyletContent,
} from '../test/fixtures'

const store = () => useStoryletStore.getState()

beforeEach(() => {
  vi.useFakeTimers()
  seedStore(makeBook([makeStorylet('a', 'Chapter A'), makeStorylet('b', 'Chapter B')]), 'a')
  seedCharacters([], {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pending edits', () => {
  it('saves an edit to the storylet it was typed in, even if the active storylet changed', () => {
    store().updateStoryletContent('Chapter A, typed in A', 'a')
    useStoryletStore.setState({ activeStoryletId: 'b' })
    vi.advanceTimersByTime(2000)

    expect(storyletContent('a')).toBe('Chapter A, typed in A')
    expect(storyletContent('b')).toBe('Chapter B')
  })

  it('keeps the last edits when a new storylet is added', () => {
    store().updateStoryletContent('Chapter A, latest typing')
    const newId = store().addStorylet()
    vi.advanceTimersByTime(2000)

    expect(storyletContent('a')).toBe('Chapter A, latest typing')
    expect(storyletContent(newId)).toBeNull()
  })

  it('duplicating a storylet copies its latest text', () => {
    store().updateStoryletContent('Chapter A, latest typing')
    const copyId = store().duplicateStorylet('a')
    vi.advanceTimersByTime(2000)

    expect(storyletContent('a')).toBe('Chapter A, latest typing')
    expect(storyletContent(copyId)).toBe('Chapter A, latest typing')
  })

  it('saves a storylet that was cleared to empty (debounced)', () => {
    store().updateStoryletContent('')
    vi.advanceTimersByTime(2000)

    expect(storyletContent('a')).toBe('')
  })

  it('saves a storylet that was cleared to empty (flush)', () => {
    store().updateStoryletContent('')
    store()._flushContentUpdate()

    expect(storyletContent('a')).toBe('')
  })

  it('saves pending edits when the page is hidden or closed', () => {
    store().updateStoryletContent('typed just before closing the tab')
    window.dispatchEvent(new Event('pagehide'))
    expect(storyletContent('a')).toBe('typed just before closing the tab')

    store().updateStoryletContent('typed just before switching apps')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect(storyletContent('a')).toBe('typed just before switching apps')
  })
})

describe('safety snapshots', () => {
  it('closeBook snapshots the latest typing', async () => {
    vi.useRealTimers()
    store().updateStoryletContent('newest words before closing')
    await store().closeBook()

    const snaps = await getSnapshots('a')
    expect(snaps[0]?.content).toBe('newest words before closing')
  })

  it('loadFile snapshots the latest typing of the book it replaces', async () => {
    vi.useRealTimers()
    store().updateStoryletContent('newest words before opening another file')
    await store().loadFile(makeFile(makeBook([makeStorylet('x', 'Other book')], 'book-2')))

    const snaps = await getSnapshots('a')
    expect(snaps[0]?.content).toBe('newest words before opening another file')
  })

  it('loadFile tells the editor to reload even when the storylet id is unchanged', async () => {
    vi.useRealTimers()
    const before = store().bookLoadNonce
    await store().loadFile(makeFile(makeBook([makeStorylet('a', 'Chapter A from disk')])))

    expect(store().bookLoadNonce).not.toBe(before)
    expect(storyletContent('a')).toBe('Chapter A from disk')
  })
})

describe('duplicateStorylet and stat markers', () => {
  const MARKER = '11111111-2222-3333-4444-555555555555'

  beforeEach(() => {
    const hero = makeCharacter('hero', [{ id: 'gold', name: 'Gold', type: 'number' }], {
      gold: { kind: 'number', value: 0 },
    })
    seedCharacters([hero], { [MARKER]: [delta('hero', { kind: 'adjust', statId: 'gold', delta: 50 })] })
    seedStore(makeBook([makeStorylet('a', `Found gold <!-- stat:${MARKER} --> today.`)]), 'a')
  })

  it('copies the stat markers as independent copies with their own ids', () => {
    const copyId = store().duplicateStorylet('a')
    const copy = storyletContent(copyId) ?? ''
    const copyMarkerId = copy.match(/<!-- stat:([A-Za-z0-9-]+) -->/)?.[1]

    expect(copyMarkerId).toBeDefined()
    expect(copyMarkerId).not.toBe(MARKER)
    expect(copy.replace(copyMarkerId!, MARKER)).toBe(storyletContent('a'))
    const markers = useCharacterStore.getState().markers
    expect(markers[copyMarkerId!]?.map((d) => d.op)).toEqual(markers[MARKER]?.map((d) => d.op))
  })

  it('the copy applies its stat changes too (a duplicated +50 Gold adds another 50)', () => {
    store().duplicateStorylet('a')
    const { characters, markers } = useCharacterStore.getState()
    const result = computeStateAt(characters[0], store().book!, markers)

    expect(result.effective.gold).toEqual({ kind: 'number', value: 100 })
  })
})

describe('word accounting', () => {
  const grossToday = () => useMetricsStore.getState().dayBuckets[todayKey()]?.gross ?? 0

  beforeEach(() => {
    useMetricsStore.setState({ dayBuckets: {}, session: null })
  })

  it('an undo or snapshot restore does not count as words written', () => {
    const addWords = vi.spyOn(useImageRevealStore.getState(), 'addWords')
    store().updateStoryletContent('Chapter A one two three four', 'a', { countAsWriting: false })
    store()._flushContentUpdate()

    expect(storyletContent('a')).toBe('Chapter A one two three four')
    expect(grossToday()).toBe(0)
    expect(addWords).not.toHaveBeenCalled()
  })

  it('counts only the typing when it shares a save window with an undo', () => {
    store().updateStoryletContent('Chapter A restored restored restored', 'a', { countAsWriting: false })
    store().updateStoryletContent('Chapter A restored restored restored typed', 'a')
    vi.advanceTimersByTime(2000)

    expect(storyletContent('a')).toBe('Chapter A restored restored restored typed')
    expect(grossToday()).toBe(1)
  })

  it('still counts ordinary typing', () => {
    store().updateStoryletContent('Chapter A and more words')
    vi.advanceTimersByTime(2000)

    expect(grossToday()).toBe(3)
  })
})

describe('opening a different book', () => {
  const note = { id: 'n1', storyletId: 'a', body: 'old note', tags: [], createdAt: 'x', updatedAt: 'x' }
  const bucket = { gross: 500, net: 500, minutesActive: 10, lastMinuteIndex: null }

  beforeEach(() => {
    vi.useRealTimers()
    useNotesStore.setState({ storyletNotes: { a: [note] }, positionNotes: {} })
    useMetricsStore.setState({ dayBuckets: { '2026-01-01': bucket } })
    useWriteathonStore.setState({ dailyQuestAccepted: true })
  })

  it('does not carry the previous book’s notes, metrics or quests into a file that has none', async () => {
    await store().loadFile(makeFile(makeBook([makeStorylet('x', 'Other book')], 'book-2')))

    expect(useNotesStore.getState().storyletNotes).toEqual({})
    expect(useMetricsStore.getState().dayBuckets).toEqual({})
    expect(useWriteathonStore.getState().dailyQuestAccepted).toBe(false)
  })

  it('keeps them when reopening the same book from an older file', async () => {
    await store().loadFile(makeFile(makeBook([makeStorylet('a', 'Chapter A')])))

    expect(useNotesStore.getState().storyletNotes).toEqual({ a: [note] })
    expect(useMetricsStore.getState().dayBuckets).toEqual({ '2026-01-01': bucket })
    expect(useWriteathonStore.getState().dailyQuestAccepted).toBe(true)
  })
})
