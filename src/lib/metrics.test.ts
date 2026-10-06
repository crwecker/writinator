import { describe, expect, it } from 'vitest'
import { chartYRange, loadSnapshotBackfill } from './metrics'
import { localforageMemory } from '../test/setup'
import type { Snapshot } from '../types'

function snap(storyletId: string, day: number, wordCount: number): Snapshot {
  return {
    id: `${storyletId}-${day}`,
    storyletId,
    content: 'x',
    wordCount,
    timestamp: new Date(2026, 0, day, 12).toISOString(),
    trigger: 'auto',
  }
}

describe('snapshot backfill', () => {
  it('carries each storylet’s last known count into days it wasn’t snapshotted', async () => {
    localforageMemory.set('writinator-snapshots-a', [snap('a', 2, 120), snap('a', 1, 100)])
    localforageMemory.set('writinator-snapshots-b', [snap('b', 1, 50)])

    const points = await loadSnapshotBackfill(['a', 'b'])

    expect(points).toEqual([
      { date: '2026-01-01', bookWords: 150 },
      { date: '2026-01-02', bookWords: 170 },
    ])
  })

  it('only counts this book’s storylets', async () => {
    localforageMemory.set('writinator-snapshots-a', [snap('a', 1, 100)])
    localforageMemory.set('writinator-snapshots-other', [snap('other', 1, 9999)])

    const points = await loadSnapshotBackfill(['a'])

    expect(points).toEqual([{ date: '2026-01-01', bookWords: 100 }])
  })
})

describe('chart Y range', () => {
  it('includes negative values (days with more deleted than written)', () => {
    const { yMin, yMax } = chartYRange([200, -300, 50])
    expect(yMin).toBeLessThanOrEqual(-300)
    expect(yMax).toBeGreaterThanOrEqual(200)
  })

  it('starts at zero when nothing is negative', () => {
    expect(chartYRange([10, 20]).yMin).toBe(0)
  })
})
