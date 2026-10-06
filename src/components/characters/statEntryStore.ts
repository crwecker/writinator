import { create } from 'zustand'

/**
 * Which inline stat-entry surface is open: the quick-entry line at the
 * cursor, or the popover for one marker's chip. Transient (not persisted);
 * AppShell opens them from its shortcut / click handlers via getState().
 */
interface StatEntryState {
  quickEntryOpen: boolean
  popoverMarkerId: string | null
  openQuickEntry: () => void
  openMarkerPopover: (markerId: string) => void
  close: () => void
}

export const useStatEntryStore = create<StatEntryState>()((set) => ({
  quickEntryOpen: false,
  popoverMarkerId: null,
  openQuickEntry: () => set({ quickEntryOpen: true, popoverMarkerId: null }),
  openMarkerPopover: (markerId) => set({ popoverMarkerId: markerId, quickEntryOpen: false }),
  close: () => set({ quickEntryOpen: false, popoverMarkerId: null }),
}))
