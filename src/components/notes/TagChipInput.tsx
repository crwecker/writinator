import { useState, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  /** Visual density — 'sm' for compact inline rows, 'md' default for modal. */
  size?: 'sm' | 'md'
  /** Optional data-testid prefix for the input + chips. */
  testId?: string
}

function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Simple chip-input for free-form string tags.
 * - Enter or comma commits the current draft as a new chip.
 * - Backspace on empty input removes the last chip.
 * - Clicking the X on a chip removes it.
 * - Duplicates are silently rejected.
 */
export function TagChipInput({
  tags,
  onChange,
  placeholder = 'Add tag…',
  size = 'md',
  testId,
}: Props) {
  const [draft, setDraft] = useState('')

  const commit = useCallback(
    (value: string) => {
      const tag = normalizeTag(value)
      if (!tag) return
      if (tags.includes(tag)) {
        setDraft('')
        return
      }
      onChange([...tags, tag])
      setDraft('')
    },
    [tags, onChange],
  )

  const removeAt = useCallback(
    (idx: number) => {
      const next = tags.slice()
      next.splice(idx, 1)
      onChange(next)
    },
    [tags, onChange],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        commit(draft)
        return
      }
      if (e.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
        e.preventDefault()
        removeAt(tags.length - 1)
      }
    },
    [draft, tags, commit, removeAt],
  )

  const chipClass =
    size === 'sm'
      ? 'inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-200 border border-gray-600'
      : 'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-200 border border-gray-600'
  const inputClass =
    size === 'sm'
      ? 'flex-1 min-w-[60px] bg-transparent text-[11px] text-gray-200 placeholder:text-gray-600 outline-none px-1 py-0.5'
      : 'flex-1 min-w-[80px] bg-transparent text-xs text-gray-200 placeholder:text-gray-600 outline-none px-1 py-1'
  const wrapperClass =
    size === 'sm'
      ? 'flex flex-wrap items-center gap-1 bg-gray-800/60 border border-gray-700 rounded px-1 py-0.5'
      : 'flex flex-wrap items-center gap-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-1'

  return (
    <div
      className={wrapperClass}
      data-testid={testId ? `${testId}-wrapper` : undefined}
    >
      {tags.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className={chipClass}
          data-testid={testId ? `${testId}-chip` : undefined}
        >
          <span className="truncate max-w-[120px]">{tag}</span>
          <button
            type="button"
            onClick={() => removeAt(idx)}
            className="text-gray-400 hover:text-red-300 shrink-0"
            aria-label={`Remove tag ${tag}`}
            data-testid={testId ? `${testId}-chip-remove` : undefined}
          >
            <X size={size === 'sm' ? 10 : 12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={placeholder}
        className={inputClass}
        data-testid={testId}
      />
    </div>
  )
}
