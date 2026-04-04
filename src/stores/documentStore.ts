import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { Book, Document, DocumentStyles, GlobalSettings, WritinatorFile } from '../types'
import { createSnapshot, loadSnapshotsFromFile } from './snapshotStore'
import { useQuestStore } from './questStore'
import { useImageRevealStore } from './imageRevealStore'

function countWords(text: string | null): number {
  if (!text || text.trim() === '') return 0
  return text.trim().split(/\s+/).length
}

interface DocumentState {
  book: Book | null
  activeDocumentId: string | null
  globalSettings: GlobalSettings
  _contentUpdateTimer: ReturnType<typeof setTimeout> | null
  _pendingContent: string | null

  // Book CRUD
  createBook: (title: string) => void
  loadFile: (file: WritinatorFile) => void
  renameBook: (title: string) => void

  // Document CRUD
  addDocument: (name?: string, parentId?: string) => string
  duplicateDocument: (id: string) => string
  renameDocument: (id: string, name: string) => void
  deleteDocument: (id: string) => void
  reorderDocuments: (ids: string[]) => void
  setActiveDocument: (id: string | null) => void
  indentDocument: (id: string) => void
  outdentDocument: (id: string) => void

  // Content
  updateDocumentContent: (content: string) => void
  _flushContentUpdate: () => void

  // Global settings
  setGlobalSettings: (settings: GlobalSettings) => void
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void
}

function generateId(): string {
  return crypto.randomUUID()
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
      },

      renameBook: (title: string) => {
        const { book } = get()
        if (!book) return
        set({ book: { ...book, title, updatedAt: now() } })
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
            const isDescendant = (docId: string, ancestorId: string): boolean => {
              const doc = book.documents.find((d) => d.id === docId)
              if (!doc?.parentId) return false
              if (doc.parentId === ancestorId) return true
              return isDescendant(doc.parentId, ancestorId)
            }
            for (let i = parentIdx + 1; i < book.documents.length; i++) {
              if (isDescendant(book.documents[i].id, parentId)) {
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

        const isDescendant = (docId: string, ancestorId: string): boolean => {
          const doc = book.documents.find((d) => d.id === docId)
          if (!doc?.parentId) return false
          if (doc.parentId === ancestorId) return true
          return isDescendant(doc.parentId, ancestorId)
        }

        // Gather original docs to copy: target + descendants in order
        const toCopy = [target, ...book.documents.filter((doc) => isDescendant(doc.id, id))]

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
        let lastDescIdx = book.documents.findIndex((doc) => doc.id === id)
        for (let i = lastDescIdx + 1; i < book.documents.length; i++) {
          if (isDescendant(book.documents[i].id, id)) {
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

      indentDocument: (id: string) => {
        const { book } = get()
        if (!book) return
        // Find the previous sibling at the same level — that becomes the new parent
        const document = book.documents.find((doc) => doc.id === id)
        if (!document) return
        const siblings = book.documents.filter((doc) => doc.parentId === document.parentId)
        const idx = siblings.findIndex((doc) => doc.id === id)
        if (idx <= 0) return // no previous sibling to nest under
        const newParentId = siblings[idx - 1].id
        set({
          book: {
            ...book,
            documents: book.documents.map((doc) =>
              doc.id === id ? { ...doc, parentId: newParentId, updatedAt: now() } : doc
            ),
            updatedAt: now(),
          },
        })
      },

      outdentDocument: (id: string) => {
        const { book } = get()
        if (!book) return
        const document = book.documents.find((doc) => doc.id === id)
        if (!document?.parentId) return // already top-level
        const parent = book.documents.find((doc) => doc.id === document.parentId)
        if (!parent) return
        // Move to parent's level, right after parent
        set({
          book: {
            ...book,
            documents: book.documents.map((doc) =>
              doc.id === id ? { ...doc, parentId: parent.parentId, updatedAt: now() } : doc
            ),
            updatedAt: now(),
          },
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
            useQuestStore.getState().addWords(delta)
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
      version: 1,
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
        return persisted as DocumentState
      },
    }
  )
)
