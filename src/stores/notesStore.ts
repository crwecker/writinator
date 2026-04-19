import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type {
  NotesFileData,
  PositionNote,
  StoryletNote,
} from '../types'

interface NotesState {
  /** Position notes keyed by note UUID (matching `<!-- note:<uuid> -->`). */
  positionNotes: Record<string, PositionNote>
  /** Storylet-level notes keyed by storyletId. Each storylet holds an ordered list. */
  storyletNotes: Record<string, StoryletNote[]>
  hasHydrated: boolean

  // Position note CRUD
  addPositionNote: (
    id: string,
    partial: Partial<Omit<PositionNote, 'id' | 'createdAt' | 'updatedAt'>>,
  ) => void
  updatePositionNote: (
    id: string,
    patch: Partial<Omit<PositionNote, 'id' | 'createdAt'>>,
  ) => void
  removePositionNote: (id: string) => void

  // Storylet note CRUD
  addStoryletNote: (storyletId: string, note: StoryletNote) => void
  updateStoryletNote: (
    storyletId: string,
    noteId: string,
    patch: Partial<Omit<StoryletNote, 'id' | 'storyletId' | 'createdAt'>>,
  ) => void
  removeStoryletNote: (storyletId: string, noteId: string) => void
  removeAllNotesForStorylet: (storyletId: string) => void

  // Bulk load (for file load)
  loadFromFile: (data: NotesFileData) => void
  reset: () => void
}

function nowIso(): string {
  return new Date().toISOString()
}

const localforageStorage = createJSONStorage<NotesState>(() => ({
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

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      positionNotes: {},
      storyletNotes: {},
      hasHydrated: false,

      addPositionNote: (id, partial) => {
        const timestamp = nowIso()
        const note: PositionNote = {
          id,
          body: partial.body ?? '',
          color: partial.color,
          tags: partial.tags ?? [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        set((state) => ({
          positionNotes: { ...state.positionNotes, [id]: note },
        }))
      },

      updatePositionNote: (id, patch) => {
        set((state) => {
          const existing = state.positionNotes[id]
          if (!existing) return state
          const next: PositionNote = {
            ...existing,
            ...patch,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: nowIso(),
          }
          return { positionNotes: { ...state.positionNotes, [id]: next } }
        })
      },

      removePositionNote: (id) => {
        set((state) => {
          if (!(id in state.positionNotes)) return state
          const next = { ...state.positionNotes }
          delete next[id]
          return { positionNotes: next }
        })
      },

      addStoryletNote: (storyletId, note) => {
        set((state) => {
          const existing = state.storyletNotes[storyletId] ?? []
          return {
            storyletNotes: {
              ...state.storyletNotes,
              [storyletId]: [...existing, note],
            },
          }
        })
      },

      updateStoryletNote: (storyletId, noteId, patch) => {
        set((state) => {
          const existing = state.storyletNotes[storyletId]
          if (!existing) return state
          const updated = existing.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  ...patch,
                  id: n.id,
                  storyletId: n.storyletId,
                  createdAt: n.createdAt,
                  updatedAt: nowIso(),
                }
              : n,
          )
          return {
            storyletNotes: { ...state.storyletNotes, [storyletId]: updated },
          }
        })
      },

      removeStoryletNote: (storyletId, noteId) => {
        set((state) => {
          const existing = state.storyletNotes[storyletId]
          if (!existing) return state
          const filtered = existing.filter((n) => n.id !== noteId)
          const nextMap = { ...state.storyletNotes }
          if (filtered.length === 0) {
            delete nextMap[storyletId]
          } else {
            nextMap[storyletId] = filtered
          }
          return { storyletNotes: nextMap }
        })
      },

      removeAllNotesForStorylet: (storyletId) => {
        set((state) => {
          if (!(storyletId in state.storyletNotes)) return state
          const next = { ...state.storyletNotes }
          delete next[storyletId]
          return { storyletNotes: next }
        })
      },

      loadFromFile: (data) => {
        set({
          positionNotes: data.positionNotes,
          storyletNotes: data.storyletNotes,
        })
      },

      reset: () => {
        set({ positionNotes: {}, storyletNotes: {} })
      },
    }),
    {
      name: 'writinator-notes',
      version: 1,
      storage: localforageStorage,
      partialize: (state) =>
        ({
          positionNotes: state.positionNotes,
          storyletNotes: state.storyletNotes,
        }) as unknown as NotesState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[notesStore] rehydration error:', error)
        }
        useNotesStore.setState({ hasHydrated: true })
      },
    },
  ),
)

if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __notesStore?: unknown }).__notesStore =
    useNotesStore
}

// ---------------------------------------------------------------------------
// File serialization helpers — used by fileSystem.ts section registry (Phase 2)
// ---------------------------------------------------------------------------

export function serializeNotes(): NotesFileData {
  const { positionNotes, storyletNotes } = useNotesStore.getState()
  return { positionNotes, storyletNotes }
}

export function hydrateNotes(data: NotesFileData | undefined): void {
  if (data === undefined) return
  useNotesStore.setState({
    positionNotes: data.positionNotes,
    storyletNotes: data.storyletNotes,
  })
}
