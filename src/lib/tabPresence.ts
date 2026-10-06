import { useStoryletStore } from '../stores/storyletStore'
import { showToast } from '../stores/genericToastStore'

/**
 * Notices another browser tab with the same book open. Every tab keeps the
 * whole book under the same browser-storage key, so two tabs editing one
 * book overwrite each other's work — the last tab to write wins.
 *
 * Tabs announce the book they have open ('hello'), answer an announcement
 * for the same book ('here'), and say 'bye' when they close it.
 */

interface PresenceMessage {
  type: 'hello' | 'here' | 'bye'
  tabId: string
  bookId: string
}

/** The subset of BroadcastChannel this module uses (lets tests fake it). */
export interface PresenceChannel {
  postMessage(message: PresenceMessage): void
  onmessage: ((event: MessageEvent<PresenceMessage>) => void) | null
  close(): void
}

let otherTabHasBook = false
const listeners = new Set<() => void>()

function setConflict(value: boolean): void {
  if (otherTabHasBook === value) return
  otherTabHasBook = value
  if (value) {
    showToast('This book is open in another tab. Edit it in one tab only, or one tab’s changes will overwrite the other’s.', 'warning')
  }
  for (const fn of listeners) fn()
}

export function subscribeTabConflict(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** True while another tab has the same book open. */
export function getTabConflict(): boolean {
  return otherTabHasBook
}

/**
 * Start announcing this tab's book. Returns a stop function. Does nothing
 * in tests (unless a channel is passed in) or where BroadcastChannel is
 * unavailable.
 */
export function startTabPresence(channel?: PresenceChannel): () => void {
  if (!channel) {
    if (import.meta.env.MODE === 'test' || typeof BroadcastChannel === 'undefined') return () => {}
    channel = new BroadcastChannel('writinator-tab-presence') as unknown as PresenceChannel
  }
  const ch = channel
  const tabId = crypto.randomUUID()
  let announcedBookId: string | null = null

  const announce = (bookId: string | null) => {
    if (announcedBookId) ch.postMessage({ type: 'bye', tabId, bookId: announcedBookId })
    setConflict(false)
    announcedBookId = bookId
    if (bookId) ch.postMessage({ type: 'hello', tabId, bookId })
  }

  ch.onmessage = (event) => {
    const msg = event.data
    if (msg.tabId === tabId || !announcedBookId || msg.bookId !== announcedBookId) return
    if (msg.type === 'bye') {
      setConflict(false)
      return
    }
    setConflict(true)
    if (msg.type === 'hello') ch.postMessage({ type: 'here', tabId, bookId: announcedBookId })
  }

  announce(useStoryletStore.getState().book?.id ?? null)
  const unsubscribe = useStoryletStore.subscribe((state, prev) => {
    if (state.book?.id !== prev.book?.id) announce(state.book?.id ?? null)
  })
  const onPageHide = () => announce(null)
  window.addEventListener('pagehide', onPageHide)

  return () => {
    unsubscribe()
    window.removeEventListener('pagehide', onPageHide)
    announce(null)
    ch.close()
  }
}
