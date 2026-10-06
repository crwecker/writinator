import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from '../../stores/localforageStorage'

/**
 * Display preferences for reading story mechanics in the editor (per device):
 * the chapter summary strip and whether it's folded to one short line.
 */
interface MechanicsPrefsState {
  showChapterSummary: boolean
  chapterSummaryCollapsed: boolean
  setShowChapterSummary: (show: boolean) => void
  toggleChapterSummaryCollapsed: () => void
}

export const useMechanicsPrefsStore = create<MechanicsPrefsState>()(
  persist(
    (set, get) => ({
      showChapterSummary: true,
      chapterSummaryCollapsed: false,
      setShowChapterSummary: (show) => set({ showChapterSummary: show }),
      toggleChapterSummaryCollapsed: () => set({ chapterSummaryCollapsed: !get().chapterSummaryCollapsed }),
    }),
    {
      name: 'writinator-mechanics-prefs',
      storage: localforageJSONStorage<MechanicsPrefsState>(),
      partialize: (s) =>
        ({ showChapterSummary: s.showChapterSummary, chapterSummaryCollapsed: s.chapterSummaryCollapsed }) as unknown as MechanicsPrefsState,
    },
  ),
)
