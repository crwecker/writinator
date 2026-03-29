import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { Book, Chapter } from '../types'

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
  addChapter: (name?: string) => string
  renameChapter: (id: string, name: string) => void
  deleteChapter: (id: string) => void
  reorderChapters: (ids: string[]) => void
  setActiveChapter: (id: string | null) => void

  // Content
  updateChapterContent: (content: string) => void
  _flushContentUpdate: () => void
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

      addChapter: (name?: string) => {
        const { book } = get()
        if (!book) return ''
        const id = generateId()
        const timestamp = now()
        const chapterName = name ?? `Chapter ${book.chapters.length + 1}`
        const chapter: Chapter = {
          id,
          name: chapterName,
          content: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        set({
          book: {
            ...book,
            chapters: [...book.chapters, chapter],
            updatedAt: timestamp,
          },
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
        const remaining = book.chapters.filter((ch) => ch.id !== id)
        if (remaining.length === 0) return // Don't delete the last chapter
        const newActiveId =
          activeChapterId === id
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
        set({ activeChapterId: id })
      },

      updateChapterContent: (content: string) => {
        const { _contentUpdateTimer } = get()
        if (_contentUpdateTimer) {
          clearTimeout(_contentUpdateTimer)
        }
        const timer = setTimeout(() => {
          const { book, activeChapterId, _pendingContent } = get()
          if (!book || !activeChapterId || !_pendingContent) return
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
