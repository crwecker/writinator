import * as localforage from 'localforage'
import { createKeyedQueue } from '../lib/keyedQueue'
import type { Book, Snapshot } from '../types'
import { countWords } from '../lib/words'

const STORAGE_PREFIX = 'writinator-snapshots-'

/** History-list label for each snapshot trigger. */
export const SNAPSHOT_TRIGGER_LABELS: Record<Snapshot['trigger'], string> = {
  manual: 'save',
  switch: 'switch',
  auto: 'auto',
  closeBook: 'close',
  bulkReplace: 'replace',
  orphan: 'orphan (before new file)',
  fileOnReconnect: 'file on reconnect',
}

/** Snapshots taken in the normal course of writing, as opposed to ones that
 *  preserve text about to be replaced (another file, a bulk replace, a
 *  diverged disk version) or that the user asked for. */
const ROUTINE_TRIGGERS: ReadonlySet<Snapshot['trigger']> = new Set(['auto', 'switch'])
const MAX_ROUTINE_PER_STORYLET = 100
const MAX_RECOVERY_PER_STORYLET = 100

/**
 * Cap a storylet's history (newest first). Routine and recovery snapshots
 * have separate caps, so a burst of routine snapshots can never push out the
 * copy taken before a file was opened or text was bulk-replaced.
 */
export function pruneSnapshots(snapshots: Snapshot[]): Snapshot[] {
  let routine = 0
  let recovery = 0
  return snapshots.filter((s) =>
    ROUTINE_TRIGGERS.has(s.trigger)
      ? ++routine <= MAX_ROUTINE_PER_STORYLET
      : ++recovery <= MAX_RECOVERY_PER_STORYLET
  )
}

// Serialize writes per storylet to prevent concurrent reads from clobbering each other
const enqueue = createKeyedQueue()

async function loadSnapshots(storyletId: string): Promise<Snapshot[]> {
  return (await localforage.getItem<Snapshot[]>(STORAGE_PREFIX + storyletId)) ?? []
}

async function saveSnapshots(storyletId: string, snapshots: Snapshot[]): Promise<void> {
  await localforage.setItem(STORAGE_PREFIX + storyletId, snapshots)
}

export function createSnapshot(
  storyletId: string,
  content: string,
  trigger: Snapshot['trigger']
): Promise<Snapshot | null> {
  if (!content || content.trim() === '') return Promise.resolve(null)

  return enqueue(storyletId, async () => {
    const snapshots = await loadSnapshots(storyletId)

    // Skip if content is identical to the most recent snapshot
    if (snapshots.length > 0 && snapshots[0].content === content) {
      return null
    }

    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      storyletId,
      content,
      wordCount: countWords(content),
      timestamp: new Date().toISOString(),
      trigger,
    }

    const updated = pruneSnapshots([snapshot, ...snapshots])
    await saveSnapshots(storyletId, updated)
    return snapshot
  })
}

export async function getSnapshots(storyletId: string): Promise<Snapshot[]> {
  return loadSnapshots(storyletId)
}

export async function restoreSnapshot(
  storyletId: string,
  snapshotId: string
): Promise<Snapshot | null> {
  const snapshots = await loadSnapshots(storyletId)
  return snapshots.find((s) => s.id === snapshotId) ?? null
}

export async function deleteAllSnapshots(storyletId: string): Promise<void> {
  await localforage.removeItem(STORAGE_PREFIX + storyletId)
}

export async function getAllSnapshots(): Promise<Record<string, Snapshot[]>> {
  const result: Record<string, Snapshot[]> = {}
  const keys = await localforage.keys()
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      const storyletId = key.slice(STORAGE_PREFIX.length)
      const snapshots = await localforage.getItem<Snapshot[]>(key)
      if (snapshots && snapshots.length > 0) {
        result[storyletId] = snapshots
      }
    }
  }
  return result
}

export async function loadSnapshotsFromFile(
  snapshots: Record<string, Snapshot[]>
): Promise<void> {
  // Clear existing snapshot keys
  const keys = await localforage.keys()
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      await localforage.removeItem(key)
    }
  }
  // Bulk-load from file
  for (const [storyletId, storyletSnapshots] of Object.entries(snapshots)) {
    await localforage.setItem(STORAGE_PREFIX + storyletId, storyletSnapshots)
  }
}

/**
 * Snapshot all storylets in a book that have non-empty content.
 * Uses 'closeBook' trigger so history UI can distinguish these from manual saves.
 */
export async function snapshotBook(book: Book, trigger: Snapshot['trigger']): Promise<void> {
  await Promise.all(
    book.storylets
      .filter((storylet) => storylet.content && storylet.content.trim() !== '')
      .map((storylet) => createSnapshot(storylet.id, storylet.content!, trigger))
  )
}

export function deleteSnapshot(
  storyletId: string,
  snapshotId: string
): Promise<void> {
  return enqueue(storyletId, async () => {
    const snapshots = await loadSnapshots(storyletId)
    const filtered = snapshots.filter((s) => s.id !== snapshotId)
    await saveSnapshots(storyletId, filtered)
  })
}
