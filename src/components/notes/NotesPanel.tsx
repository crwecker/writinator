import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, CornerDownRight, Pencil, Trash2 } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { useNotesStore } from '../../stores/notesStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { extractNotes, insertNoteMarker, removeNoteMarker } from '../../lib/noteUtils'
import { checkNoteConsistency } from '../../lib/noteConsistency'
import type {
  NoteConsistencyIssue,
  PositionNote,
  Storylet,
  StoryletNote,
} from '../../types'
import { TagChipInput } from './TagChipInput'
import { ColorPickerPopover } from './ColorPickerPopover'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
  focusedNoteId: string | null
  onFocusHandled: () => void
  onEditNote: (noteId: string) => void
}

interface StoryletSection {
  storylet: Storylet
  notes: Array<{ id: string; offset: number; note: PositionNote | undefined }>
}

interface StoryletNotesSection {
  storylet: Storylet
  notes: StoryletNote[]
}

function previewBody(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= 60) return collapsed
  return collapsed.slice(0, 60).trimEnd() + '\u2026'
}

function nowIso(): string {
  return new Date().toISOString()
}

/** A note matches when it contains every active filter tag (AND semantics). */
function matchesTagFilter(
  noteTags: string[] | undefined,
  filter: string[],
): boolean {
  if (filter.length === 0) return true
  if (!noteTags || noteTags.length === 0) return false
  return filter.every((f) => noteTags.includes(f))
}

// ---------------------------------------------------------------------------
// StoryletNoteRow — inline-edited textarea + tag chips + color swatch with
// debounced auto-save (400ms).
// ---------------------------------------------------------------------------

interface StoryletNoteRowProps {
  storyletId: string
  note: StoryletNote
}

function StoryletNoteRow({ storyletId, note }: StoryletNoteRowProps) {
  const updateStoryletNote = useNotesStore((s) => s.updateStoryletNote)
  const removeStoryletNote = useNotesStore((s) => s.removeStoryletNote)

  const [draft, setDraft] = useState<string>(note.body)
  const [lastSyncedUpdatedAt, setLastSyncedUpdatedAt] = useState<string>(
    note.updatedAt,
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [colorAnchor, setColorAnchor] = useState({ top: 0, left: 0 })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorSwatchRef = useRef<HTMLButtonElement>(null)

  // Reconcile external updates (file load, undo) using the "derived state
  // from props" pattern. When the store-owned updatedAt moves forward and we
  // have no pending save, re-sync the draft.
  if (note.updatedAt !== lastSyncedUpdatedAt) {
    setLastSyncedUpdatedAt(note.updatedAt)
    if (note.body !== draft) {
      setDraft(note.body)
    }
  }

  // Flush on unmount so we don't lose pending edits when the panel closes.
  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }
  }, [])

  const handleChange = useCallback(
    (value: string) => {
      setDraft(value)
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        updateStoryletNote(storyletId, note.id, { body: value })
        saveTimer.current = null
      }, 400)
    },
    [storyletId, note.id, updateStoryletNote],
  )

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateStoryletNote(storyletId, note.id, { tags })
    },
    [storyletId, note.id, updateStoryletNote],
  )

  const handleDelete = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    removeStoryletNote(storyletId, note.id)
  }, [storyletId, note.id, removeStoryletNote])

  function openColorPicker() {
    const rect = colorSwatchRef.current?.getBoundingClientRect()
    if (!rect) return
    setColorAnchor({ top: rect.bottom + 4, left: rect.left })
    setColorPickerOpen(true)
  }

  const color = note.color

  return (
    <div
      data-testid="storylet-note-row"
      data-note-id={note.id}
      className="relative group space-y-1"
    >
      <div className="relative">
        <textarea
          data-testid="storylet-note-textarea"
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Write a storylet note…"
          className="w-full min-h-[60px] resize-none bg-gray-800/40 border border-gray-700 rounded px-2 py-1.5 pr-14 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
        />
        <div className="absolute top-1 right-1 flex items-center gap-1">
          <button
            ref={colorSwatchRef}
            type="button"
            onClick={openColorPicker}
            title={color ? `Color ${color}` : 'Set color'}
            className="w-3.5 h-3.5 rounded border border-gray-600"
            style={{
              backgroundColor: color ?? 'transparent',
              backgroundImage: color
                ? undefined
                : 'repeating-linear-gradient(45deg,#374151,#374151 2px,#4b5563 2px,#4b5563 4px)',
            }}
            data-testid="storylet-note-color"
          />
          {confirmDelete ? (
            <>
              <button
                data-testid="storylet-note-delete-confirm"
                onClick={handleDelete}
                className="text-[10px] bg-red-900 hover:bg-red-800 text-red-200 rounded px-1.5 py-0.5"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-1.5 py-0.5"
              >
                No
              </button>
            </>
          ) : (
            <button
              data-testid="storylet-note-delete"
              onClick={() => setConfirmDelete(true)}
              title="Delete note"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-400 p-0.5 transition-opacity"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      <TagChipInput
        tags={note.tags ?? []}
        onChange={handleTagsChange}
        placeholder="tag"
        size="sm"
        testId="storylet-note-tags"
      />
      <ColorPickerPopover
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        currentColor={color}
        onSelect={(c) => {
          updateStoryletNote(storyletId, note.id, { color: c })
        }}
        anchorRect={colorAnchor}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// StoryletNotesGroup — sub-header + list of storylet notes + "+ Note" button.
// ---------------------------------------------------------------------------

interface StoryletNotesGroupProps {
  storylet: Storylet
  notes: StoryletNote[]
}

function StoryletNotesGroup({ storylet, notes }: StoryletNotesGroupProps) {
  const addStoryletNote = useNotesStore((s) => s.addStoryletNote)

  const handleAdd = useCallback(() => {
    const timestamp = nowIso()
    const newNote: StoryletNote = {
      id: crypto.randomUUID(),
      storyletId: storylet.id,
      body: '',
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    addStoryletNote(storylet.id, newNote)
  }, [storylet.id, addStoryletNote])

  return (
    <div
      data-testid={`storylet-notes-group-${storylet.id}`}
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          {storylet.name}
        </span>
        <button
          data-testid="storylet-note-add"
          onClick={handleAdd}
          className="text-[11px] text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-2 py-0.5"
        >
          + Note
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="text-[11px] text-gray-600 italic px-1">
          No storylet notes yet.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <StoryletNoteRow
              key={note.id}
              storyletId={storylet.id}
              note={note}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NotesPanel
// ---------------------------------------------------------------------------

export function NotesPanel({
  open,
  onClose,
  editorView,
  focusedNoteId,
  onFocusHandled,
  onEditNote,
}: Props) {
  const book = useStoryletStore((s) => s.book)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const setActiveStorylet = useStoryletStore((s) => s.setActiveStorylet)
  const positionNotes = useNotesStore((s) => s.positionNotes)
  const storyletNotes = useNotesStore((s) => s.storyletNotes)
  const addPositionNote = useNotesStore((s) => s.addPositionNote)
  const removePositionNote = useNotesStore((s) => s.removePositionNote)
  const removeAllNotesForStorylet = useNotesStore(
    (s) => s.removeAllNotesForStorylet,
  )
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  // Tag filter — chips with AND semantics across all note kinds.
  const [filterTags, setFilterTags] = useState<string[]>([])

  // Issues section: default collapsed, but auto-expand once when the panel
  // first opens with orphans to surface. `autoExpanded` latches after the
  // first auto-expand so the user can re-collapse without us re-expanding.
  const [issuesExpanded, setIssuesExpanded] = useState(false)
  const [autoExpanded, setAutoExpanded] = useState(false)

  // Jump from a panel row to the anchor in the editor. Mirrors
  // CharacterPanel.jumpToMarker but uses the notesStore / noteUtils pattern.
  const jumpToNote = useCallback(
    (noteId: string) => {
      if (!book) return
      // Find which storylet contains this anchor + its offset.
      let targetStoryletId: string | null = null
      let targetOffset = 0
      for (const storylet of book.storylets) {
        const extracted = extractNotes(storylet.content ?? '')
        const match = extracted.find((n) => n.id === noteId)
        if (match) {
          targetStoryletId = storylet.id
          targetOffset = match.offset
          break
        }
      }
      if (!targetStoryletId) return
      const doJump = () => {
        const v = editorView
        if (!v) return
        const len = v.state.doc.length
        const pos = Math.min(targetOffset, len)
        v.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
        v.focus()
      }
      if (targetStoryletId !== activeStoryletId) {
        setActiveStorylet(targetStoryletId)
        setTimeout(doJump, 30)
      } else {
        doJump()
      }
    },
    [book, activeStoryletId, editorView, setActiveStorylet],
  )

  // -------------------------------------------------------------------------
  // Issues (orphan detection) — recomputes when book or notes state changes.
  // -------------------------------------------------------------------------
  const issues = useMemo<NoteConsistencyIssue[]>(
    () => checkNoteConsistency(book, { positionNotes, storyletNotes }),
    [book, positionNotes, storyletNotes],
  )
  const issueCount = issues.length

  // First time the panel opens while issues exist, auto-expand. `autoExpanded`
  // latches after the first trigger so the user's subsequent collapse sticks.
  // Uses the "derived state during render" pattern (same as StoryletNoteRow's
  // lastSyncedUpdatedAt reconcile) to avoid react-hooks/set-state-in-effect.
  if (open && issueCount > 0 && !autoExpanded) {
    setAutoExpanded(true)
    if (!issuesExpanded) setIssuesExpanded(true)
  }

  // Resolve handlers -------------------------------------------------------

  /** Delete the store entry for an orphanNote (anchor is missing, user wants
   *  to abandon the stub). */
  const handleDeleteOrphanNoteEntry = useCallback(
    (noteId: string) => {
      removePositionNote(noteId)
    },
    [removePositionNote],
  )

  /** Insert an anchor for an orphanNote at the current editor cursor on the
   *  active storylet. */
  const handleInsertAnchorForOrphan = useCallback(
    (noteId: string) => {
      const view = editorView
      if (!view || !book) return
      const targetStoryletId = activeStoryletId ?? book.storylets[0]?.id
      if (!targetStoryletId) return
      const doInsert = () => {
        const v = editorView
        if (!v) return
        const pos = v.state.selection.main.head
        const marker = `<!-- note:${noteId} -->`
        v.dispatch({
          changes: { from: pos, to: pos, insert: marker },
          selection: { anchor: pos + marker.length },
          scrollIntoView: true,
        })
        v.focus()
      }
      if (targetStoryletId !== activeStoryletId) {
        setActiveStorylet(targetStoryletId)
        setTimeout(doInsert, 30)
      } else {
        doInsert()
      }
    },
    [editorView, book, activeStoryletId, setActiveStorylet],
  )

  /** Remove the `<!-- note:<id> -->` anchor from the storylet that owns it
   *  (inverseOrphanNote). Mirrors CharacterPanel.onRemoveOrphanFromText —
   *  switches to that storylet first if it isn't already active, then
   *  dispatches the deletion through the editor so undo history stays intact. */
  const handleRemoveAnchorFromText = useCallback(
    (noteId: string, storyletId: string) => {
      if (!book) return
      const storylet = book.storylets.find((s) => s.id === storyletId)
      if (!storylet) return
      const content = storylet.content ?? ''
      const escaped = noteId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`<!--\\s*note:${escaped}\\s*-->`)
      const match = content.match(re)
      if (!match || typeof match.index !== 'number') return
      const doRemove = () => {
        const v = editorView
        if (!v) return
        v.dispatch({
          changes: {
            from: match.index as number,
            to: (match.index as number) + match[0].length,
            insert: '',
          },
        })
      }
      if (storyletId === activeStoryletId) {
        doRemove()
      } else {
        setActiveStorylet(storyletId)
        setTimeout(doRemove, 30)
      }
      // Silence unused-imports lint — these helpers are surfaced on the panel
      // for future resolve-action expansion without needing a new import.
      void insertNoteMarker
      void removeNoteMarker
    },
    [book, activeStoryletId, editorView, setActiveStorylet],
  )

  /** Create an empty store entry so an orphaned anchor has metadata. */
  const handleCreateEntryForOrphan = useCallback(
    (noteId: string) => {
      addPositionNote(noteId, { body: '' })
    },
    [addPositionNote],
  )

  /** Drop all storylet-notes keyed to a deleted storylet. */
  const handleDeleteOrphanStoryletNotes = useCallback(
    (storyletId: string) => {
      removeAllNotesForStorylet(storyletId)
    },
    [removeAllNotesForStorylet],
  )

  // Flash + scroll into view when a row becomes focused.
  useEffect(() => {
    if (!focusedNoteId || !open) return
    const el = rowRefs.current.get(focusedNoteId)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.remove('cm-value-flash')
    void el.offsetWidth
    el.classList.add('cm-value-flash')
    const timer = setTimeout(() => {
      el.classList.remove('cm-value-flash')
      onFocusHandled()
    }, 800)
    return () => clearTimeout(timer)
  }, [focusedNoteId, open, onFocusHandled])

  // Active storylet (or fallback to first) is pinned at the top. Any other
  // storylets with notes render below in a secondary list. Filtering applies
  // after the section structure so storylet headers stay meaningful.
  const storyletNotesSections = useMemo<{
    active: StoryletNotesSection | null
    others: StoryletNotesSection[]
  }>(() => {
    if (!book) return { active: null, others: [] }
    const active =
      book.storylets.find((s) => s.id === activeStoryletId) ??
      book.storylets[0] ??
      null

    const filterList = (notes: StoryletNote[]) =>
      notes.filter((n) => matchesTagFilter(n.tags, filterTags))

    const activeSection: StoryletNotesSection | null = active
      ? { storylet: active, notes: filterList(storyletNotes[active.id] ?? []) }
      : null

    const others: StoryletNotesSection[] = []
    for (const storylet of book.storylets) {
      if (active && storylet.id === active.id) continue
      const notes = storyletNotes[storylet.id]
      if (!notes || notes.length === 0) continue
      const filtered = filterList(notes)
      if (filtered.length === 0) continue
      others.push({ storylet, notes: filtered })
    }
    return { active: activeSection, others }
  }, [book, activeStoryletId, storyletNotes, filterTags])

  const sections = useMemo<StoryletSection[]>(() => {
    if (!book) return []
    const out: StoryletSection[] = []
    for (const storylet of book.storylets) {
      const extracted = extractNotes(storylet.content ?? '')
      if (extracted.length === 0) continue
      const filtered = extracted
        .map((n) => ({
          id: n.id,
          offset: n.offset,
          note: positionNotes[n.id],
        }))
        .filter((row) => matchesTagFilter(row.note?.tags, filterTags))
      if (filtered.length === 0) continue
      out.push({ storylet, notes: filtered })
    }
    return out
  }, [book, positionNotes, filterTags])

  const totalPositionNotes = useMemo(
    () => sections.reduce((sum, s) => sum + s.notes.length, 0),
    [sections],
  )

  const filterActive = filterTags.length > 0

  if (!open) return null

  return (
    <div
      data-testid="notes-panel"
      className="flex flex-col bg-gray-900 border-l border-gray-700 h-full w-[320px] shrink-0 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">Notes</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      {/* Issues section (collapsible) */}
      <div
        data-testid="notes-panel-issues"
        className="border-b border-gray-800"
      >
        <button
          data-testid="notes-panel-issues-toggle"
          onClick={() => setIssuesExpanded((v) => !v)}
          className={`w-full flex items-center gap-1.5 px-3 py-2 text-[11px] transition-colors ${
            issueCount > 0
              ? 'text-amber-300 hover:bg-gray-800/60'
              : 'text-gray-500 hover:bg-gray-800/40'
          }`}
        >
          {issuesExpanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
          <AlertTriangle size={12} />
          <span className="uppercase tracking-wider font-semibold">Issues</span>
          {issueCount > 0 && (
            <span
              data-testid="notes-panel-issues-badge"
              className="ml-auto inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500/80 text-[9px] text-gray-900 font-semibold tabular-nums"
            >
              {issueCount}
            </span>
          )}
          {issueCount === 0 && (
            <span className="ml-auto text-gray-600 text-[10px]">all clear</span>
          )}
        </button>
        {issuesExpanded && (
          <div className="px-3 pb-3 pt-0">
            {issueCount === 0 ? (
              <div
                data-testid="notes-panel-issues-empty"
                className="text-[11px] text-gray-500 italic px-1 py-2"
              >
                No orphan notes detected.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {issues.map((issue, i) => (
                  <li
                    key={`${issue.kind}-${i}-${issue.id ?? issue.storyletId ?? ''}`}
                    data-testid={`notes-panel-issue-${issue.kind}`}
                    data-issue-kind={issue.kind}
                    className="text-[11px] text-gray-300 border border-gray-800 rounded px-2 py-1.5 space-y-1"
                  >
                    {issue.kind === 'orphanNote' && (
                      <>
                        <div>
                          <span className="text-gray-500">Store entry </span>
                          <code className="text-gray-400">
                            {issue.id.slice(0, 8)}
                            {issue.id.length > 8 ? '\u2026' : ''}
                          </code>
                          <span className="text-gray-500"> has no anchor in any storylet.</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <IssueButton
                            onClick={() => handleDeleteOrphanNoteEntry(issue.id)}
                          >
                            Delete entry
                          </IssueButton>
                          <IssueButton
                            onClick={() => handleInsertAnchorForOrphan(issue.id)}
                          >
                            Insert anchor at cursor
                          </IssueButton>
                        </div>
                      </>
                    )}
                    {issue.kind === 'inverseOrphanNote' && (
                      <>
                        <div>
                          <span className="text-gray-500">Anchor </span>
                          <code className="text-gray-400">
                            {issue.id.slice(0, 8)}
                            {issue.id.length > 8 ? '\u2026' : ''}
                          </code>
                          <span className="text-gray-500"> in text has no store entry.</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <IssueButton
                            onClick={() =>
                              handleRemoveAnchorFromText(issue.id, issue.storyletId)
                            }
                          >
                            Remove from text
                          </IssueButton>
                          <IssueButton
                            onClick={() => handleCreateEntryForOrphan(issue.id)}
                          >
                            Create empty entry
                          </IssueButton>
                        </div>
                      </>
                    )}
                    {issue.kind === 'orphanStoryletNote' && (
                      <>
                        <div>
                          <span className="text-gray-500">Storylet notes on deleted storylet </span>
                          <code className="text-gray-400">
                            {issue.storyletId.slice(0, 8)}
                            {issue.storyletId.length > 8 ? '\u2026' : ''}
                          </code>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <IssueButton
                            onClick={() =>
                              handleDeleteOrphanStoryletNotes(issue.storyletId)
                            }
                          >
                            Delete
                          </IssueButton>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="px-3 py-2 border-b border-gray-800 bg-gray-900/60">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Filter
          </span>
          {filterActive && (
            <button
              data-testid="notes-panel-filter-clear"
              onClick={() => setFilterTags([])}
              className="text-[10px] text-gray-500 hover:text-gray-200"
            >
              clear
            </button>
          )}
        </div>
        <TagChipInput
          tags={filterTags}
          onChange={setFilterTags}
          placeholder="Filter by tag…"
          size="sm"
          testId="notes-panel-filter"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Pinned: Storylet notes ----------------------------------------- */}
        {storyletNotesSections.active &&
          (storyletNotesSections.active.notes.length > 0 ||
            !filterActive ||
            storyletNotesSections.others.length > 0) && (
            <section
              data-testid="storylet-notes-section"
              className="space-y-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Storylet notes
              </div>
              {(!filterActive || storyletNotesSections.active.notes.length > 0) && (
                <StoryletNotesGroup
                  storylet={storyletNotesSections.active.storylet}
                  notes={storyletNotesSections.active.notes}
                />
              )}
              {storyletNotesSections.others.length > 0 && (
                <div
                  data-testid="storylet-notes-others"
                  className="pt-2 border-t border-gray-800 space-y-3"
                >
                  {storyletNotesSections.others.map((s) => (
                    <StoryletNotesGroup
                      key={s.storylet.id}
                      storylet={s.storylet}
                      notes={s.notes}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

        {/* Position notes ------------------------------------------------- */}
        {totalPositionNotes > 0 && (
          <section className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Position notes
            </div>
            {sections.map((section) => (
              <div
                key={section.storylet.id}
                data-testid={`notes-panel-section-${section.storylet.id}`}
                className="border border-gray-800 rounded overflow-hidden"
              >
                <div className="px-2 py-1.5 bg-gray-800/60 text-[11px] uppercase tracking-wide text-gray-400">
                  {section.storylet.name}
                </div>
                <ul className="divide-y divide-gray-800/60">
                  {section.notes.map(({ id, note }) => {
                    const body = note?.body ?? ''
                    const preview = previewBody(body)
                    const isEmpty = preview.length === 0
                    const tags = note?.tags ?? []
                    const color = note?.color ?? '#6b7280'
                    return (
                      <li
                        key={id}
                        data-testid="notes-panel-note-row"
                        data-note-id={id}
                        ref={(el) => {
                          if (el) rowRefs.current.set(id, el)
                          else rowRefs.current.delete(id)
                        }}
                        className="group flex items-start gap-2 px-2 py-2"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0 translate-y-[3px]"
                          style={{ backgroundColor: color }}
                          title={note?.color ? `Color ${note.color}` : 'No color'}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div
                            className={`text-[12px] leading-snug truncate ${
                              isEmpty ? 'text-gray-600 italic' : 'text-gray-200'
                            }`}
                            title={isEmpty ? '' : body}
                          >
                            {isEmpty ? '(empty)' : preview}
                          </div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {tags.map((t) => (
                                <span
                                  key={t}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                          <button
                            data-testid="notes-panel-jump"
                            onClick={() => jumpToNote(id)}
                            title="Jump to note in editor"
                            className="text-gray-500 hover:text-gray-200 p-0.5 rounded hover:bg-gray-800"
                          >
                            <CornerDownRight size={12} />
                          </button>
                          <button
                            data-testid="notes-panel-edit"
                            onClick={() => onEditNote(id)}
                            title="Edit note"
                            className="text-gray-500 hover:text-gray-200 p-0.5 rounded hover:bg-gray-800"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* No-match state when a filter is on but nothing matches. */}
        {book &&
          filterActive &&
          totalPositionNotes === 0 &&
          (!storyletNotesSections.active ||
            storyletNotesSections.active.notes.length === 0) &&
          storyletNotesSections.others.length === 0 && (
            <div
              data-testid="notes-panel-no-match"
              className="text-center text-xs text-gray-500 py-8"
            >
              No notes match the current filter.
            </div>
          )}

        {/* Empty state — only when there is no book at all. */}
        {!book && (
          <div
            data-testid="notes-panel-empty"
            className="text-center text-xs text-gray-500 py-8"
          >
            No notes yet.
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// IssueButton — compact action pill used inside the Issues section.
// ---------------------------------------------------------------------------

function IssueButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 text-[10px] text-gray-300 border border-gray-700 hover:border-gray-500 hover:bg-gray-800 rounded transition-colors"
    >
      {children}
    </button>
  )
}
