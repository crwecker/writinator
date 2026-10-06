import type { WritinatorFile } from '../types'
import { fileChangedSinceLastSync, hasFileHandle, parseFileJSON, readStoredFile } from './fileSystem'
import { createSnapshot } from '../stores/snapshotStore'
import { useStoryletStore } from '../stores/storyletStore'
import { showToast } from '../stores/genericToastStore'

export type ReconcileResult =
  | { kind: 'in-sync' }
  | { kind: 'hot-reload'; file: WritinatorFile }
  | { kind: 'diverged'; file: WritinatorFile; localCounter: number; fileCounter: number }
  | { kind: 'no-handle' }

/**
 * Compares the on-disk file (via stored handle or Tauri path) with what this
 * app last saved or loaded, and takes action:
 *
 *  - no-handle   : no file is connected
 *  - in-sync     : the file is the version we last saved/loaded
 *  - hot-reload  : someone else saved a newer version and there are no local
 *                  edits — load it
 *  - diverged    : the file changed but we have unsaved edits (or the file is
 *                  older than ours) — keep the local book, file each storylet
 *                  from the disk version in History ('fileOnReconnect')
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

    const store = useStoryletStore.getState()
    const fileCounter = file.saveCounter
    const localCounter = store.lastSavedCounter

    let result: ReconcileResult

    if (!fileChangedSinceLastSync(file)) {
      result = { kind: 'in-sync' }
    } else if (fileCounter >= localCounter && !store.hasUnsavedChanges()) {
      // Someone else saved, and we have nothing unsaved — take their version.
      await store.loadFile(file)
      result = { kind: 'hot-reload', file }
    } else {
      // Keep local edits; preserve the disk version in History.
      await Promise.all(
        file.book.storylets
          .filter((s) => s.content && s.content.trim() !== '')
          .map((s) => createSnapshot(s.id, s.content!, 'fileOnReconnect'))
      )
      useStoryletStore.getState().markFileVersionSeen(Math.max(fileCounter, localCounter), file.saveId)
      showToast(
        'The file changed on disk while you had unsaved edits. Kept your version; the file’s version is in History. Save again to overwrite the file.',
        'warning'
      )
      result = { kind: 'diverged', file, localCounter, fileCounter }
    }

    console.log('[reconcile]', result.kind, { localCounter, fileCounter })
    return result
  } catch (err) {
    console.warn('[reconcile] error during reconciliation:', err)
    return { kind: 'no-handle' }
  }
}
