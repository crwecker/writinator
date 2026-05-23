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
 * Numeric ops that combine by summing their `delta` when they hit the same
 * target inside one marker. All carry a `delta: number` field.
 */
function isCombinableTarget(a: StatDeltaOp, b: StatDeltaOp): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'adjust' && b.kind === 'adjust') {
    // `attributeKey` distinguishes per-key attributeSet adjusts.
    return a.statId === b.statId && a.attributeKey === b.attributeKey
  }
  if (a.kind === 'maxAdjust' && b.kind === 'maxAdjust') {
    return a.statId === b.statId
  }
  if (a.kind === 'itemFieldAdjust' && b.kind === 'itemFieldAdjust') {
    // Item identity is case-insensitive (decision C).
    return (
      a.statId === b.statId &&
      a.field === b.field &&
      a.name.toLowerCase() === b.name.toLowerCase()
    )
  }
  return false
}

/** Sum two same-kind numeric ops; returns `existing` unchanged for other kinds. */
function combineOps(existing: StatDeltaOp, incoming: StatDeltaOp): StatDeltaOp {
  if (existing.kind === 'adjust' && incoming.kind === 'adjust') {
    return { ...existing, delta: existing.delta + incoming.delta }
  }
  if (existing.kind === 'maxAdjust' && incoming.kind === 'maxAdjust') {
    return { ...existing, delta: existing.delta + incoming.delta }
  }
  if (existing.kind === 'itemFieldAdjust' && incoming.kind === 'itemFieldAdjust') {
    return { ...existing, delta: existing.delta + incoming.delta }
  }
  return existing
}

/**
 * Decide whether a new op should be merged into an existing abutting marker or
 * create a fresh one.
 *
 * Merge rule (decision E, revised 2026-05-22):
 *   - If any marker abuts the cursor, the op ALWAYS updates that marker instead
 *     of creating a new one — a "stat block at the cursor" accumulates changes.
 *   - An abutting marker is one whose `to === cursor` (ends at cursor) or
 *     `from === cursor` (begins at cursor). Ends-at candidates are checked first.
 *   - Inside the marker: if a delta of the same `characterId` already targets the
 *     same combinable numeric op (`adjust` / `maxAdjust` / `itemFieldAdjust` on
 *     the same stat/key/item+field), the amounts are summed onto that delta;
 *     otherwise the op is appended as a new delta (order is preserved — it is
 *     user-reorderable in the DeltaEditorModal).
 *   - Orphan markers (text present, no store entry) are skipped — never merged.
 *
 * Pure: the caller supplies `newDeltaId` so this stays deterministic / testable.
 */
export function decideStatDeltaMerge(args: {
  cursor: number
  docMarkers: DocStatMarker[]
  markers: Record<string, StatDelta[]>
  characterId: string
  op: StatDeltaOp
  newDeltaId: string
}): StatDeltaMergeDecision {
  const { op, characterId, newDeltaId } = args
  const endsAt = args.docMarkers.filter((m) => m.to === args.cursor)
  const beginsAt = args.docMarkers.filter((m) => m.from === args.cursor)

  for (const marker of [...endsAt, ...beginsAt]) {
    const deltas = args.markers[marker.id]
    if (!deltas) continue // orphan marker — don't merge into it

    const combineIdx = deltas.findIndex(
      (d) => d.characterId === characterId && isCombinableTarget(d.op, op),
    )
    const nextDeltas =
      combineIdx >= 0
        ? deltas.map((d, i) =>
            i === combineIdx ? { ...d, op: combineOps(d.op, op) } : d,
          )
        : [...deltas, { id: newDeltaId, characterId, op }]
    return { kind: 'merge', markerId: marker.id, deltas: nextDeltas }
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
  const newDeltaId = crypto.randomUUID()
  const decision = decideStatDeltaMerge({
    cursor,
    docMarkers,
    markers,
    characterId,
    op,
    newDeltaId,
  })

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
  setMarker(markerId, [{ id: newDeltaId, characterId, op }])
}
