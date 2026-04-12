import { useState } from 'react'
import type { StatDefinition, StatValue } from '../../types'

interface Props {
  definition: StatDefinition
  value: StatValue
  onChange: (next: StatValue) => void
  readOnly?: boolean
}

const INPUT_CLS =
  'bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500 disabled:opacity-60'

function parseNumber(raw: string, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function StatFieldEditor({ definition, value, onChange, readOnly }: Props) {
  // All branches are narrowed by StatValue.kind. If the kind doesn't match the
  // definition (e.g., stale data), render a typed fallback.
  if (definition.type === 'number' && value.kind === 'number') {
    return (
      <input
        type="number"
        className={`${INPUT_CLS} w-28`}
        value={value.value}
        disabled={readOnly}
        onChange={(e) =>
          onChange({ kind: 'number', value: parseNumber(e.target.value, 0) })
        }
      />
    )
  }

  if (definition.type === 'numberWithMax' && value.kind === 'numberWithMax') {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          className={`${INPUT_CLS} w-20`}
          value={value.value}
          disabled={readOnly}
          onChange={(e) =>
            onChange({
              kind: 'numberWithMax',
              value: parseNumber(e.target.value, 0),
              max: value.max,
            })
          }
        />
        <span className="text-gray-500 text-xs">/</span>
        <input
          type="number"
          className={`${INPUT_CLS} w-20`}
          value={value.max}
          disabled={readOnly}
          onChange={(e) =>
            onChange({
              kind: 'numberWithMax',
              value: value.value,
              max: parseNumber(e.target.value, 0),
            })
          }
        />
      </div>
    )
  }

  if (definition.type === 'list' && value.kind === 'list') {
    return (
      <ListEditor
        items={value.items}
        readOnly={readOnly}
        onChange={(items) => onChange({ kind: 'list', items })}
      />
    )
  }

  if (definition.type === 'text' && value.kind === 'text') {
    return (
      <input
        type="text"
        className={`${INPUT_CLS} w-full`}
        value={value.value}
        disabled={readOnly}
        onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
      />
    )
  }

  if (definition.type === 'attributeSet' && value.kind === 'attributeSet') {
    const keys = definition.attributeKeys ?? Object.keys(value.values)
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {keys.map((key) => (
          <label key={key} className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 w-12 shrink-0">{key}</span>
            <input
              type="number"
              className={`${INPUT_CLS} w-16`}
              value={value.values[key] ?? 0}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  kind: 'attributeSet',
                  values: {
                    ...value.values,
                    [key]: parseNumber(e.target.value, 0),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
    )
  }

  if (definition.type === 'rank' && value.kind === 'rank') {
    const tiers = definition.rankTiers ?? []
    return (
      <select
        className={`${INPUT_CLS} w-32`}
        value={value.tier}
        disabled={readOnly}
        onChange={(e) => onChange({ kind: 'rank', tier: e.target.value })}
      >
        {tiers.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        {tiers.length === 0 && <option value={value.tier}>{value.tier}</option>}
      </select>
    )
  }

  return (
    <span className="text-xs text-red-400 italic">
      Incompatible value for stat type "{definition.type}"
    </span>
  )
}

interface ListEditorProps {
  items: string[]
  readOnly?: boolean
  onChange: (items: string[]) => void
}

function ListEditor({ items, readOnly, onChange }: ListEditorProps) {
  const [draft, setDraft] = useState('')

  function addItem() {
    const v = draft.trim()
    if (!v) return
    onChange([...items, v])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex items-center gap-1 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200"
          >
            {item}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-gray-500 hover:text-red-400"
                title="Remove"
              >
                &#x2715;
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-xs text-gray-600 italic">empty</span>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            className={`${INPUT_CLS} flex-1`}
            value={draft}
            placeholder="Add item..."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
          />
          <button
            type="button"
            onClick={addItem}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
