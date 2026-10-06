import { create } from 'zustand'

// Active storylet's live word count. Kept out of AppShell's state so typing
// only re-renders the small components that display it.
interface WordCountState {
  wordCount: number
  setWordCount: (count: number) => void
}

export const useWordCountStore = create<WordCountState>()((set) => ({
  wordCount: 0,
  setWordCount: (count) => set({ wordCount: count }),
}))
