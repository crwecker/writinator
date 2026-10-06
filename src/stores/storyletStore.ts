import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Book, Storylet, DocumentStyles, GlobalSettings, ReplaceScope, SearchOptions, WritinatorFile } from '../types'
import { compileQuery, replaceInContent } from '../lib/bookSearch'
import { flattenDocumentStyles } from '../lib/migration'
import { escapeRegExp } from '../lib/regex'
import { createSnapshot, getAllSnapshots, loadSnapshotsFromFile, pruneSnapshots, snapshotBook } from './snapshotStore'
import { getAllPublishedSnapshots, loadPublishedSnapshotsFromFile } from './publishedSnapshotStore'
import { clearFileHandle, getHandleState, hasFileTetherCapability } from '../lib/fileSystem'
import { showToast } from './genericToastStore'
import { useImageRevealStore, hydrateImageReveal } from './imageRevealStore'
import { useWriteathonStore, hydrateWriteathon } from './writeathonStore'
import { useMetricsStore, hydrateMetrics, resetMetrics } from './metricsStore'
import { useCharacterStore } from './characterStore'
import { hydratePlayer } from './playerStore'
import { hydrateNotes, useNotesStore } from './notesStore'
import { hydrateItemCatalog, useItemCatalogStore } from './itemCatalogStore'
import { countWords } from '../lib/words'
import { countedQuestWords } from '../lib/wordAccounting'
import { localforageJSONStorage } from './localforageStorage'
import { bookFingerprint } from '../lib/fingerprint'

function createDefaultDocumentStyles(): DocumentStyles {
  return {
    body: {},
    h1: {},
    h2: {},
    h3: {},
    blockquote: {},
    code: {},
  }
}

interface StoryletState {
  book: Book | null
  activeStoryletId: string | null
  globalSettings: GlobalSettings
  hasHydrated: boolean
  lastSavedCounter: number
  lastSavedAt: number | null
  /** `saveId` of the file version we last wrote or loaded. */
  lastSavedId: string | null
  /** Fingerprint of the book as last written or loaded — differs from the
   *  current book when there are edits not yet saved to the file. */
  lastSavedFingerprint: string | null
  /** Bumped whenever a different book (or a fresh copy from disk) is loaded,
   *  so the editor reloads even when the active storylet id is unchanged. */
  bookLoadNonce: number
  _contentUpdateTimer: ReturnType<typeof setTimeout> | null
  /** Latest editor text not yet written into `book`, tagged with the storylet
   *  it was typed in so a switch can never send it to the wrong storylet. */
  _pendingContent: PendingContent | null

  // Book CRUD
  createBook: (title: string) => Promise<void>
  closeBook: () => Promise<void>
  loadFile: (file: WritinatorFile) => Promise<void>
  renameBook: (title: string) => void

  // Storylet CRUD
  addStorylet: (name?: string, parentId?: string) => string
  duplicateStorylet: (id: string) => string
  renameStorylet: (id: string, name: string) => void
  setStoryletIcon: (id: string, icon: string | undefined) => void
  setStoryletColor: (id: string, color: string | undefined) => void
  deleteStorylet: (id: string) => void
  reorderStorylets: (ids: string[]) => void
  moveStorylet: (id: string, newParentId: string | undefined, insertIndex: number) => void
  setActiveStorylet: (id: string | null) => void

  // Published snapshot meta
  setStoryletPublishedMeta: (id: string, meta: { lastPublishedAt: string; lastPublishedSnapshotId: string }) => void

  // Content
  /** Debounced write of editor text. `storyletId` defaults to the active
   *  storylet. Pass `countAsWriting: false` for changes the writer didn't
   *  type (undo/redo, restoring a snapshot) so they don't count as words
   *  written in metrics or quests. */
  updateStoryletContent: (content: string, storyletId?: string, options?: UpdateContentOptions) => void
  /** Immediately replace a storylet's text (no debounce) and make an open
   *  editor reload it. */
  setStoryletContent: (id: string, content: string) => void
  _flushContentUpdate: () => void

  // Save tracking
  setLastSaved: (counter: number, at: number, saved?: { saveId: string; book: Book }) => void
  /** Record that a version of the file has been seen (its content was kept in
   *  History) without loading it, so the next save may overwrite it. */
  markFileVersionSeen: (counter: number, saveId: string | undefined) => void
  /** True when the book has changed since it was last saved to or loaded from the file. */
  hasUnsavedChanges: () => boolean

  // Global settings
  setGlobalSettings: (settings: GlobalSettings) => void
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void
  renameStyle: (oldName: string, newName: string) => void
  replaceInlineStyleInOtherDocs: (styleString: string, className: string) => number
  replaceAllInBook: (
    options: SearchOptions,
    replacement: string,
    scope: ReplaceScope,
    targetStoryletId?: string,
  ) => { storyletsChanged: number; matchesReplaced: number }
}

interface PendingContent {
  storyletId: string
  content: string
  /** Net word change in this window from edits that don't count as writing;
   *  subtracted from the word delta at flush. */
  uncountedWords: number
}

export interface UpdateContentOptions {
  /** Default true. False for undo/redo and snapshot restores. */
  countAsWriting?: boolean
}

function generateId(): string {
  return crypto.randomUUID()
}

const CONTENT_DEBOUNCE_MS = 1500

/** Give each stat marker and note anchor in duplicated text a fresh id, with
 *  a copy of its deltas / note, so the copy can be edited independently. */
function remintMarkers(storylets: Storylet[]): Storylet[] {
  const { markers, setMarker } = useCharacterStore.getState()
  const { positionNotes, addPositionNote } = useNotesStore.getState()
  const statIds = new Map<string, string>()
  const noteIds = new Map<string, string>()
  const result = storylets.map((storylet) => {
    if (!storylet.content) return storylet
    const content = storylet.content
      .replace(/(<!--\s*stat:)([A-Za-z0-9-]+)(\s*-->)/g, (whole, open: string, id: string, close: string) => {
        if (!markers[id]) return whole
        if (!statIds.has(id)) statIds.set(id, generateId())
        return `${open}${statIds.get(id)}${close}`
      })
      .replace(/(<!--\s*note:)([A-Za-z0-9-]+)(\s*-->)/g, (whole, open: string, id: string, close: string) => {
        if (!positionNotes[id]) return whole
        if (!noteIds.has(id)) noteIds.set(id, generateId())
        return `${open}${noteIds.get(id)}${close}`
      })
    return content === storylet.content ? storylet : { ...storylet, content }
  })
  for (const [oldId, newId] of statIds) {
    setMarker(newId, markers[oldId].map((d) => ({ ...structuredClone(d), id: generateId() })))
  }
  for (const [oldId, newId] of noteIds) {
    const { body, color, tags } = positionNotes[oldId]
    addPositionNote(newId, { body, tags: [...tags], ...(color !== undefined ? { color } : {}) })
  }
  return result
}

// Book edits require a tethered file. Returns true and shows a toast
// when the book is loaded but no granted file handle is present.
// Safety net for mutation paths that might bypass UI-level disabling
// (programmatic dispatch, shortcuts, modals).
// Mirrors the logic in fileLock.ts:
//  - browsers without the File System Access API (Safari, Firefox) can never
//    tether a handle, so localforage is the source of truth — edits always OK;
//    without this the toast fires on every keystroke.
//  - 'unknown' permission is treated as OK so freshly-opened files don't
//    briefly lock while queryPermission resolves.
let lastLockToastAt = 0
function bailIfLocked(action: string): boolean {
  if (!hasFileTetherCapability()) return false
  const handle = getHandleState()
  if (handle.hasHandle && handle.permission !== 'denied' && handle.permission !== 'prompt') return false
  const ts = Date.now()
  if (ts - lastLockToastAt > 1500) {
    lastLockToastAt = ts
    showToast(`Can't ${action} — connect to a file first.`, 'warning')
  }
  return true
}

/** Walk up the parentId chain to check if docId is a descendant of ancestorId */
function isDescendant(storylets: Storylet[], docId: string, ancestorId: string): boolean {
  let currentId: string | undefined = docId
  while (currentId) {
    const storylet = storylets.find((d) => d.id === currentId)
    if (!storylet?.parentId) return false
    if (storylet.parentId === ancestorId) return true
    currentId = storylet.parentId
  }
  return false
}

/** Returns the depth of a storylet (0 for top-level / undefined id) */
function getStoryletDepth(storylets: Storylet[], id: string | undefined): number {
  let depth = 0
  let currentId = id
  while (currentId) {
    const storylet = storylets.find((d) => d.id === currentId)
    if (!storylet?.parentId) break
    depth++
    currentId = storylet.parentId
  }
  return depth
}

/** Returns the max depth below this storylet (0 if leaf) */
function getSubtreeDepth(storylets: Storylet[], id: string): number {
  const children = storylets.filter((d) => d.parentId === id)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(storylets, c.id)))
}

/** Collect a storylet and all its descendants in flat-array order */
function collectSubtree(storylets: Storylet[], id: string): Storylet[] {
  const ids = new Set<string>([id])
  let changed = true
  while (changed) {
    changed = false
    for (const storylet of storylets) {
      if (storylet.parentId && ids.has(storylet.parentId) && !ids.has(storylet.id)) {
        ids.add(storylet.id)
        changed = true
      }
    }
  }
  return storylets.filter((storylet) => ids.has(storylet.id))
}

/** Union of two per-storylet histories by entry id, newest first. `prune`
 *  caps each merged list. */
function mergeById<T extends { id: string }>(
  fromFile: Record<string, T[]>,
  local: Record<string, T[]>,
  timeOf: (entry: T) => string,
  prune: (entries: T[]) => T[] = (entries) => entries,
): Record<string, T[]> {
  const merged: Record<string, T[]> = { ...fromFile }
  for (const [storyletId, localEntries] of Object.entries(local)) {
    const fileEntries = merged[storyletId] ?? []
    const known = new Set(fileEntries.map((e) => e.id))
    const extra = localEntries.filter((e) => !known.has(e.id))
    if (extra.length === 0) continue
    const all = [...fileEntries, ...extra].sort(
      (a, b) => new Date(timeOf(b)).getTime() - new Date(timeOf(a)).getTime()
    )
    merged[storyletId] = prune(all)
  }
  return merged
}

function now(): string {
  return new Date().toISOString()
}

const localforageStorage = localforageJSONStorage<StoryletState>({
  // Fallback: the store was once persisted under the old key
  'writinator-storylet': 'writinator-document',
})

export const useStoryletStore = create<StoryletState>()(
  persist(
    (set, get) => ({
      book: null,
      activeStoryletId: null,
      globalSettings: {},
      hasHydrated: false,
      lastSavedCounter: 0,
      lastSavedAt: null,
      lastSavedId: null,
      lastSavedFingerprint: null,
      bookLoadNonce: 0,
      _contentUpdateTimer: null,
      _pendingContent: null,

      createBook: async (title: string) => {
        // Orphan-snapshot the current book (including unsaved typing) before wiping state
        get()._flushContentUpdate()
        const existingBook = get().book
        if (existingBook) {
          await snapshotBook(existingBook, 'orphan')
        }
        const timestamp = now()
        const storyletId = generateId()
        set({
          book: {
            id: generateId(),
            title,
            storylets: [
              {
                id: storyletId,
                name: 'Storylet 1',
                content: null,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          activeStoryletId: storyletId,
          globalSettings: { documentStyles: createDefaultDocumentStyles() },
          bookLoadNonce: get().bookLoadNonce + 1,
        })
      },

      loadFile: async (file: WritinatorFile) => {
        // Save unsaved typing first so the orphan snapshot has the latest text.
        get()._flushContentUpdate()
        const existingBook = get().book
        if (existingBook) {
          await snapshotBook(existingBook, 'orphan')
        }
        // Merge local history (including orphans just created) into the file's
        // so nothing is lost when local storage is replaced.
        const snapshots = mergeById(file.snapshots, await getAllSnapshots(), (s) => s.timestamp, pruneSnapshots)
        const publishedSnapshots = mergeById(
          file.publishedSnapshots ?? {},
          await getAllPublishedSnapshots(),
          (s) => s.publishedAt,
        )
        set({
          book: file.book,
          globalSettings: file.globalSettings,
          activeStoryletId: file.book.storylets[0]?.id ?? null,
          bookLoadNonce: get().bookLoadNonce + 1,
          lastSavedCounter: file.saveCounter,
          lastSavedAt: Date.now(),
          lastSavedId: file.saveId ?? null,
          lastSavedFingerprint: bookFingerprint(file.book),
          _pendingContent: null,
        })
        await loadSnapshotsFromFile(snapshots)
        await loadPublishedSnapshotsFromFile(publishedSnapshots)
        useCharacterStore.getState().loadFromFile(
          file.characters ?? [],
          file.markers ?? {}
        )
        // Hydrate cross-store sections (v7+). A section missing from an older
        // file keeps what's in browser storage when it's the same book, and
        // starts empty for a different book so the last book's data doesn't
        // carry over.
        if (existingBook?.id !== file.book.id) {
          if (!file.notes) useNotesStore.getState().reset()
          if (!file.metrics) resetMetrics()
          if (!file.writeathon) useWriteathonStore.getState().resetWriteathon()
        }
        hydratePlayer(file.player)
        hydrateImageReveal(file.quests)
        hydrateWriteathon(file.writeathon)
        hydrateMetrics(file.metrics)
        hydrateNotes(file.notes)
        hydrateItemCatalog(file.itemCatalog)
      },

      renameBook: (title: string) => {
        const { book } = get()
        if (!book) return
        if (bailIfLocked('rename book')) return
        set({ book: { ...book, title, updatedAt: now() } })
      },

      closeBook: async () => {
        get()._flushContentUpdate()
        const { book } = get()
        if (book) {
          await snapshotBook(book, 'closeBook')
        }
        // Pause timed quest timer when closing the book
        const imageRevealState = useImageRevealStore.getState()
        if (imageRevealState.activeSessions.some((s) => s.timeMinutes !== undefined)) {
          imageRevealState.pauseTimer()
        }
        clearFileHandle()
        useCharacterStore.getState().reset()
        useItemCatalogStore.getState().reset()
        set({ book: null, activeStoryletId: null, bookLoadNonce: get().bookLoadNonce + 1 })
      },

      addStorylet: (name?: string, parentId?: string) => {
        if (!get().book) return ''
        if (bailIfLocked('add storylet')) return ''
        get()._flushContentUpdate()
        const { book } = get()
        if (!book) return ''
        const id = generateId()
        const timestamp = now()
        const siblings = book.storylets.filter((s) => s.parentId === parentId)
        const storyletName = name ?? `Storylet ${siblings.length + 1}`
        const storylet: Storylet = {
          id,
          name: storyletName,
          content: null,
          ...(parentId ? { parentId } : {}),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        // Insert after last sibling of the same parent (or its descendants)
        let insertIdx = book.storylets.length
        if (parentId) {
          const parentIdx = book.storylets.findIndex((s) => s.id === parentId)
          if (parentIdx !== -1) {
            // Find the last descendant of this parent
            insertIdx = parentIdx + 1
            for (let i = parentIdx + 1; i < book.storylets.length; i++) {
              if (isDescendant(book.storylets, book.storylets[i].id, parentId)) {
                insertIdx = i + 1
              } else {
                break
              }
            }
          }
        }
        const storylets = [...book.storylets]
        storylets.splice(insertIdx, 0, storylet)
        set({
          book: { ...book, storylets, updatedAt: timestamp },
          activeStoryletId: id,
        })
        return id
      },

      duplicateStorylet: (id: string) => {
        if (!get().book) return ''
        if (bailIfLocked('duplicate storylet')) return ''
        // Copy the latest text, not the version from up to 1.5s ago.
        get()._flushContentUpdate()
        const { book } = get()
        if (!book) return ''
        const timestamp = now()

        // Collect the target storylet and all its descendants (in order)
        const target = book.storylets.find((s) => s.id === id)
        if (!target) return ''

        // Gather original storylets to copy: target + descendants in order
        const toCopy = collectSubtree(book.storylets, id)

        // Build old→new ID map
        const idMap = new Map<string, string>()
        for (const storylet of toCopy) {
          idMap.set(storylet.id, generateId())
        }

        // Create copies with remapped IDs (stat markers and notes get their own copies too)
        const copies: Storylet[] = remintMarkers(toCopy).map((storylet, i) => ({
          ...storylet,
          id: idMap.get(storylet.id)!,
          name: i === 0 ? `${storylet.name} (copy)` : storylet.name,
          parentId: storylet.parentId && idMap.has(storylet.parentId)
            ? idMap.get(storylet.parentId)!
            : storylet.parentId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))

        // Find insertion point: after the last descendant of the original
        const subtreeIds = new Set(toCopy.map((d) => d.id))
        let lastDescIdx = book.storylets.findIndex((s) => s.id === id)
        for (let i = lastDescIdx + 1; i < book.storylets.length; i++) {
          if (subtreeIds.has(book.storylets[i].id)) {
            lastDescIdx = i
          } else {
            break
          }
        }

        const storylets = [...book.storylets]
        storylets.splice(lastDescIdx + 1, 0, ...copies)

        const newRootId = idMap.get(id)!
        set({
          book: { ...book, storylets, updatedAt: timestamp },
          activeStoryletId: newRootId,
        })
        return newRootId
      },

      renameStorylet: (id: string, name: string) => {
        const { book } = get()
        if (!book) return
        if (bailIfLocked('rename storylet')) return
        set({
          book: {
            ...book,
            storylets: book.storylets.map((storylet) =>
              storylet.id === id ? { ...storylet, name, updatedAt: now() } : storylet
            ),
            updatedAt: now(),
          },
        })
      },

      setStoryletPublishedMeta: (id: string, meta: { lastPublishedAt: string; lastPublishedSnapshotId: string }) => {
        const { book } = get()
        if (!book) return
        set({
          book: {
            ...book,
            storylets: book.storylets.map((storylet) =>
              storylet.id === id
                ? {
                    ...storylet,
                    lastPublishedAt: meta.lastPublishedAt,
                    lastPublishedSnapshotId: meta.lastPublishedSnapshotId,
                    updatedAt: now(),
                  }
                : storylet
            ),
            updatedAt: now(),
          },
        })
      },

      setStoryletIcon: (id: string, icon: string | undefined) => {
        const { book } = get()
        if (!book) return
        if (bailIfLocked('change icon')) return
        set({
          book: {
            ...book,
            storylets: book.storylets.map((storylet) =>
              storylet.id === id ? { ...storylet, icon, updatedAt: now() } : storylet
            ),
            updatedAt: now(),
          },
        })
      },

      setStoryletColor: (id: string, color: string | undefined) => {
        const { book } = get()
        if (!book) return
        if (bailIfLocked('change color')) return
        set({
          book: {
            ...book,
            storylets: book.storylets.map((storylet) =>
              storylet.id === id ? { ...storylet, color, updatedAt: now() } : storylet
            ),
            updatedAt: now(),
          },
        })
      },

      deleteStorylet: (id: string) => {
        if (!get().book) return
        if (bailIfLocked('delete storylet')) return
        get()._flushContentUpdate()
        const { book, activeStoryletId } = get()
        if (!book) return
        // Collect all descendant ids
        const toDelete = new Set<string>([id])
        let changed = true
        while (changed) {
          changed = false
          for (const storylet of book.storylets) {
            if (storylet.parentId && toDelete.has(storylet.parentId) && !toDelete.has(storylet.id)) {
              toDelete.add(storylet.id)
              changed = true
            }
          }
        }
        const remaining = book.storylets.filter((s) => !toDelete.has(s.id))
        if (remaining.length === 0) return
        const newActiveId = toDelete.has(activeStoryletId ?? '')
          ? remaining[0].id
          : activeStoryletId
        set({
          book: { ...book, storylets: remaining, updatedAt: now() },
          activeStoryletId: newActiveId,
        })
        // Clean up storylet notes for each deleted storylet (dynamic import to
        // avoid circular deps). Position notes are still owned by the markers
        // embedded in content and are garbage-collected by Phase 9 consistency.
        void import('./notesStore').then(({ useNotesStore }) => {
          const removeAll = useNotesStore.getState().removeAllNotesForStorylet
          for (const deletedId of toDelete) {
            removeAll(deletedId)
          }
        })
      },

      reorderStorylets: (ids: string[]) => {
        const { book } = get()
        if (!book) return
        if (bailIfLocked('reorder storylets')) return
        const storyletMap = new Map(book.storylets.map((s) => [s.id, s]))
        const reordered = ids
          .map((id) => storyletMap.get(id))
          .filter((s): s is Storylet => s !== undefined)
        set({
          book: { ...book, storylets: reordered, updatedAt: now() },
        })
      },

      setActiveStorylet: (id: string | null) => {
        // Flush any pending content update before switching
        get()._flushContentUpdate()
        // Snapshot the storylet we're leaving
        const { book, activeStoryletId } = get()
        if (book && activeStoryletId && activeStoryletId !== id) {
          const storylet = book.storylets.find((s) => s.id === activeStoryletId)
          if (storylet?.content) {
            createSnapshot(activeStoryletId, storylet.content, 'switch')
          }
        }
        set({ activeStoryletId: id })
      },

      moveStorylet: (id: string, newParentId: string | undefined, insertIndex: number) => {
        const { book } = get()
        if (!book) return
        if (bailIfLocked('move storylet')) return

        const storylet = book.storylets.find((d) => d.id === id)
        if (!storylet) return

        // Cannot move into own descendants (circular)
        if (newParentId && isDescendant(book.storylets, newParentId, id)) return

        // Depth check: new depth + subtree depth must not exceed MAX_DEPTH (4)
        const newDepth = newParentId ? getStoryletDepth(book.storylets, newParentId) + 1 : 0
        const subtreeDepth = getSubtreeDepth(book.storylets, id)
        if (newDepth + subtreeDepth > 4) return

        // Collect the block to move (storylet + descendants in order)
        const block = collectSubtree(book.storylets, id)
        const blockIds = new Set(block.map((d) => d.id))

        // Remove block from array
        const remaining = book.storylets.filter((d) => !blockIds.has(d.id))

        // Update parentId on the moved storylet
        block[0] = { ...block[0], parentId: newParentId, updatedAt: now() }

        // Find new siblings and determine insertion point in flat array
        const newSiblings = remaining.filter((d) => d.parentId === newParentId)

        let flatInsertIdx: number
        if (insertIndex >= newSiblings.length) {
          // Insert after last sibling's subtree
          if (newSiblings.length === 0) {
            if (newParentId) {
              // Insert right after the parent
              const parentIdx = remaining.findIndex((d) => d.id === newParentId)
              flatInsertIdx = parentIdx + 1
            } else {
              flatInsertIdx = remaining.length
            }
          } else {
            const lastSibling = newSiblings[newSiblings.length - 1]
            const lastSiblingSubtree = collectSubtree(remaining, lastSibling.id)
            const lastInSubtree = lastSiblingSubtree[lastSiblingSubtree.length - 1]
            flatInsertIdx = remaining.indexOf(lastInSubtree) + 1
          }
        } else {
          // Insert before the sibling at insertIndex
          const targetSibling = newSiblings[insertIndex]
          flatInsertIdx = remaining.indexOf(targetSibling)
        }

        // Splice block back in
        const result = [...remaining]
        result.splice(flatInsertIdx, 0, ...block)

        set({
          book: { ...book, storylets: result, updatedAt: now() },
        })
      },

      updateStoryletContent: (content: string, storyletId?: string, options?: UpdateContentOptions) => {
        if (bailIfLocked('edit content')) return
        const targetId = storyletId ?? get().activeStoryletId
        if (!targetId) return
        // Typing moved to another storylet: save the previous one's text now.
        const previousPending = get()._pendingContent
        if (previousPending && previousPending.storyletId !== targetId) get()._flushContentUpdate()
        const { _contentUpdateTimer, _pendingContent: pending, book } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        let uncountedWords = pending?.uncountedWords ?? 0
        if (options?.countAsWriting === false) {
          const previous = pending
            ? pending.content
            : book?.storylets.find((s) => s.id === targetId)?.content ?? null
          uncountedWords += countWords(content) - countWords(previous)
        }
        const timer = setTimeout(() => get()._flushContentUpdate(), CONTENT_DEBOUNCE_MS)
        set({ _contentUpdateTimer: timer, _pendingContent: { storyletId: targetId, content, uncountedWords } })
      },

      setStoryletContent: (id: string, content: string) => {
        if (bailIfLocked('edit content')) return
        get()._flushContentUpdate()
        const { book } = get()
        if (!book) return
        set({
          book: {
            ...book,
            storylets: book.storylets.map((storylet) =>
              storylet.id === id
                ? { ...storylet, content, updatedAt: now(), docVersion: (storylet.docVersion ?? 0) + 1 }
                : storylet
            ),
            updatedAt: now(),
          },
        })
      },

      setLastSaved: (counter: number, at: number, saved?: { saveId: string; book: Book }) => {
        set({
          lastSavedCounter: counter,
          lastSavedAt: at,
          ...(saved ? { lastSavedId: saved.saveId, lastSavedFingerprint: bookFingerprint(saved.book) } : {}),
        })
      },

      markFileVersionSeen: (counter: number, saveId: string | undefined) => {
        set({ lastSavedCounter: counter, lastSavedId: saveId ?? null })
      },

      hasUnsavedChanges: () => {
        get()._flushContentUpdate()
        const { book, lastSavedFingerprint } = get()
        if (!book || !lastSavedFingerprint) return false
        return bookFingerprint(book) !== lastSavedFingerprint
      },

      setGlobalSettings: (settings: GlobalSettings) => {
        set({ globalSettings: settings })
      },

      updateGlobalSettings: (patch: Partial<GlobalSettings>) => {
        if (bailIfLocked('update settings')) return
        const existing = get().globalSettings
        set({ globalSettings: { ...existing, ...patch } })
      },

      renameStyle: (oldName: string, newName: string) => {
        if (!oldName || !newName || oldName === newName) return
        if (bailIfLocked('rename style')) return
        get()._flushContentUpdate()
        const { book, globalSettings } = get()
        const existingStyles = globalSettings.documentStyles ?? {}
        if (!(oldName in existingStyles) && !book) return
        // Rename in styles map (no-op if target key already exists)
        let nextStyles = existingStyles
        if (oldName in existingStyles && !(newName in existingStyles)) {
          const { [oldName]: renamed, ...rest } = existingStyles
          nextStyles = { ...rest, [newName]: renamed }
        }
        // Rewrite class="oldName" references in all storylets (any tag/attrs)
        const classRegex = new RegExp(`class="${escapeRegExp(oldName)}"`, 'g')
        const needle = `class="${oldName}"`
        const nextBook = book
          ? {
              ...book,
              storylets: book.storylets.map((storylet) => {
                if (!storylet.content || !storylet.content.includes(needle)) return storylet
                const updated = storylet.content.replace(classRegex, `class="${newName}"`)
                if (updated === storylet.content) return storylet
                return { ...storylet, content: updated, updatedAt: now() }
              }),
              updatedAt: now(),
            }
          : book
        set({
          globalSettings: { ...globalSettings, documentStyles: nextStyles },
          ...(nextBook ? { book: nextBook } : {}),
        })
      },

      replaceInlineStyleInOtherDocs: (styleString: string, className: string) => {
        const { book, activeStoryletId } = get()
        if (!book) return 0
        if (bailIfLocked('replace style')) return 0
        const needle = `<span style="${styleString}">`
        const replacement = `<span class="${className}">`
        let total = 0
        const nextStorylets = book.storylets.map((storylet) => {
          if (storylet.id === activeStoryletId) return storylet
          if (!storylet.content || !storylet.content.includes(needle)) return storylet
          const parts = storylet.content.split(needle)
          const count = parts.length - 1
          if (count === 0) return storylet
          total += count
          return { ...storylet, content: parts.join(replacement), updatedAt: now() }
        })
        if (total === 0) return 0
        set({ book: { ...book, storylets: nextStorylets, updatedAt: now() } })
        return total
      },

      replaceAllInBook: (
        options: SearchOptions,
        replacement: string,
        scope: ReplaceScope,
        targetStoryletId?: string,
      ) => {
        if (bailIfLocked('replace in book')) return { storyletsChanged: 0, matchesReplaced: 0 }
        get()._flushContentUpdate()
        const { book } = get()
        if (!book) return { storyletsChanged: 0, matchesReplaced: 0 }
        const compiled = compileQuery(options)
        if ('error' in compiled) return { storyletsChanged: 0, matchesReplaced: 0 }
        const { regex } = compiled
        const timestamp = now()
        let storyletsChanged = 0
        let matchesReplaced = 0
        const nextStorylets = book.storylets.map((storylet) => {
          if (scope === 'storylet' && storylet.id !== targetStoryletId) return storylet
          if (!storylet.content) return storylet
          const { content, count } = replaceInContent(storylet.content, regex, replacement, options.regex)
          if (count === 0 || content === storylet.content) return storylet
          storyletsChanged++
          matchesReplaced += count
          return {
            ...storylet,
            content,
            updatedAt: timestamp,
            docVersion: (storylet.docVersion ?? 0) + 1,
          }
        })
        if (storyletsChanged === 0) {
          return { storyletsChanged: 0, matchesReplaced: 0 }
        }
        set({
          book: { ...book, storylets: nextStorylets, updatedAt: timestamp },
        })
        return { storyletsChanged, matchesReplaced }
      },

      _flushContentUpdate: () => {
        const { _contentUpdateTimer, _pendingContent: pending, book } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        set({ _contentUpdateTimer: null, _pendingContent: null })
        if (!pending || !book) return
        const storylet = book.storylets.find((s) => s.id === pending.storyletId)
        if (!storylet || storylet.content === pending.content) return
        // Track word delta for quest progress and metrics, leaving out
        // changes that weren't typed (undo, snapshot restore).
        const oldWords = countWords(storylet.content)
        const delta = countWords(pending.content) - oldWords - pending.uncountedWords
        // Quests take gross or net words per the "count words as" setting.
        const questWords = countedQuestWords(delta, Date.now())
        if (questWords > 0) {
          useImageRevealStore.getState().addWords(questWords)
        }
        useMetricsStore.getState().recordDelta(oldWords, oldWords + delta, Date.now())
        const updatedBook: Book = {
          ...book,
          storylets: book.storylets.map((s) =>
            s.id === pending.storyletId ? { ...s, content: pending.content, updatedAt: now() } : s
          ),
          updatedAt: now(),
        }
        set({ book: updatedBook })
        // Update writeathon progress with new total book word count
        const totalBookWords = updatedBook.storylets.reduce((sum, s) => sum + countWords(s.content), 0)
        useWriteathonStore.getState().updateProgress(totalBookWords)
      },
    }),
    {
      name: 'writinator-storylet',
      version: 4,
      storage: localforageStorage,
      partialize: (state) =>
        ({
          book: state.book,
          activeStoryletId: state.activeStoryletId,
          globalSettings: state.globalSettings,
          lastSavedCounter: state.lastSavedCounter,
          lastSavedAt: state.lastSavedAt,
          lastSavedId: state.lastSavedId,
          lastSavedFingerprint: state.lastSavedFingerprint,
        }) as unknown as StoryletState,
      migrate: (persisted, version) => {
        if (version === 0) {
          // v0→v1: documentStyles moved into globalSettings
          const state = persisted as Record<string, unknown>
          const documentStyles = state.documentStyles as DocumentStyles | undefined
          delete state.documentStyles
          state.globalSettings = { documentStyles } as GlobalSettings
        }
        if (version < 2) {
          // v1→v2: flatten DocumentStyles shape (body/h1/.../namedStyles → flat record)
          const state = persisted as Record<string, unknown>
          const gs = state.globalSettings as GlobalSettings | undefined
          if (gs?.documentStyles) {
            gs.documentStyles = flattenDocumentStyles(gs.documentStyles)
          }
        }
        if (version < 3) {
          // v2→v3: rename book.documents → book.storylets, activeDocumentId → activeStoryletId
          const state = persisted as Record<string, unknown>
          if ('activeDocumentId' in state) {
            state.activeStoryletId = state.activeDocumentId
            delete state.activeDocumentId
          }
          const book = state.book as Record<string, unknown> | undefined
          if (book && 'documents' in book && !('storylets' in book)) {
            book.storylets = book.documents
            delete book.documents
          }
        }
        if (version < 4) {
          // v3→v4: add lastSavedCounter and lastSavedAt defaults
          const state = persisted as Record<string, unknown>
          if (!('lastSavedCounter' in state)) state.lastSavedCounter = 0
          if (!('lastSavedAt' in state)) state.lastSavedAt = null
        }
        // Ensure book.storylets exists (old data may use 'chapters' or 'documents')
        const state = persisted as Record<string, unknown>
        const book = state.book as Record<string, unknown> | undefined
        if (book && !book.storylets) {
          book.storylets = book.documents ?? book.chapters ?? []
          delete book.documents
          delete book.chapters
        }
        return persisted as StoryletState
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[storyletStore] rehydration error:', error)
        }
        // Ensure book.storylets exists (old data may use 'chapters' or 'documents' or be missing)
        if (state?.book && !state.book.storylets) {
          const bookRaw = state.book as unknown as Record<string, unknown>
          const legacyDocs = bookRaw.documents as Storylet[] | undefined
          const legacyChapters = bookRaw.chapters as Storylet[] | undefined
          state.book = { ...state.book, storylets: legacyDocs ?? legacyChapters ?? [] }
        }
        // useStoryletStore is defined by the time this callback fires (zustand defers it)
        useStoryletStore.setState({ hasHydrated: true })
        // After hydration, attempt to restore file handle and reconcile with disk.
        // Dynamic imports used to avoid circular dependency: storyletStore → fileSystem → storyletStore.
        if (state?.book) {
          queueMicrotask(async () => {
            try {
              const { restoreStoredFileHandleFromRecents } = await import('../lib/fileSystem')
              const restored = await restoreStoredFileHandleFromRecents()
              if (!restored) return
              const { reconcileWithFile } = await import('../lib/reconcile')
              const result = await reconcileWithFile()
              console.log('[storyletStore] post-hydrate reconcile:', result.kind)
            } catch (err) {
              console.warn('[storyletStore] post-hydrate reconcile failed:', err)
            }
          })
        }
      },
    }
  )
)

/** Write any pending editor text into the book right now. */
function flushPendingContent(): void {
  useStoryletStore.getState()._flushContentUpdate()
}

/** Flush pending text and wait until the book is written to browser storage.
 *  For shutdown paths that can await (the desktop app's close handler). */
export async function flushAndPersistNow(): Promise<void> {
  flushPendingContent()
  const options = useStoryletStore.persist.getOptions()
  if (!options.storage || !options.name || !options.partialize) return
  await options.storage.setItem(options.name, {
    state: options.partialize(useStoryletStore.getState()) as StoryletState,
    version: options.version,
  })
}

// Save typing that hasn't hit the 1.5s debounce yet when the page is hidden or
// closed. visibilitychange fires earlier than pagehide (e.g. switching apps),
// which gives the storage write a better chance to finish.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingContent)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingContent()
  })
}
