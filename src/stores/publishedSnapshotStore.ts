import * as localforage from 'localforage'
import type { PublishedSnapshot } from '../types'

const STORAGE_PREFIX = 'writinator-published-'

const writeQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(storyletId: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(storyletId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  writeQueues.set(storyletId, next)
  return next
}

async function loadPublished(storyletId: string): Promise<PublishedSnapshot[]> {
  return (await localforage.getItem<PublishedSnapshot[]>(STORAGE_PREFIX + storyletId)) ?? []
}

async function savePublished(storyletId: string, snapshots: PublishedSnapshot[]): Promise<void> {
  await localforage.setItem(STORAGE_PREFIX + storyletId, snapshots)
}

export function createPublishedSnapshot(
  storyletId: string,
  content: string,
  metadata: { name: string; version?: string; label?: string }
): Promise<PublishedSnapshot> {
  return enqueue(storyletId, async () => {
    const existing = await loadPublished(storyletId)

    const snapshot: PublishedSnapshot = {
      id: crypto.randomUUID(),
      storyletId,
      name: metadata.name,
      ...(metadata.version !== undefined ? { version: metadata.version } : {}),
      ...(metadata.label !== undefined ? { label: metadata.label } : {}),
      publishedAt: new Date().toISOString(),
      content,
      format: 'markdown',
    }

    await savePublished(storyletId, [snapshot, ...existing])
    return snapshot
  })
}

export async function getPublishedSnapshots(storyletId: string): Promise<PublishedSnapshot[]> {
  return loadPublished(storyletId)
}

export function deletePublishedSnapshot(
  storyletId: string,
  snapshotId: string
): Promise<void> {
  return enqueue(storyletId, async () => {
    const snapshots = await loadPublished(storyletId)
    const filtered = snapshots.filter((s) => s.id !== snapshotId)
    await savePublished(storyletId, filtered)
  })
}

export async function deleteAllPublishedSnapshots(storyletId: string): Promise<void> {
  await localforage.removeItem(STORAGE_PREFIX + storyletId)
}

export async function getAllPublishedSnapshots(): Promise<Record<string, PublishedSnapshot[]>> {
  const result: Record<string, PublishedSnapshot[]> = {}
  const keys = await localforage.keys()
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      const storyletId = key.slice(STORAGE_PREFIX.length)
      const snapshots = await localforage.getItem<PublishedSnapshot[]>(key)
      if (snapshots && snapshots.length > 0) {
        result[storyletId] = snapshots
      }
    }
  }
  return result
}

export async function loadPublishedSnapshotsFromFile(
  snapshots: Record<string, PublishedSnapshot[]>
): Promise<void> {
  const keys = await localforage.keys()
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      await localforage.removeItem(key)
    }
  }
  for (const [storyletId, storyletSnapshots] of Object.entries(snapshots)) {
    await localforage.setItem(STORAGE_PREFIX + storyletId, storyletSnapshots)
  }
}
