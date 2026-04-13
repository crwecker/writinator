import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { Book, Document, DocumentStyles, GlobalSettings, NamedStyle, WritinatorFile } from '../types'

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
import { createSnapshot, loadSnapshotsFromFile, snapshotBook } from './snapshotStore'
import { clearFileHandle } from '../lib/fileSystem'
import { useImageRevealStore } from './imageRevealStore'
import { useWriteathonStore } from './writeathonStore'
import { useCharacterStore } from './characterStore'
import { countWords } from '../lib/words'

interface DocumentState {
  book: Book | null
  activeDocumentId: string | null
  globalSettings: GlobalSettings
  hasHydrated: boolean
  _contentUpdateTimer: ReturnType<typeof setTimeout> | null
  _pendingContent: string | null

  // Book CRUD
  createBook: (title: string) => void
  closeBook: () => Promise<void>
  loadFile: (file: WritinatorFile) => void
  renameBook: (title: string) => void

  // Document CRUD
  addDocument: (name?: string, parentId?: string) => string
  duplicateDocument: (id: string) => string
  renameDocument: (id: string, name: string) => void
  setDocumentIcon: (id: string, icon: string | undefined) => void
  setDocumentColor: (id: string, color: string | undefined) => void
  deleteDocument: (id: string) => void
  reorderDocuments: (ids: string[]) => void
  moveDocument: (id: string, newParentId: string | undefined, insertIndex: number) => void
  setActiveDocument: (id: string | null) => void

  // Content
  updateDocumentContent: (content: string) => void
  _flushContentUpdate: () => void

  // Global settings
  setGlobalSettings: (settings: GlobalSettings) => void
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void
  renameStyle: (oldName: string, newName: string) => void
  replaceInlineStyleInOtherDocs: (styleString: string, className: string) => number
}

function generateId(): string {
  return crypto.randomUUID()
}

/** Walk up the parentId chain to check if docId is a descendant of ancestorId */
function isDescendant(documents: Document[], docId: string, ancestorId: string): boolean {
  let currentId: string | undefined = docId
  while (currentId) {
    const doc = documents.find((d) => d.id === currentId)
    if (!doc?.parentId) return false
    if (doc.parentId === ancestorId) return true
    currentId = doc.parentId
  }
  return false
}

/** Returns the depth of a document (0 for top-level / undefined id) */
function getDocumentDepth(documents: Document[], id: string | undefined): number {
  let depth = 0
  let currentId = id
  while (currentId) {
    const doc = documents.find((d) => d.id === currentId)
    if (!doc?.parentId) break
    depth++
    currentId = doc.parentId
  }
  return depth
}

/** Returns the max depth below this document (0 if leaf) */
function getSubtreeDepth(documents: Document[], id: string): number {
  const children = documents.filter((d) => d.parentId === id)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(documents, c.id)))
}

/** Collect a document and all its descendants in flat-array order */
function collectSubtree(documents: Document[], id: string): Document[] {
  const ids = new Set<string>([id])
  let changed = true
  while (changed) {
    changed = false
    for (const doc of documents) {
      if (doc.parentId && ids.has(doc.parentId) && !ids.has(doc.id)) {
        ids.add(doc.id)
        changed = true
      }
    }
  }
  return documents.filter((doc) => ids.has(doc.id))
}

function now(): string {
  return new Date().toISOString()
}

const localforageStorage = createJSONStorage<DocumentState>(() => ({
  getItem: async (name: string) => {
    const value = await localforage.getItem<string>(name)
    return value
  },
  setItem: async (name: string, value: string) => {
    await localforage.setItem(name, value)
  },
  removeItem: async (name: string) => {
    await localforage.removeItem(name)
  },
}))

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
      book: null,
      activeDocumentId: null,
      globalSettings: {},
      hasHydrated: false,
      _contentUpdateTimer: null,
      _pendingContent: null,

      createBook: (title: string) => {
        const timestamp = now()
        const documentId = generateId()
        set({
          book: {
            id: generateId(),
            title,
            documents: [
              {
                id: documentId,
                name: 'Document 1',
                content: null,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          activeDocumentId: documentId,
          globalSettings: { documentStyles: createDefaultDocumentStyles() },
        })
      },

      loadFile: (file: WritinatorFile) => {
        get()._flushContentUpdate()
        set({
          book: file.book,
          globalSettings: file.globalSettings,
          activeDocumentId: file.book.documents[0]?.id ?? null,
        })
        loadSnapshotsFromFile(file.snapshots)
        useCharacterStore.getState().loadFromFile(
          file.characters ?? [],
          file.markers ?? {}
        )
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
        set({ book: null, activeDocumentId: null })
      },

      addDocument: (name?: string, parentId?: string) => {
        const { book } = get()
        if (!book) return ''
        const id = generateId()
        const timestamp = now()
        const siblings = book.documents.filter((doc) => doc.parentId === parentId)
        const documentName = name ?? `Document ${siblings.length + 1}`
        const document: Document = {
          id,
          name: documentName,
          content: null,
          ...(parentId ? { parentId } : {}),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        // Insert after last sibling of the same parent (or its descendants)
        let insertIdx = book.documents.length
        if (parentId) {
          const parentIdx = book.documents.findIndex((doc) => doc.id === parentId)
          if (parentIdx !== -1) {
            // Find the last descendant of this parent
            insertIdx = parentIdx + 1
            for (let i = parentIdx + 1; i < book.documents.length; i++) {
              if (isDescendant(book.documents, book.documents[i].id, parentId)) {
                insertIdx = i + 1
              } else {
                break
              }
            }
          }
        }
        const documents = [...book.documents]
        documents.splice(insertIdx, 0, document)
        set({
          book: { ...book, documents, updatedAt: timestamp },
          activeDocumentId: id,
        })
        return id
      },

      duplicateDocument: (id: string) => {
        const { book } = get()
        if (!book) return ''
        const timestamp = now()

        // Collect the target document and all its descendants (in order)
        const target = book.documents.find((doc) => doc.id === id)
        if (!target) return ''

        // Gather original docs to copy: target + descendants in order
        const toCopy = collectSubtree(book.documents, id)

        // Build old→new ID map
        const idMap = new Map<string, string>()
        for (const doc of toCopy) {
          idMap.set(doc.id, generateId())
        }

        // Create copies with remapped IDs
        const copies: Document[] = toCopy.map((doc, i) => ({
          ...doc,
          id: idMap.get(doc.id)!,
          name: i === 0 ? `${doc.name} (copy)` : doc.name,
          parentId: doc.parentId && idMap.has(doc.parentId)
            ? idMap.get(doc.parentId)!
            : doc.parentId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))

        // Find insertion point: after the last descendant of the original
        const subtreeIds = new Set(toCopy.map((d) => d.id))
        let lastDescIdx = book.documents.findIndex((doc) => doc.id === id)
        for (let i = lastDescIdx + 1; i < book.documents.length; i++) {
          if (subtreeIds.has(book.documents[i].id)) {
            lastDescIdx = i
          } else {
            break
          }
        }

        const documents = [...book.documents]
        documents.splice(lastDescIdx + 1, 0, ...copies)

        const newRootId = idMap.get(id)!
        set({
          book: { ...book, documents, updatedAt: timestamp },
          activeDocumentId: newRootId,
        })
        return newRootId
      },

      renameDocument: (id: string, name: string) => {
        const { book } = get()
        if (!book) return
        set({
          book: {
            ...book,
            documents: book.documents.map((doc) =>
              doc.id === id ? { ...doc, name, updatedAt: now() } : doc
            ),
            updatedAt: now(),
          },
        })
      },

      setDocumentIcon: (id: string, icon: string | undefined) => {
        const { book } = get()
        if (!book) return
        set({
          book: {
            ...book,
            documents: book.documents.map((doc) =>
              doc.id === id ? { ...doc, icon, updatedAt: now() } : doc
            ),
            updatedAt: now(),
          },
        })
      },

      setDocumentColor: (id: string, color: string | undefined) => {
        const { book } = get()
        if (!book) return
        set({
          book: {
            ...book,
            documents: book.documents.map((doc) =>
              doc.id === id ? { ...doc, color, updatedAt: now() } : doc
            ),
            updatedAt: now(),
          },
        })
      },

      deleteDocument: (id: string) => {
        const { book, activeDocumentId } = get()
        if (!book) return
        // Collect all descendant ids
        const toDelete = new Set<string>([id])
        let changed = true
        while (changed) {
          changed = false
          for (const doc of book.documents) {
            if (doc.parentId && toDelete.has(doc.parentId) && !toDelete.has(doc.id)) {
              toDelete.add(doc.id)
              changed = true
            }
          }
        }
        const remaining = book.documents.filter((doc) => !toDelete.has(doc.id))
        if (remaining.length === 0) return
        const newActiveId = toDelete.has(activeDocumentId ?? '')
          ? remaining[0].id
          : activeDocumentId
        set({
          book: { ...book, documents: remaining, updatedAt: now() },
          activeDocumentId: newActiveId,
        })
      },

      reorderDocuments: (ids: string[]) => {
        const { book } = get()
        if (!book) return
        const documentMap = new Map(book.documents.map((doc) => [doc.id, doc]))
        const reordered = ids
          .map((id) => documentMap.get(id))
          .filter((doc): doc is Document => doc !== undefined)
        set({
          book: { ...book, documents: reordered, updatedAt: now() },
        })
      },

      setActiveDocument: (id: string | null) => {
        // Flush any pending content update before switching
        get()._flushContentUpdate()
        // Snapshot the document we're leaving
        const { book, activeDocumentId } = get()
        if (book && activeDocumentId && activeDocumentId !== id) {
          const document = book.documents.find((doc) => doc.id === activeDocumentId)
          if (document?.content) {
            createSnapshot(activeDocumentId, document.content, 'switch')
          }
        }
        set({ activeDocumentId: id })
      },

      moveDocument: (id: string, newParentId: string | undefined, insertIndex: number) => {
        const { book } = get()
        if (!book) return

        const doc = book.documents.find((d) => d.id === id)
        if (!doc) return

        // Cannot move into own descendants (circular)
        if (newParentId && isDescendant(book.documents, newParentId, id)) return

        // Depth check: new depth + subtree depth must not exceed MAX_DEPTH (4)
        const newDepth = newParentId ? getDocumentDepth(book.documents, newParentId) + 1 : 0
        const subtreeDepth = getSubtreeDepth(book.documents, id)
        if (newDepth + subtreeDepth > 4) return

        // Collect the block to move (document + descendants in order)
        const block = collectSubtree(book.documents, id)
        const blockIds = new Set(block.map((d) => d.id))

        // Remove block from array
        const remaining = book.documents.filter((d) => !blockIds.has(d.id))

        // Update parentId on the moved document
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
            const lastDocInSubtree = lastSiblingSubtree[lastSiblingSubtree.length - 1]
            flatInsertIdx = remaining.indexOf(lastDocInSubtree) + 1
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
          book: { ...book, documents: result, updatedAt: now() },
        })
      },

      updateDocumentContent: (content: string) => {
        const { _contentUpdateTimer } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        const timer = setTimeout(() => {
          const { book, activeDocumentId, _pendingContent } = get()
          if (!book || !activeDocumentId || !_pendingContent) return
          // Track word delta for quest progress
          const oldContent = book.documents.find((doc) => doc.id === activeDocumentId)?.content ?? null
          const oldWords = countWords(oldContent)
          const newWords = countWords(_pendingContent)
          const delta = newWords - oldWords
          if (delta > 0) {
            useImageRevealStore.getState().addWords(delta)
          }
          set({
            book: {
              ...book,
              documents: book.documents.map((doc) =>
                doc.id === activeDocumentId
                  ? { ...doc, content: _pendingContent, updatedAt: now() }
                  : doc
              ),
              updatedAt: now(),
            },
            _contentUpdateTimer: null,
            _pendingContent: null,
          })
          // Update writeathon progress with new total book word count
          const updatedBook = get().book
          if (updatedBook) {
            const totalBookWords = updatedBook.documents.reduce(
              (sum, doc) => sum + countWords(doc.content),
              0
            )
            useWriteathonStore.getState().updateProgress(totalBookWords)
          }
        }, 1500)
        set({ _contentUpdateTimer: timer, _pendingContent: content })
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
        // Rewrite class="oldName" references in all documents (any tag/attrs)
        const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const classRegex = new RegExp(`class="${escaped}"`, 'g')
        const needle = `class="${oldName}"`
        const nextBook = book
          ? {
              ...book,
              documents: book.documents.map((doc) => {
                if (!doc.content || !doc.content.includes(needle)) return doc
                const updated = doc.content.replace(classRegex, `class="${newName}"`)
                if (updated === doc.content) return doc
                return { ...doc, content: updated, updatedAt: now() }
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
        const { book, activeDocumentId } = get()
        if (!book) return 0
        const needle = `<span style="${styleString}">`
        const replacement = `<span class="${className}">`
        let total = 0
        const nextDocs = book.documents.map((doc) => {
          if (doc.id === activeDocumentId) return doc
          if (!doc.content || !doc.content.includes(needle)) return doc
          const parts = doc.content.split(needle)
          const count = parts.length - 1
          if (count === 0) return doc
          total += count
          return { ...doc, content: parts.join(replacement), updatedAt: now() }
        })
        if (total === 0) return 0
        set({ book: { ...book, documents: nextDocs, updatedAt: now() } })
        return total
      },

      _flushContentUpdate: () => {
        const { _contentUpdateTimer, _pendingContent, book, activeDocumentId } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        if (_pendingContent && book && activeDocumentId) {
          set({
            book: {
              ...book,
              documents: book.documents.map((doc) =>
                doc.id === activeDocumentId
                  ? { ...doc, content: _pendingContent, updatedAt: now() }
                  : doc
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
      name: 'writinator-document',
      version: 2,
      storage: localforageStorage,
      partialize: (state) =>
        ({
          book: state.book,
          activeDocumentId: state.activeDocumentId,
          globalSettings: state.globalSettings,
        }) as unknown as DocumentState,
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
        // Ensure book.documents exists (old data may use 'chapters')
        const state = persisted as Record<string, unknown>
        const book = state.book as Record<string, unknown> | undefined
        if (book && !book.documents) {
          book.documents = book.chapters ?? []
          delete book.chapters
        }
        return persisted as DocumentState
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[documentStore] rehydration error:', error)
        }
        // Ensure book.documents exists (old data may use 'chapters' or be missing)
        if (state?.book && !state.book.documents) {
          const legacy = (state.book as unknown as Record<string, unknown>).chapters as Document[] | undefined
          state.book = { ...state.book, documents: legacy ?? [] }
        }
        // useDocumentStore is defined by the time this callback fires (zustand defers it)
        useDocumentStore.setState({ hasHydrated: true })
      },
    }
  )
)
