import type { WritinatorFile } from '../types'
import { hasFileHandle, parseFileJSON, readStoredFile } from './fileSystem'
import { createSnapshot } from '../stores/snapshotStore'
import { useStoryletStore } from '../stores/storyletStore'
import { showToast } from '../stores/genericToastStore'

export type ReconcileResult =
  | { kind: 'in-sync' }
  | { kind: 'hot-reload'; file: WritinatorFile }
  | { kind: 'diverged'; file: WritinatorFile; localCounter: number; fileCounter: number }
  | { kind: 'no-handle' }

/**
 * Compares the on-disk file (via stored FileSystemFileHandle) against the
 * in-memory store's saveCounter and takes action:
 *
 *  - no-handle   : no handle is available
 *  - in-sync     : counters match
 *  - hot-reload  : file is newer — load it into the store
 *  - diverged    : local is newer — snapshot each file storylet with
 *                  'fileOnReconnect' for later review
 */
export async function reconcileWithFile(): Promise<ReconcileResult> {
  try {
    if (!hasFileHandle()) {
      return { kind: 'no-handle' }
    }

    const read = await readStoredFile()
    if (!read) {
      return { kind: 'no-handle' }
    }
    const file = parseFileJSON(read.text)
    if (!file) {
      console.warn('[reconcile] could not parse file — treating as no-handle')
      return { kind: 'no-handle' }
    }

    const fileCounter = file.saveCounter
    const localCounter = useStoryletStore.getState().lastSavedCounter

    let result: ReconcileResult

    if (fileCounter === localCounter) {
      result = { kind: 'in-sync' }
    } else if (fileCounter > localCounter) {
      // File is ahead — hot-reload
      useStoryletStore.getState().loadFile(file)
      useStoryletStore.getState().setLastSaved(file.saveCounter, Date.now())
      result = { kind: 'hot-reload', file }
    } else {
      // Local is ahead (or incommensurable) — diverged
      // Snapshot each storylet from the file version for later review
      await Promise.all(
        file.book.storylets
          .filter((s) => s.content && s.content.trim() !== '')
          .map((s) => createSnapshot(s.id, s.content!, 'fileOnReconnect'))
      )
      showToast('File on disk had different content — saved as snapshot', 'warning')
      result = { kind: 'diverged', file, localCounter, fileCounter }
    }

    console.log('[reconcile]', result.kind, { localCounter, fileCounter })
    return result
  } catch (err) {
    console.warn('[reconcile] error during reconciliation:', err)
    return { kind: 'no-handle' }
  }
}
