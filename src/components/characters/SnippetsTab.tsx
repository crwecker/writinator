import { useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useStoryletStore } from '../../stores/storyletStore'
import { EditableName } from './EditableName'
import { renameSnippet, snippetNameTaken } from './snippetActions'

// ---------------------------------------------------------------------------
// Snippets tab — author-defined text templates inserted in prose as
// `{SnippetName}`. The template can contain other `{Stat}` or `{Snippet}`
// refs which are resolved recursively at render time.
// ---------------------------------------------------------------------------

interface SnippetsTabProps {
  editorView: EditorView | null
  canEdit: boolean
}

export function SnippetsTab({ editorView, canEdit }: SnippetsTabProps) {
  const snippets = useStoryletStore((s) => s.globalSettings.snippets) ?? {}
  const updateGlobalSettings = useStoryletStore((s) => s.updateGlobalSettings)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')

  const entries = Object.entries(snippets)

  const saveSnippet = (name: string, value: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    updateGlobalSettings({
      snippets: { ...snippets, [trimmedName]: value },
    })
  }

  const removeSnippet = (name: string) => {
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(snippets)) {
      if (k !== name) next[k] = v
    }
    updateGlobalSettings({ snippets: next })
  }

  const insertSnippetRef = (name: string) => {
    if (!editorView || !canEdit) return
    const ref = `{${name}}`
    const { from, to } = editorView.state.selection.main
    editorView.dispatch({
      changes: { from, to, insert: ref },
      selection: { anchor: from + ref.length },
    })
    editorView.focus()
  }

  const handleAdd = () => {
    const trimmedName = newName.trim()
    if (!trimmedName || snippetNameTaken(snippets, trimmedName)) return
    saveSnippet(trimmedName, newValue)
    setNewName('')
    setNewValue('')
  }

  const btnCls =
    'text-[11px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="space-y-3" data-testid="character-panel-snippets-tab">
      {entries.length === 0 ? (
        <div className="text-xs text-gray-500 text-center py-3">
          No snippets yet. Add one below.
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map(([name, value]) => (
            <SnippetRow
              key={name}
              name={name}
              value={value}
              canEdit={canEdit}
              onRename={(next) => renameSnippet(name, next)}
              onSaveValue={(next) => saveSnippet(name, next)}
              onInsert={() => insertSnippetRef(name)}
              onRemove={() => removeSnippet(name)}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-gray-700 pt-3 space-y-1.5">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">
          New snippet
        </div>
        <input
          data-testid="character-panel-snippet-new-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="snippet name…"
          disabled={!canEdit}
          className="w-full text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600 disabled:opacity-40"
        />
        <textarea
          data-testid="character-panel-snippet-new-value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="template text — use {Bob.HP} etc."
          rows={3}
          disabled={!canEdit}
          className="w-full text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-600 disabled:opacity-40 resize-y"
        />
        <button
          data-testid="character-panel-snippet-add"
          onClick={handleAdd}
          disabled={!canEdit || !newName.trim() || snippetNameTaken(snippets, newName)}
          className={btnCls}
        >
          Add snippet
        </button>
      </div>
    </div>
  )
}

interface SnippetRowProps {
  name: string
  value: string
  canEdit: boolean
  onRename: (next: string) => boolean
  onSaveValue: (next: string) => void
  onInsert: () => void
  onRemove: () => void
}

function SnippetRow({ name, value, canEdit, onRename, onSaveValue, onInsert, onRemove }: SnippetRowProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const editingValue = draftValue !== null
  const commitValue = () => {
    if (draftValue === null) return
    if (draftValue !== value) onSaveValue(draftValue)
    setDraftValue(null)
  }
  const btnCls =
    'text-[11px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <li className="rounded bg-gray-800 px-2 py-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <EditableName
          value={name}
          canEdit={canEdit}
          onCommit={(next) => onRename(next)}
          testId={`character-panel-snippet-name-${name}`}
          title={canEdit ? 'Click to rename snippet' : undefined}
        />
        <button
          data-testid={`character-panel-snippet-insert-${name}`}
          onClick={onInsert}
          disabled={!canEdit}
          className={`${btnCls} text-blue-400 hover:text-blue-300`}
          title={`Insert {${name}}`}
        >
          Insert
        </button>
        <button
          data-testid={`character-panel-snippet-remove-${name}`}
          onClick={onRemove}
          disabled={!canEdit}
          className={`${btnCls} text-gray-500 hover:text-red-400`}
          title="Delete snippet"
        >
          ×
        </button>
      </div>
      {editingValue ? (
        <textarea
          autoFocus
          data-testid={`character-panel-snippet-value-${name}`}
          value={draftValue ?? ''}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={commitValue}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDraftValue(null)
          }}
          rows={3}
          className="w-full text-[11px] bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 resize-y font-mono"
        />
      ) : (
        <div
          data-testid={`character-panel-snippet-value-${name}`}
          onClick={() => canEdit && setDraftValue(value)}
          className={`text-[11px] text-gray-400 whitespace-pre-wrap font-mono ${canEdit ? 'cursor-text' : ''}`}
          title={canEdit ? 'Click to edit template' : undefined}
        >
          {value || <span className="text-gray-600">(empty template)</span>}
        </div>
      )}
    </li>
  )
}
