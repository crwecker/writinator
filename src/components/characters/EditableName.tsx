import { useState, type ReactNode } from 'react'

interface EditableNameProps {
  value: string
  suffix?: ReactNode
  canEdit: boolean
  onCommit: (next: string) => boolean
  testId?: string
  title?: string
}

/**
 * Click-to-rename inline name + optional trailing metadata. The metadata is
 * rendered alongside the name when not editing, and hidden during edit so the
 * input has room. Empty / duplicate / unchanged commits revert silently.
 */
export function EditableName({ value, suffix, canEdit, onCommit, testId, title }: EditableNameProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null

  const commit = () => {
    if (draft === null) return
    onCommit(draft)
    setDraft(null)
  }

  if (editing) {
    return (
      <input
        autoFocus
        data-testid={testId}
        value={draft ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
          } else if (e.key === 'Escape') {
            setDraft(null)
          }
        }}
        className="flex-1 min-w-0 text-[11px] bg-gray-900 border border-gray-700 rounded px-1 py-0 text-gray-100"
      />
    )
  }

  return (
    <span
      className={`flex-1 text-gray-200 truncate min-w-0 ${canEdit ? 'cursor-text' : ''}`}
      title={title ?? (canEdit ? 'Click to rename' : undefined)}
      onClick={() => {
        if (canEdit) setDraft(value)
      }}
      data-testid={testId}
    >
      {value}
      {suffix}
    </span>
  )
}
