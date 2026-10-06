import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Pencil, X } from 'lucide-react'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { findDocStatMarkers, mergeEntriesIntoDeltas } from '../../lib/insertStatDelta'
import { opToQuickEntry, type QuickEntryContext, type QuickEntryResult } from '../../lib/quickEntry'
import { previewOp, type OpPreview } from '../../lib/statPreview'
import { CHIP_NEUTRAL_COLOR } from '../../lib/statFormat'
import type { CharacterState, StatDelta } from '../../types'
import { QuickEntryInput } from './QuickEntryInput'
import { liveBookFor, popoverStyleAt, stateLookupAt } from './statEntryContext'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
  markerId: string | null
  onOpenFullEditor: (markerId: string) => void
}

const WIDTH = 400

interface OpRow {
  delta: StatDelta
  preview: OpPreview | null
  /** Quick-entry text for editing in place; null → only the full editor can edit it. */
  editText: string | null
  /** Character states just before this op (for re-parsing an edit). */
  before: Map<string, CharacterState>
}

/**
 * Click on a change chip: the marker's ops with before → after, inline edit
 * (re-typed in the quick-entry grammar) and delete, an "add" line, and a link
 * to the full DeltaEditorModal.
 */
export function MarkerPopover({ open, onClose, editorView, markerId, onOpenFullEditor }: Props) {
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const book = useStoryletStore((s) => s.book)
  const storyletId = useStoryletStore((s) => s.activeStoryletId)
  const [editing, setEditing] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const deltas = useMemo(() => (markerId ? markers[markerId] ?? [] : []), [markers, markerId])
  const docMarker = useMemo(
    () => (editorView && markerId ? findDocStatMarkers(editorView.state.doc.toString()).find((m) => m.id === markerId) : undefined),
    // Re-locate whenever the marker's ops change (the text may have moved too).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorView, markerId, deltas],
  )

  const { rows, after } = useMemo(() => {
    const stateBefore = stateLookupAt({
      book: liveBookFor(editorView, book, storyletId),
      storyletId,
      characters,
      markers,
      offset: docMarker?.from ?? 0,
    })
    const working = new Map<string, CharacterState>()
    const out: OpRow[] = []
    for (const d of deltas) {
      const character = characters.find((c) => c.id === d.characterId)
      const state = character ? working.get(character.id) ?? stateBefore(character.id) : undefined
      if (!character || !state) {
        out.push({ delta: d, preview: null, editText: null, before: new Map(working) })
        continue
      }
      working.set(character.id, state)
      const snapshot = new Map(working)
      const { row, after: next } = previewOp(character, state, d.op)
      out.push({ delta: d, preview: row, editText: opToQuickEntry(d.op, character, state), before: snapshot })
      working.set(character.id, next)
    }
    const afterLookup = (id: string) => working.get(id) ?? stateBefore(id)
    return { rows: out, after: afterLookup }
  }, [deltas, characters, markers, book, storyletId, editorView, docMarker])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || !editorView || !markerId) return null
  const id = markerId
  const lastCharacterId = deltas.length > 0 ? deltas[deltas.length - 1].characterId : null
  const colorOf = (cid: string) => characters.find((c) => c.id === cid)?.color ?? CHIP_NEUTRAL_COLOR

  const addContext: QuickEntryContext = { characters, stateFor: after, defaultCharacterId: lastCharacterId }

  function save(next: StatDelta[]) {
    useCharacterStore.getState().setMarker(id, next)
  }

  function remove(index: number) {
    const next = deltas.filter((_, i) => i !== index)
    if (next.length > 0) {
      save(next)
      return
    }
    // Last change gone: drop the marker comment and its store entry.
    const view = editorView
    const m = view && findDocStatMarkers(view.state.doc.toString()).find((dm) => dm.id === id)
    if (view && m) view.dispatch({ changes: { from: m.from, to: m.to, insert: '' } })
    useCharacterStore.getState().removeMarker(id)
    onClose()
  }

  function replace(index: number, result: QuickEntryResult) {
    const old = deltas[index]
    const replacement: StatDelta[] = result.ops.map((entry, i) =>
      i === 0
        ? { ...old, characterId: entry.characterId, op: entry.op }
        : { id: crypto.randomUUID(), characterId: entry.characterId, op: entry.op },
    )
    save([...deltas.slice(0, index), ...replacement, ...deltas.slice(index + 1)])
    setEditing(null)
  }

  function add(result: QuickEntryResult) {
    save(mergeEntriesIntoDeltas(deltas, result.ops, () => crypto.randomUUID()))
  }

  function fullEditor() {
    onClose()
    onOpenFullEditor(id)
  }

  return (
    <div
      ref={panelRef}
      data-testid="marker-popover"
      style={popoverStyleAt(editorView, docMarker?.from ?? editorView.state.selection.main.head, WIDTH)}
      className="z-50 rounded-lg border border-gray-700 bg-gray-900/95 p-2.5 shadow-2xl backdrop-blur-sm text-xs"
    >
      <div className="space-y-1">
        {rows.map((row, i) =>
          editing === row.delta.id && row.editText !== null ? (
            <QuickEntryInput
              key={row.delta.id}
              testId="marker-edit"
              initialValue={row.editText}
              context={{
                characters,
                stateFor: (cid) => row.before.get(cid) ?? after(cid),
                defaultCharacterId: row.delta.characterId,
              }}
              onSubmit={(result) => replace(i, result)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div key={row.delta.id}>
              <div className="group flex items-center gap-1.5">
                <div data-testid="marker-op" className="flex-1 min-w-0 truncate text-gray-300">
                  <span className="font-medium" style={{ color: colorOf(row.delta.characterId) }}>
                    {row.preview?.characterName ?? 'Unknown'}
                  </span>
                  <span className="text-gray-600"> · </span>
                  <span className="tabular-nums">{row.preview?.text ?? row.delta.op.kind}</span>
                </div>
                <button
                  type="button"
                  data-testid="marker-op-edit"
                  title={row.editText !== null ? 'Edit' : 'Edit in full editor'}
                  onClick={() => (row.editText !== null ? setEditing(row.delta.id) : fullEditor())}
                  className="p-0.5 text-gray-500 hover:text-gray-200"
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  data-testid="marker-op-delete"
                  title="Delete this change"
                  onClick={() => remove(i)}
                  className="p-0.5 text-gray-500 hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </div>
              {row.preview?.warning && <div className="pl-3 text-amber-300/90">{row.preview.warning}</div>}
              {row.delta.note?.trim() && <div className="pl-3 italic text-gray-500">“{row.delta.note.trim()}”</div>}
            </div>
          ),
        )}
        {rows.length === 0 && <p className="italic text-gray-500">No changes yet.</p>}
      </div>

      <div className="mt-2 border-t border-gray-800 pt-2">
        <QuickEntryInput
          testId="marker-add"
          resetOnSubmit
          placeholder="Add: +1 Level, -Healing Potion…"
          context={addContext}
          onSubmit={add}
          onCancel={onClose}
        />
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          data-testid="marker-full-editor"
          onClick={fullEditor}
          className="text-[10px] text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
        >
          Full editor
        </button>
      </div>
    </div>
  )
}
