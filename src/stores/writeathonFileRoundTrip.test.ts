import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildWritinatorFile, parseFileJSON } from '../lib/fileSystem'
import { hydrateWriteathon, useWriteathonStore } from './writeathonStore'
import { makeBook, makeStorylet } from '../test/fixtures'

afterEach(() => {
  vi.useRealTimers()
})

describe('writeathon in book files', () => {
  it('keeps calendar dates through a save and a later open', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 9))
    useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
    useWriteathonStore.getState().startWriteathon(1000, 11_000, 10, Date.now())
    useWriteathonStore.getState().updateProgress(2500, Date.now()) // day 1 paid
    const dates = useWriteathonStore.getState().milestones.map((m) => m.date)

    const file = await buildWritinatorFile(makeBook([makeStorylet('a', 'x')]), {}, 1)
    const reopened = parseFileJSON(JSON.stringify(file))
    expect(reopened).not.toBeNull()

    // Three days later, open the file again.
    vi.setSystemTime(new Date(2026, 9, 9, 9))
    useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
    hydrateWriteathon(reopened!.writeathon)
    const s = useWriteathonStore.getState()
    expect(s.milestones.map((m) => m.date)).toEqual(dates)
    expect(s.milestones[0].completed).toBe(true)
    expect(s.lastSeenBookWords).toBe(2500)
  })
})
