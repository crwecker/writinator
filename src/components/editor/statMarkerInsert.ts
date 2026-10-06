import type { EditorView } from '@codemirror/view'
import { findDocStatMarkers } from '../../lib/insertStatDelta'
import { useCharacterStore } from '../../stores/characterStore'

/**
 * "Stat Change" from the bubble toolbar: hand `onInsert` a marker id to open
 * in the delta editor. Follows insertStatDelta's merge rule — if a marker
 * already abuts the selection end (ending there first, then beginning there;
 * orphans without stored deltas skipped), that marker is reused so changes
 * accumulate in one place instead of stacking duplicate adjacent markers.
 * Otherwise a fresh `<!-- stat:uuid -->` is inserted after the selection.
 */
export function insertStatMarkerAtSelection(
  view: EditorView,
  onInsert: (markerId: string) => void
) {
  const { to } = view.state.selection.main
  const docMarkers = findDocStatMarkers(view.state.doc.toString())
  const { markers } = useCharacterStore.getState()
  const abutting = [
    ...docMarkers.filter((m) => m.to === to),
    ...docMarkers.filter((m) => m.from === to),
  ].find((m) => markers[m.id])
  if (abutting) {
    onInsert(abutting.id)
    return
  }

  const markerId = crypto.randomUUID()
  const insert = `<!-- stat:${markerId} -->`
  view.dispatch({ changes: { from: to, to: to, insert } })
  onInsert(markerId)
}
