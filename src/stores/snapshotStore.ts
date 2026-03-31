import * as localforage from 'localforage'
import type { Snapshot } from '../types'

const MAX_SNAPSHOTS_PER_CHAPTER = 20
const STORAGE_PREFIX = 'writinator-snapshots-'

// Serialize writes per chapter to prevent concurrent reads from clobbering each other
const writeQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(chapterId: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(chapterId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  writeQueues.set(chapterId, next)
  return next
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

async function loadSnapshots(chapterId: string): Promise<Snapshot[]> {
  return (await localforage.getItem<Snapshot[]>(STORAGE_PREFIX + chapterId)) ?? []
}

async function saveSnapshots(chapterId: string, snapshots: Snapshot[]): Promise<void> {
  await localforage.setItem(STORAGE_PREFIX + chapterId, snapshots)
}

export function createSnapshot(
  chapterId: string,
  content: string,
  trigger: Snapshot['trigger']
): Promise<Snapshot | null> {
  if (!content || content.trim() === '') return Promise.resolve(null)

  return enqueue(chapterId, async () => {
    const snapshots = await loadSnapshots(chapterId)

    // Skip if content is identical to the most recent snapshot
    if (snapshots.length > 0 && snapshots[0].content === content) {
      return null
    }

    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      chapterId,
      content,
      wordCount: countWords(content),
      timestamp: new Date().toISOString(),
      trigger,
    }

    const updated = [snapshot, ...snapshots].slice(0, MAX_SNAPSHOTS_PER_CHAPTER)
    await saveSnapshots(chapterId, updated)
    return snapshot
  })
}

export async function getSnapshots(chapterId: string): Promise<Snapshot[]> {
  return loadSnapshots(chapterId)
}

export async function restoreSnapshot(
  chapterId: string,
  snapshotId: string
): Promise<Snapshot | null> {
  const snapshots = await loadSnapshots(chapterId)
  return snapshots.find((s) => s.id === snapshotId) ?? null
}

export async function deleteAllSnapshots(chapterId: string): Promise<void> {
  await localforage.removeItem(STORAGE_PREFIX + chapterId)
}
