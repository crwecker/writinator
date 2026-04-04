import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { EditorPreferences } from '../types'

interface EditorState extends EditorPreferences {
  setVimMode: (enabled: boolean) => void
  toggleVimMode: () => void
  setFontFamily: (family: EditorPreferences['fontFamily']) => void
  setFontSize: (size: number) => void
  setDistractionFree: (enabled: boolean) => void
  toggleDistractionFree: () => void
  setRenderMode: (mode: EditorPreferences['renderMode']) => void
  toggleRenderMode: () => void
  toggleSidebar: () => void
  toggleDocumentCollapsed: (id: string) => void
  setCollapsedDocumentIds: (ids: string[]) => void
}

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
      renderMode: 'source',
      sidebarOpen: true,
      collapsedDocumentIds: [],

      setVimMode: (enabled: boolean) => set({ vimMode: enabled }),
      toggleVimMode: () => set({ vimMode: !get().vimMode }),
      setFontFamily: (family: EditorPreferences['fontFamily']) =>
        set({ fontFamily: family }),
      setFontSize: (size: number) => set({ fontSize: Math.max(10, Math.min(32, size)) }),
      setDistractionFree: (enabled: boolean) => set({ distractionFree: enabled }),
      toggleDistractionFree: () =>
        set({ distractionFree: !get().distractionFree }),
      setRenderMode: (mode: EditorPreferences['renderMode']) => set({ renderMode: mode }),
      toggleRenderMode: () =>
        set({ renderMode: get().renderMode === 'source' ? 'rendered' : 'source' }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      toggleDocumentCollapsed: (id: string) => {
        const current = get().collapsedDocumentIds
        set({
          collapsedDocumentIds: current.includes(id)
            ? current.filter((i) => i !== id)
            : [...current, id],
        })
      },
      setCollapsedDocumentIds: (ids: string[]) => set({ collapsedDocumentIds: ids }),
    }),
    {
      name: 'writinator-editor',
      storage: localforageStorage,
    }
  )
)
