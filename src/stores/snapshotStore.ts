import * as localforage from 'localforage'
import type { Snapshot } from '../types'

const MAX_SNAPSHOTS_PER_DOCUMENT = 20
const STORAGE_PREFIX = 'writinator-snapshots-'

// Serialize writes per document to prevent concurrent reads from clobbering each other
const writeQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(documentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(documentId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  writeQueues.set(documentId, next)
  return next
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
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
