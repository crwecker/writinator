import type {
  Book,
  NoteConsistencyIssue,
  PositionNote,
  StoryletNote,
} from '../types'
import { extractNotes } from './noteUtils'

export interface NotesStoreState {
  positionNotes: Record<string, PositionNote>
  storyletNotes: Record<string, StoryletNote[]>
}

/**
 * Scan book + notes store for inconsistencies. Pure.
 *
 * - `orphanNote`: store has a position-note entry whose id does not appear as
 *   a `<!-- note:<id> -->` anchor in any storylet's content.
 * - `inverseOrphanNote`: a storylet's content contains a `<!-- note:<id> -->`
 *   anchor, but the store has no matching entry.
 * - `orphanStoryletNote`: the store has storylet-notes keyed to a storyletId
 *   that is not present in `book.storylets`.
 */
export function checkNoteConsistency(
  book: Book | null,
  storeState: NotesStoreState,
): NoteConsistencyIssue[] {
  const issues: NoteConsistencyIssue[] = []
  if (!book) return issues

  const storylets = book.storylets ?? []

  // Index every anchor id seen in content. A Set is enough — duplicate anchors
  // (same id inserted twice) aren't currently possible via the UI.
  const anchoredIds = new Set<string>()
  for (const storylet of storylets) {
    const content = storylet.content ?? ''
    if (!content) continue
    for (const { id } of extractNotes(content)) {
      anchoredIds.add(id)
    }
  }

  // orphanNote: store → no anchor.
  for (const id of Object.keys(storeState.positionNotes)) {
    if (!anchoredIds.has(id)) {
      issues.push({ kind: 'orphanNote', id, storyletId: undefined })
    }
  }

  // inverseOrphanNote: anchor → no store. We revisit per-storylet so we can
  // attribute each inverse orphan to its storylet (the panel's "Remove from
  // text" action needs to know which content to edit).
  const seenInverse = new Set<string>()
  for (const storylet of storylets) {
    const content = storylet.content ?? ''
    if (!content) continue
    for (const { id } of extractNotes(content)) {
      if (storeState.positionNotes[id]) continue
      if (seenInverse.has(id)) continue
      seenInverse.add(id)
      issues.push({ kind: 'inverseOrphanNote', id, storyletId: storylet.id })
    }
  }

  // orphanStoryletNote: storylet-notes keyed to a missing storylet.
  const storyletIds = new Set(storylets.map((s) => s.id))
  for (const storyletId of Object.keys(storeState.storyletNotes)) {
    if (!storyletIds.has(storyletId)) {
      issues.push({
        kind: 'orphanStoryletNote',
        id: undefined,
        storyletId,
      })
    }
  }

  return issues
}
