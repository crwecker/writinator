import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ChevronDown, ChevronRight, CornerDownRight, Tag, Trash2, Unlink } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { useNotesStore } from '../../stores/notesStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { extractNotes } from '../../lib/noteUtils'
import { checkNoteConsistency } from '../../lib/noteConsistency'
import type {
  PositionNote,
  Storylet,
  StoryletNote,
} from '../../types'
import { TagChipInput } from './TagChipInput'
import { ColorPickerPopover } from './ColorPickerPopover'
import { TagPopover } from './TagPopover'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
  focusedNoteId: string | null
  onFocusHandled: () => void
  /** When true, render only the inner body — skip outer wrapper and header. */
  embedded?: boolean
}

interface StoryletSection {
  storylet: Storylet
  notes: Array<{ id: string; offset: number; note: PositionNote }>
}

interface StoryletNotesSection {
  storylet: Storylet
  notes: StoryletNote[]
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

/** First non-empty line of a note body, trimmed for preview. */
function firstLine(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return ''
}

/** Resize a textarea to fit its content — call after every value change. */
function autosize(el: HTMLTextAreaElement | null): void {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// ---------------------------------------------------------------------------
// StoryletNoteRow — inline-edited textarea + tag chips + color swatch with
// debounced auto-save (400ms).
// ---------------------------------------------------------------------------

interface StoryletNoteRowProps {
  storyletId: string
  note: StoryletNote
  /** When true, render expanded on initial mount (e.g. just created). */
  initiallyExpanded?: boolean
}

function StoryletNoteRow({
  storyletId,
  note,
  initiallyExpanded = false,
}: StoryletNoteRowProps) {
  const updateStoryletNote = useNotesStore((s) => s.updateStoryletNote)
  const removeStoryletNote = useNotesStore((s) => s.removeStoryletNote)

  const [draft, setDraft] = useState<string>(note.body)
  const [lastSyncedUpdatedAt, setLastSyncedUpdatedAt] = useState<string>(
    note.updatedAt,
  )
  const [expanded, setExpanded] = useState<boolean>(
    initiallyExpanded || !note.body.trim(),
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [colorAnchor, setColorAnchor] = useState({ top: 0, left: 0 })
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [tagAnchor, setTagAnchor] = useState({ top: 0, left: 0 })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorSwatchRef = useRef<HTMLButtonElement>(null)
  const tagButtonRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Autosize textarea to its content whenever the draft (or expansion) changes.
  useLayoutEffect(() => {
    if (expanded) autosize(textareaRef.current)
  }, [draft, expanded])

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

  function openTagPopover() {
    const rect = tagButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    setTagAnchor({ top: rect.bottom + 4, left: rect.left })
    setTagPopoverOpen(true)
  }

  const color = note.color
  const tagCount = note.tags?.length ?? 0
  const preview = firstLine(draft)

  return (
    <div
      data-testid="storylet-note-row"
      data-note-id={note.id}
      data-expanded={expanded}
      className="relative group"
    >
      {expanded ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            data-testid="storylet-note-textarea"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write a storylet note…"
            className="w-full resize-none overflow-hidden bg-gray-800/40 border border-gray-700 rounded px-2 py-1.5 pr-24 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            style={{ minHeight: 60 }}
          />
          <div className="absolute top-1 right-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="Collapse"
              className="text-gray-500 hover:text-gray-200 p-0.5 rounded hover:bg-gray-800"
              data-testid="storylet-note-collapse"
            >
              <ChevronDown size={12} />
            </button>
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
            <button
              ref={tagButtonRef}
              type="button"
              onClick={openTagPopover}
              title={tagCount ? `${tagCount} tag${tagCount === 1 ? '' : 's'}` : 'Add tags'}
              className={`relative p-0.5 rounded hover:bg-gray-800 ${
                tagCount > 0 ? 'text-gray-300' : 'text-gray-500 hover:text-gray-300'
              }`}
              data-testid="storylet-note-tag-toggle"
            >
              <Tag size={12} />
              {tagCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 text-[8px] leading-none bg-blue-500 text-white rounded-full w-3 h-3 flex items-center justify-center font-semibold">
                  {tagCount}
                </span>
              )}
            </button>
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
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="storylet-note-collapsed"
          className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-left text-gray-300 bg-gray-800/40 border border-gray-700 rounded hover:bg-gray-800/70 hover:border-gray-600"
        >
          <ChevronRight size={12} className="text-gray-500 shrink-0" />
          {color && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
          )}
          <span className="flex-1 truncate">
            {preview || <span className="italic text-gray-500">(empty)</span>}
          </span>
          {tagCount > 0 && (
            <span className="text-[9px] text-gray-500 shrink-0">
              {tagCount} tag{tagCount === 1 ? '' : 's'}
            </span>
          )}
        </button>
      )}
      <ColorPickerPopover
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        currentColor={color}
        onSelect={(c) => {
          updateStoryletNote(storyletId, note.id, { color: c })
        }}
        anchorRect={colorAnchor}
      />
      <TagPopover
        open={tagPopoverOpen}
        onClose={() => setTagPopoverOpen(false)}
        tags={note.tags ?? []}
        onChange={handleTagsChange}
        anchorRect={tagAnchor}
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
  const [collapsed, setCollapsed] = useState(false)
  const [justAddedId, setJustAddedId] = useState<string | null>(null)

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
    setJustAddedId(newNote.id)
    if (collapsed) setCollapsed(false)
  }, [storylet.id, addStoryletNote, collapsed])

  return (
    <div
      data-testid={`storylet-notes-group-${storylet.id}`}
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          data-testid={`storylet-notes-group-toggle-${storylet.id}`}
          className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-400 hover:text-gray-200"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>{storylet.name}</span>
          {collapsed && notes.length > 0 && (
            <span className="text-gray-500 lowercase tracking-normal">
              ({notes.length})
            </span>
          )}
        </button>
        <button
          data-testid="storylet-note-add"
          onClick={handleAdd}
          className="text-[11px] text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-2 py-0.5"
        >
          + Note
        </button>
      </div>
      {!collapsed &&
        (notes.length === 0 ? (
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
                initiallyExpanded={note.id === justAddedId}
              />
            ))}
          </div>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PositionNoteRow — inline-edited textarea + tag chips + color swatch with
// debounced auto-save (400ms). Adds a Jump-to-anchor button compared to the
// StoryletNoteRow. Row exposes its <li> via registerRowRef so the parent
// panel can scroll / flash / focus it when focusedNoteId matches.
// ---------------------------------------------------------------------------

interface PositionNoteRowProps {
  id: string
  note: PositionNote
  autoFocusTextarea: boolean
  registerRowRef: (id: string, el: HTMLLIElement | null) => void
  onJump: (id: string) => void
  onDelete: (id: string) => void
}

function PositionNoteRow({
  id,
  note,
  autoFocusTextarea,
  registerRowRef,
  onJump,
  onDelete,
}: PositionNoteRowProps) {
  const updatePositionNote = useNotesStore((s) => s.updatePositionNote)

  const [draft, setDraft] = useState<string>(note.body)
  const [lastSyncedUpdatedAt, setLastSyncedUpdatedAt] = useState<string>(
    note.updatedAt,
  )
  const [expanded, setExpanded] = useState<boolean>(
    autoFocusTextarea || !note.body.trim(),
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [colorAnchor, setColorAnchor] = useState({ top: 0, left: 0 })
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [tagAnchor, setTagAnchor] = useState({ top: 0, left: 0 })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const colorSwatchRef = useRef<HTMLButtonElement>(null)
  const tagButtonRef = useRef<HTMLButtonElement>(null)

  // Reconcile external updates (file load, undo) — mirrors StoryletNoteRow.
  if (note.updatedAt !== lastSyncedUpdatedAt) {
    setLastSyncedUpdatedAt(note.updatedAt)
    if (note.body !== draft) setDraft(note.body)
  }

  // When the row becomes focused (new note, marker click), expand and focus.
  // Track the last-seen autoFocus value so we react to false→true transitions
  // without writing setState from inside an effect.
  const [lastAutoFocus, setLastAutoFocus] = useState<boolean>(autoFocusTextarea)
  if (autoFocusTextarea !== lastAutoFocus) {
    setLastAutoFocus(autoFocusTextarea)
    if (autoFocusTextarea && !expanded) setExpanded(true)
  }
  useEffect(() => {
    if (autoFocusTextarea) textareaRef.current?.focus()
  }, [autoFocusTextarea])

  // Autosize textarea to its content while expanded.
  useLayoutEffect(() => {
    if (expanded) autosize(textareaRef.current)
  }, [draft, expanded])

  // Flush on unmount.
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
        updatePositionNote(id, { body: value })
        saveTimer.current = null
      }, 400)
    },
    [id, updatePositionNote],
  )

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updatePositionNote(id, { tags })
    },
    [id, updatePositionNote],
  )

  function openColorPicker() {
    const rect = colorSwatchRef.current?.getBoundingClientRect()
    if (!rect) return
    setColorAnchor({ top: rect.bottom + 4, left: rect.left })
    setColorPickerOpen(true)
  }

  function openTagPopover() {
    const rect = tagButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    setTagAnchor({ top: rect.bottom + 4, left: rect.left })
    setTagPopoverOpen(true)
  }

  const color = note.color
  const tagCount = note.tags?.length ?? 0
  const preview = firstLine(draft)

  return (
    <li
      ref={(el) => registerRowRef(id, el)}
      data-testid="notes-panel-note-row"
      data-note-id={id}
      data-expanded={expanded}
      className="group relative px-2 py-2"
    >
      {expanded ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            data-testid="position-note-textarea"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write a note…"
            className="w-full resize-none overflow-hidden bg-gray-800/40 border border-gray-700 rounded px-2 py-1.5 pr-32 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            style={{ minHeight: 60 }}
          />
          <div className="absolute top-1 right-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="Collapse"
              className="text-gray-500 hover:text-gray-200 p-0.5 rounded hover:bg-gray-800"
              data-testid="position-note-collapse"
            >
              <ChevronDown size={12} />
            </button>
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
              data-testid="position-note-color"
            />
            <button
              ref={tagButtonRef}
              type="button"
              onClick={openTagPopover}
              title={tagCount ? `${tagCount} tag${tagCount === 1 ? '' : 's'}` : 'Add tags'}
              className={`relative p-0.5 rounded hover:bg-gray-800 ${
                tagCount > 0 ? 'text-gray-300' : 'text-gray-500 hover:text-gray-300'
              }`}
              data-testid="position-note-tag-toggle"
            >
              <Tag size={12} />
              {tagCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 text-[8px] leading-none bg-blue-500 text-white rounded-full w-3 h-3 flex items-center justify-center font-semibold">
                  {tagCount}
                </span>
              )}
            </button>
            <button
              data-testid="notes-panel-jump"
              type="button"
              onClick={() => onJump(id)}
              title="Jump to note in editor"
              className="text-gray-500 hover:text-gray-200 p-0.5 rounded hover:bg-gray-800"
            >
              <CornerDownRight size={12} />
            </button>
            {confirmDelete ? (
              <>
                <button
                  data-testid="position-note-delete-confirm"
                  onClick={() => {
                    setConfirmDelete(false)
                    onDelete(id)
                  }}
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
                data-testid="position-note-delete"
                onClick={() => setConfirmDelete(true)}
                title="Delete note"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-400 p-0.5 transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          data-testid="position-note-collapsed"
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-300 bg-gray-800/40 border border-gray-700 rounded hover:bg-gray-800/70 hover:border-gray-600"
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex flex-1 items-center gap-1.5 min-w-0 text-left"
          >
            <ChevronRight size={12} className="text-gray-500 shrink-0" />
            {color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="flex-1 truncate">
              {preview || <span className="italic text-gray-500">(empty)</span>}
            </span>
            {tagCount > 0 && (
              <span className="text-[9px] text-gray-500 shrink-0">
                {tagCount} tag{tagCount === 1 ? '' : 's'}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onJump(id)}
            title="Jump to note in editor"
            className="text-gray-500 hover:text-gray-200 p-0.5 rounded hover:bg-gray-800 shrink-0"
            data-testid="notes-panel-jump-collapsed"
          >
            <CornerDownRight size={12} />
          </button>
        </div>
      )}
      <ColorPickerPopover
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        currentColor={color}
        onSelect={(c) => updatePositionNote(id, { color: c })}
        anchorRect={colorAnchor}
      />
      <TagPopover
        open={tagPopoverOpen}
        onClose={() => setTagPopoverOpen(false)}
        tags={note.tags ?? []}
        onChange={handleTagsChange}
        anchorRect={tagAnchor}
      />
    </li>
  )
}

// ---------------------------------------------------------------------------
// PositionNotesSection — collapsible storylet card holding position-note rows.
// Auto-expands when a contained note is focused (e.g. clicked from the editor).
// ---------------------------------------------------------------------------

interface PositionNotesSectionProps {
  section: StoryletSection
  focusedNoteId: string | null
  registerRowRef: (id: string, el: HTMLLIElement | null) => void
  onJump: (id: string) => void
  onDelete: (id: string) => void
}

function PositionNotesSection({
  section,
  focusedNoteId,
  registerRowRef,
  onJump,
  onDelete,
}: PositionNotesSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const containsFocused =
    !!focusedNoteId && section.notes.some((n) => n.id === focusedNoteId)

  // Auto-expand the section when a focused note lives inside it. Uses the
  // "derived state during render" pattern so we don't setState in an effect.
  const [lastFocusedSeen, setLastFocusedSeen] = useState<string | null>(null)
  if (containsFocused && focusedNoteId !== lastFocusedSeen) {
    setLastFocusedSeen(focusedNoteId)
    if (collapsed) setCollapsed(false)
  } else if (!containsFocused && lastFocusedSeen !== null) {
    setLastFocusedSeen(null)
  }

  return (
    <div
      data-testid={`notes-panel-section-${section.storylet.id}`}
      className="border border-gray-800 rounded overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        data-testid={`notes-panel-section-toggle-${section.storylet.id}`}
        className="w-full flex items-center gap-1 px-2 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-[11px] uppercase tracking-wide text-gray-400 hover:text-gray-200"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span>{section.storylet.name}</span>
        {collapsed && (
          <span className="text-gray-500 lowercase tracking-normal ml-1">
            ({section.notes.length})
          </span>
        )}
      </button>
      {!collapsed && (
        <ul className="divide-y divide-gray-800/60">
          {section.notes.map(({ id, note }) => (
            <PositionNoteRow
              key={id}
              id={id}
              note={note}
              autoFocusTextarea={focusedNoteId === id}
              registerRowRef={registerRowRef}
              onJump={onJump}
              onDelete={onDelete}
            />
          ))}
        </ul>
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
  embedded = false,
}: Props) {
  const book = useStoryletStore((s) => s.book)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const setActiveStorylet = useStoryletStore((s) => s.setActiveStorylet)
  const positionNotes = useNotesStore((s) => s.positionNotes)
  const storyletNotes = useNotesStore((s) => s.storyletNotes)
  const removePositionNote = useNotesStore((s) => s.removePositionNote)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  // Tag filter — chips with AND semantics across all note kinds.
  const [filterTags, setFilterTags] = useState<string[]>([])

  // Unanchored-notes section: default expanded so authors can immediately see
  // and resolve unanchored notes when they open the panel.
  const [unanchoredExpanded, setUnanchoredExpanded] = useState(true)

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
  // Unanchored notes — store entries whose anchor is missing from every
  // storylet's content. The non-orphan `inverseOrphanNote` /
  // `orphanStoryletNote` consistency checks are still detected silently; they
  // represent rare data-integrity edge cases that don't fit this surface.
  // -------------------------------------------------------------------------
  const unanchoredNotes = useMemo<Array<{ id: string; note: PositionNote }>>(
    () => {
      const issues = checkNoteConsistency(book, { positionNotes, storyletNotes })
      return issues
        .filter((i): i is Extract<typeof i, { kind: 'orphanNote' }> =>
          i.kind === 'orphanNote',
        )
        .map((i) => ({ id: i.id, note: positionNotes[i.id]! }))
        .filter((entry) => entry.note !== undefined)
    },
    [book, positionNotes, storyletNotes],
  )
  const unanchoredCount = unanchoredNotes.length

  // Resolve handlers -------------------------------------------------------

  /** Delete the store entry for an unanchored note. */
  const handleDeleteUnanchoredNote = useCallback(
    (noteId: string) => {
      removePositionNote(noteId)
    },
    [removePositionNote],
  )

  /** Insert an anchor for an unanchored note at the current editor cursor on
   *  the active storylet. */
  const handleInsertAnchorForUnanchored = useCallback(
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

  // Rows without a store entry are orphaned anchors — surfaced in the Issues
  // section, excluded from the main list.
  const sections = useMemo<StoryletSection[]>(() => {
    if (!book) return []
    const out: StoryletSection[] = []
    for (const storylet of book.storylets) {
      const extracted = extractNotes(storylet.content ?? '')
      if (extracted.length === 0) continue
      const filtered: StoryletSection['notes'] = []
      for (const n of extracted) {
        const note = positionNotes[n.id]
        if (!note) continue
        if (!matchesTagFilter(note.tags, filterTags)) continue
        filtered.push({ id: n.id, offset: n.offset, note })
      }
      if (filtered.length === 0) continue
      out.push({ storylet, notes: filtered })
    }
    return out
  }, [book, positionNotes, filterTags])

  const registerRowRef = useCallback(
    (id: string, el: HTMLLIElement | null) => {
      if (el) rowRefs.current.set(id, el)
      else rowRefs.current.delete(id)
    },
    [],
  )

  /** Delete a position note: remove the anchor from its owning storylet's
   *  content (via editor dispatch to preserve undo history), then drop the
   *  store entry. Mirrors the old NoteEditorModal delete flow. */
  const handleDeletePositionNote = useCallback(
    (noteId: string) => {
      if (!book) {
        removePositionNote(noteId)
        return
      }
      let owningStoryletId: string | null = null
      let anchorStart = -1
      let anchorLen = 0
      for (const storylet of book.storylets) {
        const content = storylet.content ?? ''
        const escaped = noteId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`<!--\\s*note:${escaped}\\s*-->`)
        const match = content.match(re)
        if (match && typeof match.index === 'number') {
          owningStoryletId = storylet.id
          anchorStart = match.index
          anchorLen = match[0].length
          break
        }
      }
      const dropStore = () => removePositionNote(noteId)
      if (!owningStoryletId || anchorStart < 0) {
        dropStore()
        return
      }
      const dispatchRemoval = () => {
        const v = editorView
        if (!v) {
          dropStore()
          return
        }
        v.dispatch({
          changes: { from: anchorStart, to: anchorStart + anchorLen, insert: '' },
        })
        dropStore()
      }
      if (owningStoryletId === activeStoryletId) {
        dispatchRemoval()
      } else {
        setActiveStorylet(owningStoryletId)
        setTimeout(dispatchRemoval, 30)
      }
    },
    [book, activeStoryletId, editorView, setActiveStorylet, removePositionNote],
  )

  const totalPositionNotes = useMemo(
    () => sections.reduce((sum, s) => sum + s.notes.length, 0),
    [sections],
  )

  const filterActive = filterTags.length > 0

  if (!open) return null

  const body = (
    <>
      {/* Filter bar */}
      <div className="px-3 py-2 border-b border-gray-800 bg-gray-900/60">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Filter notes
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
              <PositionNotesSection
                key={section.storylet.id}
                section={section}
                focusedNoteId={focusedNoteId}
                registerRowRef={registerRowRef}
                onJump={jumpToNote}
                onDelete={handleDeletePositionNote}
              />
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

        {/* Unanchored notes — only rendered when at least one exists.
            Sits at the bottom so unresolved notes don't push primary content
            below the fold. */}
        {unanchoredCount > 0 && (
          <section
            data-testid="notes-panel-unanchored"
            className="pt-3 border-t border-gray-800"
          >
            <button
              data-testid="notes-panel-unanchored-toggle"
              onClick={() => setUnanchoredExpanded((v) => !v)}
              className="w-full flex items-center gap-1.5 py-1 text-[11px] text-amber-300 hover:text-amber-200 transition-colors"
            >
              {unanchoredExpanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              <Unlink size={12} />
              <span className="uppercase tracking-wider font-semibold">
                Unanchored notes
              </span>
              <span
                data-testid="notes-panel-unanchored-badge"
                className="ml-auto inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500/80 text-[9px] text-gray-900 font-semibold tabular-nums"
              >
                {unanchoredCount}
              </span>
            </button>
            {unanchoredExpanded && (
              <ul className="mt-2 space-y-1.5">
                {unanchoredNotes.map(({ id, note }) => (
                  <li
                    key={id}
                    data-testid="notes-panel-unanchored-row"
                    data-note-id={id}
                    className="text-[12px] text-gray-300 border border-gray-800 rounded px-2 py-1.5 space-y-1.5"
                  >
                    {note.body.trim() ? (
                      <div className="whitespace-pre-wrap break-words">
                        {note.body}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">(empty note)</div>
                    )}
                    <div className="flex gap-1.5 flex-wrap">
                      <IssueButton
                        onClick={() => handleInsertAnchorForUnanchored(id)}
                      >
                        Insert anchor at cursor
                      </IssueButton>
                      <IssueButton
                        onClick={() => handleDeleteUnanchoredNote(id)}
                      >
                        Delete
                      </IssueButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )

  if (embedded) {
    return (
      <div data-testid="notes-panel" className="flex flex-col h-full overflow-hidden">
        {body}
      </div>
    )
  }

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
      {body}
    </div>
  )
}

// ---------------------------------------------------------------------------
// IssueButton — compact action pill used in the Unanchored notes section.
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
