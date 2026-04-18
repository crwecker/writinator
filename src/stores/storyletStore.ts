import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { Book, Storylet, DocumentStyles, GlobalSettings, NamedStyle, ReplaceScope, SearchOptions, WritinatorFile } from '../types'
import { compileQuery, interpretReplacementEscapes, MAX_MATCHES_PER_STORYLET } from '../lib/bookSearch'

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

/**
 * Flatten the old DocumentStyles shape (body/h1/.../namedStyles) into the flat Record<string, NamedStyle>.
 */
function flattenDocumentStyles(raw: unknown): DocumentStyles | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  // Already flat: no `namedStyles` key, or no nested object matching old shape
  if (!('namedStyles' in obj)) return obj as DocumentStyles
  const { namedStyles, ...rest } = obj as { namedStyles?: Record<string, NamedStyle> } & Record<string, NamedStyle>
  return { ...(rest as Record<string, NamedStyle>), ...(namedStyles ?? {}) }
}
import { createSnapshot, getAllSnapshots, loadSnapshotsFromFile, snapshotBook } from './snapshotStore'
import { loadPublishedSnapshotsFromFile } from './publishedSnapshotStore'
import { clearFileHandle } from '../lib/fileSystem'
import { useImageRevealStore, hydrateImageReveal } from './imageRevealStore'
import { useWriteathonStore, hydrateWriteathon } from './writeathonStore'
import { useMetricsStore, hydrateMetrics } from './metricsStore'
import { useCharacterStore } from './characterStore'
import { hydratePlayer } from './playerStore'
import { countWords } from '../lib/words'

interface StoryletState {
  book: Book | null
  activeStoryletId: string | null
  globalSettings: GlobalSettings
  hasHydrated: boolean
  lastSavedCounter: number
  lastSavedAt: number | null
  _contentUpdateTimer: ReturnType<typeof setTimeout> | null
  _pendingContent: string | null

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
  updateStoryletContent: (content: string) => void
  _flushContentUpdate: () => void

  // Save tracking
  setLastSaved: (counter: number, at: number) => void

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

function generateId(): string {
  return crypto.randomUUID()
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

function now(): string {
  return new Date().toISOString()
}

const localforageStorage = createJSONStorage<StoryletState>(() => ({
  getItem: async (name: string) => {
    const value = await localforage.getItem<string>(name)
    if (value !== null) return value
    // Fallback: if reading the new key and nothing is there, try the legacy key
    if (name === 'writinator-storylet') {
      const legacy = await localforage.getItem<string>('writinator-document')
      if (legacy !== null) {
        await localforage.setItem(name, legacy)
        await localforage.removeItem('writinator-document')
        return legacy
      }
    }
    return null
  },
  setItem: async (name: string, value: string) => {
    await localforage.setItem(name, value)
  },
  removeItem: async (name: string) => {
    await localforage.removeItem(name)
  },
}))

export const useStoryletStore = create<StoryletState>()(
  persist(
    (set, get) => ({
      book: null,
      activeStoryletId: null,
      globalSettings: {},
      hasHydrated: false,
      lastSavedCounter: 0,
      lastSavedAt: null,
      _contentUpdateTimer: null,
      _pendingContent: null,

      createBook: async (title: string) => {
        // Orphan-snapshot the current book before wiping state
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
        })
      },

      loadFile: async (file: WritinatorFile) => {
        const existingBook = get().book
        if (existingBook) {
          await snapshotBook(existingBook, 'orphan')
        }
        // Merge current localforage snapshots (including orphans just created)
        // into the file's snapshot data so nothing is lost during the wipe.
        const localSnapshots = await getAllSnapshots()
        const merged = { ...file.snapshots }
        for (const [storyletId, local] of Object.entries(localSnapshots)) {
          const fromFile = merged[storyletId] ?? []
          const existingIds = new Set(fromFile.map((s) => s.id))
          const newEntries = local.filter((s) => !existingIds.has(s.id))
          if (newEntries.length > 0) {
            merged[storyletId] = [...fromFile, ...newEntries]
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 100)
          }
        }
        get()._flushContentUpdate()
        set({
          book: file.book,
          globalSettings: file.globalSettings,
          activeStoryletId: file.book.storylets[0]?.id ?? null,
        })
        loadSnapshotsFromFile(merged)
        loadPublishedSnapshotsFromFile(file.publishedSnapshots ?? {})
        useCharacterStore.getState().loadFromFile(
          file.characters ?? [],
          file.markers ?? {}
        )
        // Hydrate cross-store sections (v7+). Missing sections = no-op, preserving localforage state.
        hydratePlayer(file.player)
        hydrateImageReveal(file.quests)
        hydrateWriteathon(file.writeathon)
        hydrateMetrics(file.metrics)
      },

      renameBook: (title: string) => {
        const { book } = get()
        if (!book) return
        set({ book: { ...book, title, updatedAt: now() } })
      },

      closeBook: async () => {
        const { book } = get()
        if (book) {
          await snapshotBook(book, 'closeBook')
        }
        get()._flushContentUpdate()
        // Pause timed quest timer when closing the book
        const imageRevealState = useImageRevealStore.getState()
        if (imageRevealState.activeSessions.some((s) => s.timeMinutes !== undefined)) {
          imageRevealState.pauseTimer()
        }
        clearFileHandle()
        useCharacterStore.getState().reset()
        set({ book: null, activeStoryletId: null })
      },

      addStorylet: (name?: string, parentId?: string) => {
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

        // Create copies with remapped IDs
        const copies: Storylet[] = toCopy.map((storylet, i) => ({
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
      },

      reorderStorylets: (ids: string[]) => {
        const { book } = get()
        if (!book) return
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

      updateStoryletContent: (content: string) => {
        const { _contentUpdateTimer } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        const timer = setTimeout(() => {
          const { book, activeStoryletId, _pendingContent } = get()
          if (!book || !activeStoryletId || !_pendingContent) return
          // Track word delta for quest progress
          const oldContent = book.storylets.find((s) => s.id === activeStoryletId)?.content ?? null
          const oldWords = countWords(oldContent)
          const newWords = countWords(_pendingContent)
          const delta = newWords - oldWords
          if (delta > 0) {
            useImageRevealStore.getState().addWords(delta)
          }
          useMetricsStore.getState().recordDelta(oldWords, newWords, Date.now())
          set({
            book: {
              ...book,
              storylets: book.storylets.map((storylet) =>
                storylet.id === activeStoryletId
                  ? { ...storylet, content: _pendingContent, updatedAt: now() }
                  : storylet
              ),
              updatedAt: now(),
            },
            _contentUpdateTimer: null,
            _pendingContent: null,
          })
          // Update writeathon progress with new total book word count
          const updatedBook = get().book
          if (updatedBook) {
            const totalBookWords = updatedBook.storylets.reduce(
              (sum, s) => sum + countWords(s.content),
              0
            )
            useWriteathonStore.getState().updateProgress(totalBookWords)
          }
        }, 1500)
        set({ _contentUpdateTimer: timer, _pendingContent: content })
      },

      setLastSaved: (counter: number, at: number) => {
        set({ lastSavedCounter: counter, lastSavedAt: at })
      },

      setGlobalSettings: (settings: GlobalSettings) => {
        set({ globalSettings: settings })
      },

      updateGlobalSettings: (patch: Partial<GlobalSettings>) => {
        const existing = get().globalSettings
        set({ globalSettings: { ...existing, ...patch } })
      },

      renameStyle: (oldName: string, newName: string) => {
        if (!oldName || !newName || oldName === newName) return
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
        const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const classRegex = new RegExp(`class="${escaped}"`, 'g')
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
        get()._flushContentUpdate()
        const { book } = get()
        if (!book) return { storyletsChanged: 0, matchesReplaced: 0 }
        const compiled = compileQuery(options)
        if ('error' in compiled) return { storyletsChanged: 0, matchesReplaced: 0 }
        const { regex } = compiled
        const effectiveReplacement = interpretReplacementEscapes(replacement, options.regex)
        const timestamp = now()
        let storyletsChanged = 0
        let matchesReplaced = 0
        const nextStorylets = book.storylets.map((storylet) => {
          if (scope === 'storylet' && storylet.id !== targetStoryletId) return storylet
          if (!storylet.content) return storylet
          // Build a fresh scanner so we don't mutate `regex.lastIndex` across storylets,
          // and so we can cap the number of replacements per storylet.
          const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
          const scanner = new RegExp(regex.source, flags)
          const original = storylet.content
          let cursor = 0
          let count = 0
          let out = ''
          let m: RegExpExecArray | null
          while ((m = scanner.exec(original)) !== null) {
            const start = m.index
            const end = start + m[0].length
            out += original.slice(cursor, start)
            out += effectiveReplacement
            cursor = end
            count++
            if (count >= MAX_MATCHES_PER_STORYLET) break
            // Avoid infinite loops on zero-width matches.
            if (m[0].length === 0) {
              scanner.lastIndex = scanner.lastIndex + 1
            }
          }
          if (count === 0) return storylet
          out += original.slice(cursor)
          if (out === original) return storylet
          storyletsChanged++
          matchesReplaced += count
          return {
            ...storylet,
            content: out,
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
        const { _contentUpdateTimer, _pendingContent, book, activeStoryletId } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        if (_pendingContent && book && activeStoryletId) {
          set({
            book: {
              ...book,
              storylets: book.storylets.map((storylet) =>
                storylet.id === activeStoryletId
                  ? { ...storylet, content: _pendingContent, updatedAt: now() }
                  : storylet
              ),
              updatedAt: now(),
            },
            _contentUpdateTimer: null,
            _pendingContent: null,
          })
        } else {
          set({ _contentUpdateTimer: null, _pendingContent: null })
        }
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
