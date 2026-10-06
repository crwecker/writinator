import { describe, expect, it } from 'vitest'
import { createSnapshot, getSnapshots } from './snapshotStore'
import { useStoryletStore } from './storyletStore'
import type { Snapshot } from '../types'
import { makeBook, makeFile, makeStorylet, seedStore } from '../test/fixtures'

function snap(i: number, trigger: Snapshot['trigger']): Snapshot {
  return {
    id: `${trigger}-${i}`,
    storyletId: 'a',
    content: `${trigger} text ${i}`,
    wordCount: 3,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    trigger,
  }
}

describe('snapshot cap', () => {
  it('routine snapshots never push out a recovery snapshot', async () => {
    await createSnapshot('a', 'text before opening another file', 'orphan')
    for (let i = 0; i < 120; i++) {
      await createSnapshot('a', `typing ${i}`, 'auto')
    }
    const history = await getSnapshots('a')
    expect(history.some((s) => s.trigger === 'orphan')).toBe(true)
    expect(history.filter((s) => s.trigger === 'auto').length).toBeLessThanOrEqual(100)
    expect(history[0].content).toBe('typing 119')
  })

  it('opening a file keeps local recovery snapshots even when the file has a full history', async () => {
    seedStore(makeBook([makeStorylet('a', 'local text')]), 'a')
    // The local recovery snapshot is older than every snapshot in the file.
    await useStoryletStore.getState().loadFile(makeFile(makeBook([makeStorylet('a', 'x')]), {
      snapshots: { a: [snap(0, 'fileOnReconnect')] },
    }))
    const fileHistory = Array.from({ length: 100 }, (_, i) => snap(100 - i, 'auto'))
    await useStoryletStore.getState().loadFile(makeFile(makeBook([makeStorylet('a', 'y')]), {
      snapshots: { a: fileHistory },
    }))
    const history = await getSnapshots('a')
    expect(history.some((s) => s.id === 'fileOnReconnect-0')).toBe(true)
  })
})
