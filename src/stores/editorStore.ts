import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { EditorPreferences } from '../types'

interface EditorState extends EditorPreferences {
  /** Transient: current CodeMirror main-selection head offset. Not persisted. */
  cursorOffset: number
  /** Recently used text colors (most recent first, capped). */
  recentColors: string[]
  setVimMode: (enabled: boolean) => void
  toggleVimMode: () => void
  setFontFamily: (family: EditorPreferences['fontFamily']) => void
  setFontSize: (size: number) => void
  setDistractionFree: (enabled: boolean) => void
  toggleDistractionFree: () => void
  setRenderMode: (mode: EditorPreferences['renderMode']) => void
  toggleRenderMode: () => void
  toggleSidebar: () => void
  toggleStoryletCollapsed: (id: string) => void
  setCollapsedStoryletIds: (ids: string[]) => void
  setCursorOffset: (offset: number) => void
  pushRecentColor: (color: string) => void
}

const RECENT_COLORS_MAX = 8

const localforageStorage = createJSONStorage<EditorState>(() => ({
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

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      // Defaults
      vimMode: false,
      fontFamily: 'serif',
      fontSize: 16,
      distractionFree: false,
      renderMode: 'preview',
      sidebarOpen: true,
      collapsedStoryletIds: [],
      cursorOffset: 0,
      recentColors: [],

      setVimMode: (enabled: boolean) => set({ vimMode: enabled }),
      toggleVimMode: () => set({ vimMode: !get().vimMode }),
      setFontFamily: (family: EditorPreferences['fontFamily']) =>
        set({ fontFamily: family }),
      setFontSize: (size: number) => set({ fontSize: Math.max(10, Math.min(32, size)) }),
      setDistractionFree: (enabled: boolean) => set({ distractionFree: enabled }),
      toggleDistractionFree: () =>
        set({ distractionFree: !get().distractionFree }),
      setRenderMode: (mode: EditorPreferences['renderMode']) => set({ renderMode: mode }),
      toggleRenderMode: () => {
        const next: Record<EditorPreferences['renderMode'], EditorPreferences['renderMode']> = {
          source: 'rendered',
          rendered: 'preview',
          preview: 'source',
        }
        set({ renderMode: next[get().renderMode] })
      },
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      toggleStoryletCollapsed: (id: string) => {
        const current = get().collapsedStoryletIds
        set({
          collapsedStoryletIds: current.includes(id)
            ? current.filter((i) => i !== id)
            : [...current, id],
        })
      },
      setCollapsedStoryletIds: (ids: string[]) => set({ collapsedStoryletIds: ids }),
      setCursorOffset: (offset: number) => {
        if (get().cursorOffset === offset) return
        set({ cursorOffset: offset })
      },
      pushRecentColor: (color: string) => {
        const normalized = color.toLowerCase()
        const current = get().recentColors
        const next = [normalized, ...current.filter((c) => c.toLowerCase() !== normalized)].slice(
          0,
          RECENT_COLORS_MAX
        )
        set({ recentColors: next })
      },
    }),
    {
      name: 'writinator-editor',
      storage: localforageStorage,
      partialize: (state) =>
        ({
          vimMode: state.vimMode,
          fontFamily: state.fontFamily,
          fontSize: state.fontSize,
          distractionFree: state.distractionFree,
          renderMode: state.renderMode,
          sidebarOpen: state.sidebarOpen,
          collapsedStoryletIds: state.collapsedStoryletIds,
          recentColors: state.recentColors,
        }) as unknown as EditorState,
    }
  )
)
