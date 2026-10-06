import type { WritinatorFile } from '../types'
import { fileChangedSinceLastSync, hasFileHandle, parseFileJSON, readStoredFile } from './fileSystem'
import { createSnapshot } from '../stores/snapshotStore'
import { useStoryletStore } from '../stores/storyletStore'
import { useCharacterStore } from '../stores/characterStore'
import { useNotesStore } from '../stores/notesStore'
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
 *                  from the disk version in History ('fileOnReconnect'), and
 *                  add anything that exists only on disk (see mergeDiskOnly)
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
      const added = mergeDiskOnly(file)
      useStoryletStore.getState().markFileVersionSeen(Math.max(fileCounter, localCounter), file.saveId)
      showToast(
        `The file changed on disk while you had unsaved edits. Kept your version; the file’s version is in History.${
          added > 0 ? ` ${added} storylet${added === 1 ? '' : 's'} found only on disk ${added === 1 ? 'was' : 'were'} added, marked “(from disk)”.` : ''
        } Save again to update the file.`,
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

/**
 * Adds what exists only in the disk version — storylets, characters, stat
 * markers and notes — to the local book, so the next save doesn't drop them.
 * Local wins wherever both have the same id. Returns how many storylets were
 * added; they go at the end, named "… (from disk)".
 */
function mergeDiskOnly(file: WritinatorFile): number {
  const { book } = useStoryletStore.getState()
  if (!book) return 0

  const localIds = new Set(book.storylets.map((s) => s.id))
  const diskOnly = file.book.storylets.filter((s) => !localIds.has(s.id))
  if (diskOnly.length > 0) {
    const allIds = new Set([...localIds, ...diskOnly.map((s) => s.id)])
    const added = diskOnly.map(({ parentId, ...storylet }) => ({
      ...storylet,
      name: `${storylet.name} (from disk)`,
      ...(parentId && allIds.has(parentId) ? { parentId } : {}),
    }))
    useStoryletStore.setState({
      book: { ...book, storylets: [...book.storylets, ...added], updatedAt: new Date().toISOString() },
    })
  }

  const { characters, markers } = useCharacterStore.getState()
  const localCharacterIds = new Set(characters.map((c) => c.id))
  const diskCharacters = (file.characters ?? []).filter((c) => !localCharacterIds.has(c.id))
  const diskMarkers = Object.entries(file.markers ?? {}).filter(([id]) => !(id in markers))
  if (diskCharacters.length > 0 || diskMarkers.length > 0) {
    useCharacterStore.setState({
      characters: [...characters, ...diskCharacters],
      markers: { ...Object.fromEntries(diskMarkers), ...markers },
    })
  }

  if (file.notes) {
    const { positionNotes, storyletNotes } = useNotesStore.getState()
    useNotesStore.setState({
      positionNotes: { ...file.notes.positionNotes, ...positionNotes },
      storyletNotes: {
        ...Object.fromEntries(Object.entries(file.notes.storyletNotes).filter(([id]) => !localIds.has(id))),
        ...storyletNotes,
      },
    })
  }

  return diskOnly.length
}
