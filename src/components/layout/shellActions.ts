// Imperative actions behind AppShell's shortcuts and effects. Kept out of the
// component so they can be unit-tested without rendering the whole shell.
import type { EditorView } from '@codemirror/view'
import { useStoryletStore } from '../../stores/storyletStore'
import { useNotesStore } from '../../stores/notesStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { createSnapshot } from '../../stores/snapshotStore'
import { showToast } from '../../stores/genericToastStore'
import { quickSave, saveAsNewFile, hasFileTetherCapability } from '../../lib/fileSystem'
import { isFileLockedNow } from '../../lib/fileLock'

/**
 * Insert a note anchor at the cursor and create its note. Returns the new note
 * id, or null when the file is locked (the editor would drop the text insert,
 * leaving an orphan note).
 */
export function insertNoteAtCursor(view: EditorView): string | null {
  if (isFileLockedNow()) return null
  const { to } = view.state.selection.main
  const noteId = crypto.randomUUID()
  view.dispatch({
    changes: { from: to, to, insert: `<!-- note:${noteId} -->` },
  })
  useNotesStore.getState().addPositionNote(noteId, { body: '' })
  return noteId
}

export function saveToDisk(): Promise<void> {
  const state = useStoryletStore.getState()
  state._flushContentUpdate()
  const { book: currentBook, activeStoryletId: docId, globalSettings } = useStoryletStore.getState()
  if (!currentBook) return Promise.resolve()
  const storylet = docId ? currentBook.storylets.find((d) => d.id === docId) : null
  const snapshotPromise = storylet?.content
    ? createSnapshot(docId!, storylet.content, 'manual')
    : Promise.resolve(null)

  // No file tethering available (Safari/Firefox web): there's no file to
  // write back to, and falling through to a download triggers Safari's
  // download-permission prompt on every Cmd+S. The book already auto-persists
  // to localforage, so just confirm the snapshot and tell the user.
  if (!hasFileTetherCapability()) {
    return snapshotPromise
      .then(() => {
        showToast('Saved in browser. Use Export to download a copy.', 'success')
      })
      .catch(reportSaveFailure)
  }

  return snapshotPromise
    .then(() => quickSave(currentBook, globalSettings))
    .then(async (saved) => {
      if (!saved) await saveAsNewFile(currentBook, globalSettings)
    })
    .catch(reportSaveFailure)
}

function reportSaveFailure(err: unknown): void {
  // A cancelled file picker isn't a failure.
  if (err instanceof DOMException && err.name === 'AbortError') return
  console.error('[AppShell] save to disk failed:', err)
  const detail = err instanceof Error && err.message ? `: ${err.message}` : ''
  showToast(`Save failed${detail}`, 'error')
}

/**
 * One-time coin grant for image-reveal quests completed before coins existed.
 * Waits until both the player and image-reveal stores have hydrated from
 * storage — deciding earlier would read default state and could mark the grant
 * applied without paying it. Returns a cleanup that cancels a pending grant.
 */
export function applyRetroactiveGrant(): () => void {
  const stores = [usePlayerStore.persist, useImageRevealStore.persist]
  let cancelled = false
  const unsubs: Array<() => void> = []

  const tryGrant = () => {
    if (cancelled) return
    if (!stores.every((p) => p.hasHydrated())) return
    cancel()
    if (usePlayerStore.getState().retroactiveGrantApplied) return
    const { completedSessions } = useImageRevealStore.getState()
    const { addCoins, setRetroactiveGrantApplied } = usePlayerStore.getState()
    const successCount = completedSessions.filter((s) => s.result === 'success').length
    if (successCount > 0) {
      addCoins(successCount * 100)
    }
    setRetroactiveGrantApplied()
  }

  const cancel = () => {
    cancelled = true
    for (const u of unsubs) u()
  }

  for (const p of stores) unsubs.push(p.onFinishHydration(tryGrant))
  tryGrant()
  return cancel
}
