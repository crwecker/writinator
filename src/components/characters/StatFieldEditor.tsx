import { useState } from 'react'
import type { StatDefinition, StatListItem, StatValue } from '../../types'
import { LIST_STAT_FIELDS, makeListItem } from '../../lib/listStatFields'
import type { ListStatKind } from '../../lib/listStatFields'

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

  if (
    (definition.type === 'inventory' && value.kind === 'inventory') ||
    (definition.type === 'spellList' && value.kind === 'spellList') ||
    (definition.type === 'skillList' && value.kind === 'skillList')
  ) {
    const kind = definition.type as ListStatKind
    return (
      <ListItemsEditor
        kind={kind}
        items={value.items}
        readOnly={readOnly}
        onChange={(items) => {
          if (kind === 'inventory') onChange({ kind: 'inventory', items })
          else if (kind === 'spellList') onChange({ kind: 'spellList', items })
          else onChange({ kind: 'skillList', items })
        }}
      />
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

// ---------------------------------------------------------------------------
// ListItemsEditor — structured item editor for inventory / spellList / skillList
// ---------------------------------------------------------------------------

interface ListItemsEditorProps {
  kind: ListStatKind
  items: StatListItem[]
  readOnly?: boolean
  onChange: (items: StatListItem[]) => void
}

function ListItemsEditor({ kind, items, readOnly, onChange }: ListItemsEditorProps) {
  const [draftName, setDraftName] = useState('')
  const fieldDefs = LIST_STAT_FIELDS[kind]

  function addItem() {
    const name = draftName.trim()
    if (!name) return
    onChange([...items, makeListItem(kind, name)])
    setDraftName('')
  }

  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  function updateField(itemIdx: number, fieldKey: string, val: number) {
    onChange(
      items.map((it, idx) =>
        idx === itemIdx
          ? { ...it, fields: { ...it.fields, [fieldKey]: val } }
          : it,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wide px-1">
          <span className="flex-1">Name</span>
          {fieldDefs.map((f) => (
            <span key={f.key} className="w-16 text-center">
              {f.label}
            </span>
          ))}
          <span className="w-5" />
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex-1 text-sm text-gray-200 truncate min-w-0">{item.name}</span>
          {fieldDefs.map((f) => (
            <input
              key={f.key}
              type="number"
              value={item.fields[f.key] ?? f.default}
              disabled={readOnly}
              onChange={(e) => updateField(i, f.key, parseNumber(e.target.value, f.default))}
              className={`${INPUT_CLS} w-16`}
            />
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-xs text-gray-500 hover:text-red-400 w-5 text-center shrink-0"
              title="Remove"
            >
              &#x2715;
            </button>
          )}
        </div>
      ))}
      {items.length === 0 && (
        <span className="text-xs text-gray-600 italic">empty</span>
      )}
      {!readOnly && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            className={`${INPUT_CLS} flex-1`}
            value={draftName}
            placeholder="Add item..."
            onChange={(e) => setDraftName(e.target.value)}
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
