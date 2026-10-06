import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import { usePlayerStore } from './playerStore'
import { dealPrice } from '../lib/dailyDeal'
import {
  DEFAULT_CURSOR_ID,
  DEFAULT_FRAME_ID,
  DEFAULT_THEME_ID,
  getCosmetic,
  getGalleryFrame,
} from '../lib/cosmetics'

/**
 * Cosmetics the writer owns and has chosen. Per-writer (localforage only),
 * never saved in book files. Sound on/off and volume live in gameSettingsStore.
 */
interface CosmeticsState {
  /** Paid cosmetics bought. Free defaults are always owned. */
  owned: string[]
  editorTheme: string
  cursorStyle: string
  /** Frame for Journal gallery pictures; read the class with `galleryFrameClassName`. */
  galleryFrame: string
  /** Bought editor font, or null for the regular serif/sans/mono setting. */
  editorFont: string | null

  isOwned: (id: string) => boolean
  /** Buy a cosmetic (at today's deal price if it's on deal). */
  purchase: (id: string, now?: number) => boolean
  /** Switch to an owned theme, cursor, frame or font. */
  select: (id: string) => void
  clearFont: () => void
}

export const useCosmeticsStore = create<CosmeticsState>()(
  persist(
    (set, get) => ({
      owned: [],
      editorTheme: DEFAULT_THEME_ID,
      cursorStyle: DEFAULT_CURSOR_ID,
      galleryFrame: DEFAULT_FRAME_ID,
      editorFont: null,

      isOwned: (id) => {
        const c = getCosmetic(id)
        return c !== undefined && (c.price === 0 || get().owned.includes(id))
      },

      purchase: (id, now = Date.now()) => {
        const c = getCosmetic(id)
        if (!c || c.price === 0 || get().owned.includes(id)) return false
        if (!usePlayerStore.getState().spendCoins(dealPrice(id, c.price, now))) return false
        set((s) => ({ owned: [...s.owned, id] }))
        return true
      },

      select: (id) => {
        const c = getCosmetic(id)
        if (!c || !get().isOwned(id)) return
        if (c.kind === 'theme') set({ editorTheme: id })
        else if (c.kind === 'cursor') set({ cursorStyle: id })
        else if (c.kind === 'frame') set({ galleryFrame: id })
        else if (c.kind === 'font') set({ editorFont: id })
      },

      clearFont: () => {
        set({ editorFont: null })
      },
    }),
    {
      name: 'writinator-cosmetics',
      version: 1,
      storage: localforageJSONStorage<CosmeticsState>(),
      partialize: (s) =>
        ({
          owned: s.owned,
          editorTheme: s.editorTheme,
          cursorStyle: s.cursorStyle,
          galleryFrame: s.galleryFrame,
          editorFont: s.editorFont,
        }) as unknown as CosmeticsState,
    },
  ),
)

/** Tailwind classes for a gallery frame id (falls back to the plain oak frame). */
export function galleryFrameClassName(id: string): string {
  return getGalleryFrame(id).className
}

/** The chosen gallery frame's classes, for the Journal gallery. */
export function useGalleryFrameClass(): string {
  return useCosmeticsStore((s) => galleryFrameClassName(s.galleryFrame))
}
