import type { CSSProperties } from 'react'
import type { EditorView } from '@codemirror/view'
import type { Book, Character, CharacterState, StatDelta } from '../../types'
import { computeStateAt, withLiveStorylet } from '../../lib/characterState'
import { findDocStatMarkers } from '../../lib/insertStatDelta'
import { getLiveBook } from '../editor/statRefExtension'

/**
 * The book as the editor shows it: the store's copy trails the editor by up
 * to 1.5s, so the open storylet is swapped for the live doc.
 */
export function liveBookFor(view: EditorView | null, book: Book | null, storyletId: string | null): Book | null {
  if (!book || !storyletId || !view) return book
  return getLiveBook(view.state) ?? withLiveStorylet(book, storyletId, view.state.doc.toString())
}

/** Each character's state at `offset` in the open storylet (markers strictly before it). */
export function stateLookupAt(args: {
  book: Book | null
  storyletId: string | null
  characters: Character[]
  markers: Record<string, StatDelta[]>
  offset: number
}): (characterId: string) => CharacterState | undefined {
  const { book, storyletId, characters, markers, offset } = args
  return (characterId) => {
    const c = characters.find((ch) => ch.id === characterId)
    if (!c) return undefined
    if (!book) return { base: c.baseValues, equipped: {}, activeBuffs: [] }
    const stopAt = storyletId ? { storyletId, offset } : undefined
    return computeStateAt(c, book, markers, stopAt).state
  }
}

/** Character of the last delta in the nearest stored marker before `offset`. */
export function characterBefore(text: string, markers: Record<string, StatDelta[]>, offset: number): string | null {
  const before = findDocStatMarkers(text).filter((m) => m.from < offset && markers[m.id]?.length)
  const last = before[before.length - 1]
  if (!last) return null
  const deltas = markers[last.id]
  return deltas[deltas.length - 1].characterId
}

/** Fixed-position style placing a popover just below (or above) document offset `pos`. */
export function popoverStyleAt(view: EditorView, pos: number, width: number): CSSProperties {
  let coords: { left: number; top: number; bottom: number } | null = null
  try {
    coords = view.coordsAtPos(pos) ?? view.coordsAtPos(pos, -1)
  } catch {
    coords = null
  }
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  if (!coords) return { position: 'fixed', left: Math.max(8, (vw - width) / 2), top: 96, width }
  const left = Math.min(Math.max(8, coords.left - 12), Math.max(8, vw - width - 8))
  if (coords.bottom + 280 > vh) return { position: 'fixed', left, bottom: vh - coords.top + 6, width }
  return { position: 'fixed', left, top: coords.bottom + 6, width }
}
