import { create } from 'zustand'

interface PublishSyncState {
  /** Map: storyletId -> true if current content differs from last published snapshot content */
  needsSync: Record<string, boolean>
  /** Cache of last published snapshot content, keyed by storyletId */
  lastPublishedContent: Record<string, string>
  setNeedsSync: (storyletId: string, value: boolean) => void
  setLastPublishedContent: (storyletId: string, content: string) => void
  /** Evict a storylet's cached content (forces re-fetch on next book change) */
  evictLastPublishedContent: (storyletId: string) => void
  clear: () => void
}

export const usePublishSyncStore = create<PublishSyncState>((set) => ({
  needsSync: {},
  lastPublishedContent: {},
  setNeedsSync: (id, value) =>
    set((s) => ({ needsSync: { ...s.needsSync, [id]: value } })),
  setLastPublishedContent: (id, content) =>
    set((s) => ({ lastPublishedContent: { ...s.lastPublishedContent, [id]: content } })),
  evictLastPublishedContent: (id) =>
    set((s) => {
      const next = { ...s.lastPublishedContent }
      delete next[id]
      return { lastPublishedContent: next }
    }),
  clear: () => set({ needsSync: {}, lastPublishedContent: {} }),
}))
