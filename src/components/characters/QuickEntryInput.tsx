import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useCharacterStore } from '../../stores/characterStore'
import {
  parseQuickEntry,
  quickEntryCompletions,
  statForSuggestion,
  type CreateSuggestion,
  type QuickEntryContext,
  type QuickEntryResult,
} from '../../lib/quickEntry'
import { CHIP_NEUTRAL_COLOR } from '../../lib/statFormat'

interface Props {
  context: QuickEntryContext
  onSubmit: (result: QuickEntryResult) => void
  onCancel: () => void
  initialValue?: string
  placeholder?: string
  /** Prefix for data-testids (several inputs can be on screen at once). */
  testId?: string
  /** Clear the line after a successful submit (for "add another" inputs). */
  resetOnSubmit?: boolean
}

function createLabel(s: CreateSuggestion, characterName: (id: string) => string): string {
  return s.kind === 'character' ? `Create ${s.name}` : `Add “${s.name}” to ${characterName(s.characterId)}`
}

/** Apply a "Create …" suggestion: a default-template character, or a stat of the guessed type. */
function applyCreate(s: CreateSuggestion): void {
  const store = useCharacterStore.getState()
  if (s.kind === 'character') {
    store.createCharacter(s.name)
    return
  }
  const character = store.characters.find((c) => c.id === s.characterId)
  if (!character) return
  const { def, value } = statForSuggestion(s.name, s.type, character.stats.map((st) => st.id))
  store.addStat(character.id, def, value)
}

/**
 * One-line stat-change shorthand with autocomplete and a live before → after
 * preview per clause. Enter submits (only when every clause parses), Tab
 * accepts a completion, Escape cancels.
 */
export function QuickEntryInput({
  context,
  onSubmit,
  onCancel,
  initialValue = '',
  placeholder,
  testId = 'quick-entry',
  resetOnSubmit = false,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [caret, setCaret] = useState(initialValue.length)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const result = useMemo(() => parseQuickEntry(value, context), [value, context])
  const completion = useMemo(() => quickEntryCompletions(value, caret, context), [value, caret, context])
  const options = completion?.options ?? []
  const colorOf = (id: string) => context.characters.find((c) => c.id === id)?.color ?? CHIP_NEUTRAL_COLOR
  const nameOf = (id: string) => context.characters.find((c) => c.id === id)?.name ?? 'Unknown'

  function accept(option: string) {
    if (!completion) return
    const next = value.slice(0, completion.from) + option + value.slice(completion.to)
    const pos = completion.from + option.length
    setValue(next)
    setCaret(pos)
    setActive(0)
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Keep keys away from the editor / global shortcuts while typing here.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!result.ok) return
      onSubmit(result)
      if (resetOnSubmit) {
        setValue('')
        setCaret(0)
      }
    } else if (e.key === 'Tab' && options.length > 0) {
      e.preventDefault()
      accept(options[Math.min(active, options.length - 1)])
    } else if (e.key === 'ArrowDown' && options.length > 0) {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp' && options.length > 0) {
      e.preventDefault()
      setActive((i) => (i - 1 + options.length) % options.length)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        data-testid={`${testId}-input`}
        autoFocus
        spellCheck={false}
        value={value}
        placeholder={placeholder ?? 'Kael -15 HP, +Wolf Pelt'}
        onChange={(e) => {
          setValue(e.target.value)
          setCaret(e.target.selectionStart ?? e.target.value.length)
          setActive(0)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
        onKeyDown={onKeyDown}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-blue-400"
      />

      {options.length > 0 && (
        <ul
          data-testid={`${testId}-completions`}
          className="absolute left-0 right-0 top-full mt-1 z-10 bg-gray-900 border border-gray-700 rounded shadow-lg py-1 text-xs"
        >
          {options.map((opt, i) => (
            <li key={opt}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  accept(opt)
                }}
                className={`w-full text-left px-2 py-0.5 ${i === active ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}

      {result.clauses.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          {result.clauses.map((clause, ci) =>
            clause.error ? (
              <div key={ci} className="flex items-center justify-between gap-2 text-red-300/90">
                <span data-testid={`${testId}-error`}>{clause.error}</span>
                {clause.create && (
                  <button
                    type="button"
                    data-testid={`${testId}-create`}
                    onClick={() => {
                      applyCreate(clause.create!)
                      inputRef.current?.focus()
                    }}
                    className="shrink-0 rounded border border-gray-600 px-1.5 py-0.5 text-gray-200 hover:border-gray-400 hover:bg-gray-800"
                  >
                    {createLabel(clause.create, nameOf)}
                  </button>
                )}
              </div>
            ) : (
              clause.preview.map((row, ri) => (
                <div key={`${ci}-${ri}`}>
                  <div data-testid={`${testId}-preview`} className="flex items-center gap-1 text-gray-300">
                    <span className="font-medium" style={{ color: colorOf(row.characterId) }}>
                      {row.characterName}
                    </span>
                    <span className="text-gray-600"> · </span>
                    <span className="tabular-nums">{row.text}</span>
                    {row.isNew && (
                      <span className="ml-1 rounded bg-gray-700 px-1 text-[10px] uppercase tracking-wide text-gray-400">
                        new
                      </span>
                    )}
                  </div>
                  {row.warning && (
                    <div data-testid={`${testId}-warning`} className="pl-3 text-amber-300/90">
                      {row.warning}
                    </div>
                  )}
                </div>
              ))
            ),
          )}
        </div>
      )}
    </div>
  )
}
