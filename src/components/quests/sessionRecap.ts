import { create } from 'zustand'
import { onQuestProgress } from '../../stores/imageRevealStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { getRecentRecordBreaks, type RecordBreak } from '../../stores/recordsStore'

export interface SessionRecapData {
  /** Words counted as writing (pastes over 50 words and undo excluded). */
  words: number
  /** Distinct clock minutes in which words were counted. */
  minutesActive: number
  questsFinished: number
  /** Coins from quests (session + board rewards, partial pay for timed-out ones). */
  coinsEarned: number
  reason: 'idle' | 'close'
  /** Personal records set or improved during the session. */
  records: RecordBreak[]
}

interface SessionRecapState {
  recap: SessionRecapData | null
  dismiss: () => void
}

/** Transient (not persisted): the recap card waiting to be seen. */
export const useSessionRecapStore = create<SessionRecapState>()((set) => ({
  recap: null,
  dismiss: () => set({ recap: null }),
}))

export const RECAP_IDLE_MS = 10 * 60 * 1000

// The writing session being tallied: from the first counted words after app
// start (or after the last recap) until 10 idle minutes or the book closes.
interface Tally {
  /** When the first counted words arrived (null until then). */
  startedAt: number | null
  words: number
  minutes: Set<number>
  questsFinished: number
  coinsEarned: number
}

let tally: Tally = emptyTally()
let idleTimer: ReturnType<typeof setTimeout> | null = null

function emptyTally(): Tally {
  return { startedAt: null, words: 0, minutes: new Set(), questsFinished: 0, coinsEarned: 0 }
}

function clearIdleTimer(): void {
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = null
}

/** Show the recap for the session so far (if anything was written) and start a new tally. */
export function endWritingSession(reason: SessionRecapData['reason']): void {
  clearIdleTimer()
  if (tally.words <= 0) return
  const recap: SessionRecapData = {
    words: tally.words,
    minutesActive: tally.minutes.size,
    questsFinished: tally.questsFinished,
    coinsEarned: tally.coinsEarned,
    reason,
    records: tally.startedAt === null ? [] : getRecentRecordBreaks(tally.startedAt),
  }
  tally = emptyTally()
  useSessionRecapStore.setState({ recap })
}

/**
 * Tally counted words and quest payouts, and show the recap after 10 idle
 * minutes or when the book is closed. Returns an uninstall function.
 */
export function installSessionTracker(): () => void {
  const offProgress = onQuestProgress(({ words, coins, finished }) => {
    tally.coinsEarned += coins
    tally.questsFinished += finished
    if (words <= 0) return
    tally.startedAt ??= Date.now()
    tally.words += words
    tally.minutes.add(Math.floor(Date.now() / 60_000))
    clearIdleTimer()
    idleTimer = setTimeout(() => endWritingSession('idle'), RECAP_IDLE_MS)
  })
  // closeBook flushes pending typing (counting it) before clearing the book.
  const offBook = useStoryletStore.subscribe((state, prev) => {
    if (prev.book && !state.book) endWritingSession('close')
  })
  return () => {
    offProgress()
    offBook()
    clearIdleTimer()
  }
}

/** Test helper. */
export function resetSessionTracker(): void {
  clearIdleTimer()
  tally = emptyTally()
  useSessionRecapStore.setState({ recap: null })
}
