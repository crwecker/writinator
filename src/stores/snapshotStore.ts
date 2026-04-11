import * as localforage from 'localforage'
import type { Book, Snapshot } from '../types'
import { countWords } from '../lib/words'

const MAX_SNAPSHOTS_PER_DOCUMENT = 100
const STORAGE_PREFIX = 'writinator-snapshots-'

// Serialize writes per document to prevent concurrent reads from clobbering each other
const writeQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(documentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(documentId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  writeQueues.set(documentId, next)
  return next
}

async function loadSnapshots(documentId: string): Promise<Snapshot[]> {
  return (await localforage.getItem<Snapshot[]>(STORAGE_PREFIX + documentId)) ?? []
}

async function saveSnapshots(documentId: string, snapshots: Snapshot[]): Promise<void> {
  await localforage.setItem(STORAGE_PREFIX + documentId, snapshots)
}

export function createSnapshot(
  documentId: string,
  content: string,
  trigger: Snapshot['trigger']
): Promise<Snapshot | null> {
  if (!content || content.trim() === '') return Promise.resolve(null)

  return enqueue(documentId, async () => {
    const snapshots = await loadSnapshots(documentId)

    // Skip if content is identical to the most recent snapshot
    if (snapshots.length > 0 && snapshots[0].content === content) {
      return null
    }

    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      documentId,
      content,
      wordCount: countWords(content),
      timestamp: new Date().toISOString(),
      trigger,
    }

    const updated = [snapshot, ...snapshots].slice(0, MAX_SNAPSHOTS_PER_DOCUMENT)
    await saveSnapshots(documentId, updated)
    return snapshot
  })
}

export async function getSnapshots(documentId: string): Promise<Snapshot[]> {
  return loadSnapshots(documentId)
}

export async function restoreSnapshot(
  documentId: string,
  snapshotId: string
): Promise<Snapshot | null> {
  const snapshots = await loadSnapshots(documentId)
  return snapshots.find((s) => s.id === snapshotId) ?? null
}

export async function deleteAllSnapshots(documentId: string): Promise<void> {
  await localforage.removeItem(STORAGE_PREFIX + documentId)
}

export async function getAllSnapshots(): Promise<Record<string, Snapshot[]>> {
  const result: Record<string, Snapshot[]> = {}
  const keys = await localforage.keys()
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      const documentId = key.slice(STORAGE_PREFIX.length)
      const snapshots = await localforage.getItem<Snapshot[]>(key)
      if (snapshots && snapshots.length > 0) {
        result[documentId] = snapshots
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
  for (const [documentId, docSnapshots] of Object.entries(snapshots)) {
    await localforage.setItem(STORAGE_PREFIX + documentId, docSnapshots)
  }
}

/**
 * Snapshot all documents in a book that have non-empty content.
 * Uses 'closeBook' trigger so history UI can distinguish these from manual saves.
 */
export async function snapshotBook(book: Book, trigger: Snapshot['trigger']): Promise<void> {
  await Promise.all(
    book.documents
      .filter((doc) => doc.content && doc.content.trim() !== '')
      .map((doc) => createSnapshot(doc.id, doc.content!, trigger))
  )
}

export function deleteSnapshot(
  documentId: string,
  snapshotId: string
): Promise<void> {
  return enqueue(documentId, async () => {
    const snapshots = await loadSnapshots(documentId)
    const filtered = snapshots.filter((s) => s.id !== snapshotId)
    await saveSnapshots(documentId, filtered)
  })
}
