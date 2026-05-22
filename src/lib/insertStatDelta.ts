import type { EditorView } from '@codemirror/view'
import type { StatDelta, StatDeltaOp } from '../types'
import { STAT_MARKER_REGEX } from './markerUtils'
import { useCharacterStore } from '../stores/characterStore'

// ---------------------------------------------------------------------------
// Shared shape for a stat marker located in a document string.
// ---------------------------------------------------------------------------

export interface DocStatMarker {
  id: string
  from: number
  to: number
}

// ---------------------------------------------------------------------------
// Pure helpers — no store, no EditorView; fully unit-testable.
// ---------------------------------------------------------------------------

/**
 * Scan `text` for every `<!-- stat:uuid -->` marker and return their positions.
 * Resets lastIndex before scanning so the shared global regex is safe to call
 * from any context.
 */
export function findDocStatMarkers(text: string): DocStatMarker[] {
  STAT_MARKER_REGEX.lastIndex = 0
  const results: DocStatMarker[] = []
  let m: RegExpExecArray | null
  while ((m = STAT_MARKER_REGEX.exec(text)) !== null) {
    results.push({ id: m[1], from: m.index, to: m.index + m[0].length })
  }
  return results
}

export type StatDeltaMergeDecision =
  | { kind: 'merge'; markerId: string; deltas: StatDelta[] }
  | { kind: 'create' }

/**
 * Decide whether a new adjust-op should be merged into an existing abutting
 * marker or create a fresh one.
 *
 * Merge rule (decision E):
 *   - Only `adjust` ops ever merge; all other kinds immediately create.
 *   - An abutting marker is one whose `to === cursor` (ends at cursor) or
 *     `from === cursor` (begins at cursor). Ends-at candidates are checked first.
 *   - The abutting marker must have exactly one delta in the store, that delta
 *     must be an `adjust` op, and it must match `characterId`, `statId`, and
 *     `attributeKey` (undefined === undefined is considered equal).
 *   - On a full match the delta amounts are summed; the existing delta id is kept.
 */
export function decideStatDeltaMerge(args: {
  cursor: number
  docMarkers: DocStatMarker[]
  markers: Record<string, StatDelta[]>
  characterId: string
  op: StatDeltaOp
}): StatDeltaMergeDecision {
  if (args.op.kind !== 'adjust') return { kind: 'create' }

  // args.op is now narrowed to the adjust arm for the rest of the function.
  const endsAt = args.docMarkers.filter((m) => m.to === args.cursor)
  const beginsAt = args.docMarkers.filter((m) => m.from === args.cursor)

  for (const marker of [...endsAt, ...beginsAt]) {
    const deltas = args.markers[marker.id]
    if (!deltas || deltas.length !== 1) continue

    const existingDelta = deltas[0]
    if (existingDelta.op.kind !== 'adjust') continue
    if (existingDelta.characterId !== args.characterId) continue
    if (existingDelta.op.statId !== args.op.statId) continue
    if (existingDelta.op.attributeKey !== args.op.attributeKey) continue

    const mergedDelta: StatDelta = {
      ...existingDelta,
      op: {
        ...existingDelta.op,
        delta: existingDelta.op.delta + args.op.delta,
      },
    }
    return { kind: 'merge', markerId: marker.id, deltas: [mergedDelta] }
  }

  return { kind: 'create' }
}

// ---------------------------------------------------------------------------
// Impure orchestrator — reads live editor state and the character store.
// ---------------------------------------------------------------------------

/**
 * Insert a stat-delta marker at the current cursor position, or merge into an
 * abutting marker when the merge rule is satisfied.
 *
 * Store state is read at call time (not captured in a closure) to avoid stale
 * data when a button is clicked rapidly.
 *
 * Does NOT call `view.focus()` — callers control focus.
 */
export function insertStatDelta(
  view: EditorView,
  characterId: string,
  op: StatDeltaOp
): void {
  const cursor = view.state.selection.main.head
  const text = view.state.doc.toString()
  const docMarkers = findDocStatMarkers(text)

  const { markers, setMarker } = useCharacterStore.getState()
  const decision = decideStatDeltaMerge({ cursor, docMarkers, markers, characterId, op })

  if (decision.kind === 'merge') {
    setMarker(decision.markerId, decision.deltas)
    return
  }

  const markerId = crypto.randomUUID()
  const insert = `<!-- stat:${markerId} -->`
  // Place the cursor after the inserted marker so the panel's computeStateAt
  // (which stops at markers whose offset >= cursor) reflects this new delta.
  view.dispatch({
    changes: { from: cursor, to: cursor, insert },
    selection: { anchor: cursor + insert.length },
  })
  setMarker(markerId, [{ id: crypto.randomUUID(), characterId, op }])
}
