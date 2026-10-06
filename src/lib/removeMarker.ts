import type { EditorView } from '@codemirror/view'
import type { Book } from '../types'
import { useStoryletStore } from '../stores/storyletStore'

/** Regex for one specific `<!-- kind:id -->` marker comment. */
export function markerCommentRegex(kind: 'stat' | 'note', id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<!--\\s*${kind}:${escaped}\\s*-->`)
}

export interface RemoveMarkerOptions {
  book: Book
  storyletId: string
  activeStoryletId: string | null
  view: EditorView | null
  pattern: RegExp
}

/**
 * Delete one marker comment from a storylet's text. Returns false when the
 * marker isn't there.
 *
 * The open storylet is edited through the editor, searching its live text —
 * the stored copy can be up to 1.5s behind what's on screen. Any other
 * storylet is edited in the store directly, without switching to it.
 */
export function removeMarkerFromStorylet(opts: RemoveMarkerOptions): boolean {
  const { book, storyletId, activeStoryletId, view, pattern } = opts
  if (storyletId === activeStoryletId && view) {
    const match = view.state.doc.toString().match(pattern)
    if (!match || typeof match.index !== 'number') return false
    view.dispatch({ changes: { from: match.index, to: match.index + match[0].length, insert: '' } })
    return true
  }
  const content = book.storylets.find((s) => s.id === storyletId)?.content ?? ''
  const match = content.match(pattern)
  if (!match || typeof match.index !== 'number') return false
  const next = content.slice(0, match.index) + content.slice(match.index + match[0].length)
  useStoryletStore.getState().setStoryletContent(storyletId, next)
  return true
}

/** Find which storylet contains a marker. */
export function findStoryletWithMarker(book: Book, pattern: RegExp): string | null {
  for (const storylet of book.storylets) {
    if (pattern.test(storylet.content ?? '')) return storylet.id
  }
  return null
}
