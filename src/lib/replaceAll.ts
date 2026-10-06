import type { ReplaceScope, SearchOptions } from '../types'
import { useStoryletStore } from '../stores/storyletStore'
import { snapshotBook } from '../stores/snapshotStore'

/**
 * Replace All with a safety net: every storylet is filed in History
 * ('bulkReplace') before the replacement runs.
 */
export async function replaceAllWithSnapshot(
  options: SearchOptions,
  replacement: string,
  scope: ReplaceScope,
  targetStoryletId?: string,
): Promise<{ storyletsChanged: number; matchesReplaced: number }> {
  // Write pending typing into the book first so History gets the latest text.
  useStoryletStore.getState()._flushContentUpdate()
  const book = useStoryletStore.getState().book
  if (!book) return { storyletsChanged: 0, matchesReplaced: 0 }
  await snapshotBook(book, 'bulkReplace')
  return useStoryletStore.getState().replaceAllInBook(options, replacement, scope, targetStoryletId)
}
