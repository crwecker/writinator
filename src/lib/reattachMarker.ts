import type { EditorView } from '@codemirror/view'
import type { Book } from '../types'
import { useStoryletStore } from '../stores/storyletStore'

export interface InsertMarkerOptions {
  book: Book
  storyletId: string
  activeStoryletId: string | null
  /** The editor; used when `storyletId` is the open storylet. */
  view: EditorView | null
  offset: number
  markerId: string
}

function markerText(before: string, markerId: string): string {
  const marker = `<!-- stat:${markerId} -->`
  return before && !/\s$/.test(before) ? ` ${marker}` : marker
}

/**
 * Put a `<!-- stat:id -->` marker back into a storylet at `offset` (a space
 * is added after a word). The open storylet is edited through the editor so
 * its live text and undo history stay intact; others are edited in the store.
 */
export function insertMarkerIntoStorylet(opts: InsertMarkerOptions): boolean {
  const { book, storyletId, activeStoryletId, view, offset, markerId } = opts
  if (storyletId === activeStoryletId && view) {
    const pos = Math.max(0, Math.min(offset, view.state.doc.length))
    const insert = markerText(view.state.doc.sliceString(Math.max(0, pos - 1), pos), markerId)
    view.dispatch({ changes: { from: pos, insert } })
    return true
  }
  const storylet = book.storylets.find((s) => s.id === storyletId)
  if (!storylet) return false
  const content = storylet.content ?? ''
  const pos = Math.max(0, Math.min(offset, content.length))
  const next = content.slice(0, pos) + markerText(content.slice(0, pos), markerId) + content.slice(pos)
  useStoryletStore.getState().setStoryletContent(storyletId, next)
  return true
}
