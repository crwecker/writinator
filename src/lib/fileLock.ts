import { useSyncExternalStore } from 'react'
import { subscribeHandle, getHandleState } from './fileSystem'
import { useStoryletStore } from '../stores/storyletStore'

// A book is "locked" whenever it's loaded but not tethered to a granted file handle.
// In that state any edits would either live only in browser storage (with no recent
// file to reconnect to) or be overwritten the moment the user reconnects — both bad.
function computeLocked(hasBook: boolean, handle: ReturnType<typeof getHandleState>): boolean {
  if (!hasBook) return false
  if (!handle.hasHandle) return true
  // Treat 'unknown' as not-locked: queryPermission is async and may not have
  // resolved yet, or the browser may not support it. We have a handle, which
  // means the user actively picked the file — don't lock while we confirm.
  return handle.permission === 'denied' || handle.permission === 'prompt'
}

export function isFileLockedNow(): boolean {
  const hasBook = !!useStoryletStore.getState().book
  return computeLocked(hasBook, getHandleState())
}

export function useIsFileLocked(): boolean {
  const handle = useSyncExternalStore(subscribeHandle, getHandleState)
  const hasBook = useStoryletStore((s) => !!s.book)
  return computeLocked(hasBook, handle)
}
