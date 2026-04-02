import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { Book, Chapter, DocumentStyles } from '../types'
import { createSnapshot } from './snapshotStore'
import { useQuestStore } from './questStore'

function countWords(text: string | null): number {
  if (!text || text.trim() === '') return 0
  return text.trim().split(/\s+/).length
}

interface DocumentState {
  book: Book | null
  activeChapterId: string | null
  _contentUpdateTimer: ReturnType<typeof setTimeout> | null
  _pendingContent: string | null

  // Book CRUD
  createBook: (title: string) => void
  loadBook: (book: Book) => void
  renameBook: (title: string) => void

  // Chapter CRUD
  addChapter: (name?: string, parentId?: string) => string
  renameChapter: (id: string, name: string) => void
  deleteChapter: (id: string) => void
  reorderChapters: (ids: string[]) => void
  setActiveChapter: (id: string | null) => void
  indentChapter: (id: string) => void
  outdentChapter: (id: string) => void

  // Content
  updateChapterContent: (content: string) => void
  _flushContentUpdate: () => void

  // Document styles
  setDocumentStyles: (styles: DocumentStyles) => void
  updateDocumentStyles: (patch: Partial<DocumentStyles>) => void
  clearDocumentStyles: () => void
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
      activeChapterId: null,
      _contentUpdateTimer: null,
      _pendingContent: null,

      createBook: (title: string) => {
        const timestamp = now()
        const chapterId = generateId()
        set({
          book: {
            id: generateId(),
            title,
            chapters: [
              {
                id: chapterId,
                name: 'Chapter 1',
                content: null,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          activeChapterId: chapterId,
        })
      },

      loadBook: (book: Book) => {
        get()._flushContentUpdate()
        set({
          book,
          activeChapterId: book.chapters[0]?.id ?? null,
        })
      },

      renameBook: (title: string) => {
        const { book } = get()
        if (!book) return
        set({ book: { ...book, title, updatedAt: now() } })
      },

      addChapter: (name?: string, parentId?: string) => {
        const { book } = get()
        if (!book) return ''
        const id = generateId()
        const timestamp = now()
        const siblings = book.chapters.filter((ch) => ch.parentId === parentId)
        const chapterName = name ?? `Chapter ${siblings.length + 1}`
        const chapter: Chapter = {
          id,
          name: chapterName,
          content: null,
          ...(parentId ? { parentId } : {}),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        // Insert after last sibling of the same parent (or its descendants)
        let insertIdx = book.chapters.length
        if (parentId) {
          const parentIdx = book.chapters.findIndex((ch) => ch.id === parentId)
          if (parentIdx !== -1) {
            // Find the last descendant of this parent
            insertIdx = parentIdx + 1
            const isDescendant = (chId: string, ancestorId: string): boolean => {
              const ch = book.chapters.find((c) => c.id === chId)
              if (!ch?.parentId) return false
              if (ch.parentId === ancestorId) return true
              return isDescendant(ch.parentId, ancestorId)
            }
            for (let i = parentIdx + 1; i < book.chapters.length; i++) {
              if (isDescendant(book.chapters[i].id, parentId)) {
                insertIdx = i + 1
              } else {
                break
              }
            }
          }
        }
        const chapters = [...book.chapters]
        chapters.splice(insertIdx, 0, chapter)
        set({
          book: { ...book, chapters, updatedAt: timestamp },
          activeChapterId: id,
        })
        return id
      },

      renameChapter: (id: string, name: string) => {
        const { book } = get()
        if (!book) return
        set({
          book: {
            ...book,
            chapters: book.chapters.map((ch) =>
              ch.id === id ? { ...ch, name, updatedAt: now() } : ch
            ),
            updatedAt: now(),
          },
        })
      },

      deleteChapter: (id: string) => {
        const { book, activeChapterId } = get()
        if (!book) return
        // Collect all descendant ids
        const toDelete = new Set<string>([id])
        let changed = true
        while (changed) {
          changed = false
          for (const ch of book.chapters) {
            if (ch.parentId && toDelete.has(ch.parentId) && !toDelete.has(ch.id)) {
              toDelete.add(ch.id)
              changed = true
            }
          }
        }
        const remaining = book.chapters.filter((ch) => !toDelete.has(ch.id))
        if (remaining.length === 0) return
        const newActiveId = toDelete.has(activeChapterId ?? '')
          ? remaining[0].id
          : activeChapterId
        set({
          book: { ...book, chapters: remaining, updatedAt: now() },
          activeChapterId: newActiveId,
        })
      },

      reorderChapters: (ids: string[]) => {
        const { book } = get()
        if (!book) return
        const chapterMap = new Map(book.chapters.map((ch) => [ch.id, ch]))
        const reordered = ids
          .map((id) => chapterMap.get(id))
          .filter((ch): ch is Chapter => ch !== undefined)
        set({
          book: { ...book, chapters: reordered, updatedAt: now() },
        })
      },

      setActiveChapter: (id: string | null) => {
        // Flush any pending content update before switching
        get()._flushContentUpdate()
        // Snapshot the chapter we're leaving
        const { book, activeChapterId } = get()
        if (book && activeChapterId && activeChapterId !== id) {
          const chapter = book.chapters.find((ch) => ch.id === activeChapterId)
          if (chapter?.content) {
            createSnapshot(activeChapterId, chapter.content, 'switch')
          }
        }
        set({ activeChapterId: id })
      },

      indentChapter: (id: string) => {
        const { book } = get()
        if (!book) return
        // Find the previous sibling at the same level — that becomes the new parent
        const chapter = book.chapters.find((ch) => ch.id === id)
        if (!chapter) return
        const siblings = book.chapters.filter((ch) => ch.parentId === chapter.parentId)
        const idx = siblings.findIndex((ch) => ch.id === id)
        if (idx <= 0) return // no previous sibling to nest under
        const newParentId = siblings[idx - 1].id
        set({
          book: {
            ...book,
            chapters: book.chapters.map((ch) =>
              ch.id === id ? { ...ch, parentId: newParentId, updatedAt: now() } : ch
            ),
            updatedAt: now(),
          },
        })
      },

      outdentChapter: (id: string) => {
        const { book } = get()
        if (!book) return
        const chapter = book.chapters.find((ch) => ch.id === id)
        if (!chapter?.parentId) return // already top-level
        const parent = book.chapters.find((ch) => ch.id === chapter.parentId)
        if (!parent) return
        // Move to parent's level, right after parent
        set({
          book: {
            ...book,
            chapters: book.chapters.map((ch) =>
              ch.id === id ? { ...ch, parentId: parent.parentId, updatedAt: now() } : ch
            ),
            updatedAt: now(),
          },
        })
      },

      updateChapterContent: (content: string) => {
        const { _contentUpdateTimer } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        const timer = setTimeout(() => {
          const { book, activeChapterId, _pendingContent } = get()
          if (!book || !activeChapterId || !_pendingContent) return
          // Track word delta for quest progress
          const oldContent = book.chapters.find((ch) => ch.id === activeChapterId)?.content ?? null
          const oldWords = countWords(oldContent)
          const newWords = countWords(_pendingContent)
          const delta = newWords - oldWords
          if (delta > 0) {
            useQuestStore.getState().addWords(delta)
          }
          set({
            book: {
              ...book,
              chapters: book.chapters.map((ch) =>
                ch.id === activeChapterId
                  ? { ...ch, content: _pendingContent, updatedAt: now() }
                  : ch
              ),
              updatedAt: now(),
            },
            _contentUpdateTimer: null,
            _pendingContent: null,
          })
        }, 1500)
        set({ _contentUpdateTimer: timer, _pendingContent: content })
      },

      setDocumentStyles: (styles: DocumentStyles) => {
        const { book } = get()
        if (!book) return
        set({ book: { ...book, documentStyles: styles, updatedAt: now() } })
      },

      updateDocumentStyles: (patch: Partial<DocumentStyles>) => {
        const { book } = get()
        if (!book) return
        const existing = book.documentStyles ?? {}
        const merged: DocumentStyles = { ...existing }
        for (const key of Object.keys(patch) as (keyof DocumentStyles)[]) {
          merged[key] = { ...existing[key], ...patch[key] } as any
        }
        set({ book: { ...book, documentStyles: merged, updatedAt: now() } })
      },

      clearDocumentStyles: () => {
        const { book } = get()
        if (!book) return
        const { documentStyles: _, ...rest } = book
        set({ book: { ...rest, chapters: book.chapters, createdAt: book.createdAt, updatedAt: now() } as Book })
      },

      _flushContentUpdate: () => {
        const { _contentUpdateTimer, _pendingContent, book, activeChapterId } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        if (_pendingContent && book && activeChapterId) {
          set({
            book: {
              ...book,
              chapters: book.chapters.map((ch) =>
                ch.id === activeChapterId
                  ? { ...ch, content: _pendingContent, updatedAt: now() }
                  : ch
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
      storage: localforageStorage,
      partialize: (state) =>
        ({
          book: state.book,
          activeChapterId: state.activeChapterId,
        }) as unknown as DocumentState,
    }
  )
)
