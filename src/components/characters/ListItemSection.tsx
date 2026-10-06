import { useState, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { insertStatDelta } from '../../lib/insertStatDelta'
import { LIST_STAT_FIELDS, defaultItemFields, type ListStatKind } from '../../lib/listStatFields'
import { EditableName } from './EditableName'
import { renameListItem } from './renameListItem'
import type { Character, StatDefinition, StatDeltaOp, StatValue } from '../../types'

/** Lower-kebab slug used in data-testid attributes. */
function itemSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-')
}

const btnCls =
  'text-[10px] tabular-nums rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-1 py-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

/** One −/+ pair adjusting a numeric item field. */
interface FieldControl {
  field: string
  /** Inserted into the button test ids (`spell-level-dec`); '' for none (`item-dec`). */
  testIdPart: string
  /** Word used in the button titles ("Rope qty −1"). */
  titleLabel: string
  /** Small caption rendered before the pair. */
  caption?: string
}

interface ListItemKindConfig {
  testIdPrefix: string
  emptyLabel: string
  placeholder: string
  suffix: (fields: Record<string, number>) => ReactNode
  controls: FieldControl[]
  /** Spells get a "Use" button that spends their cost from the mana stat. */
  castable: boolean
}

const KIND_CONFIG: Record<ListStatKind, ListItemKindConfig> = {
  inventory: {
    testIdPrefix: 'item',
    emptyLabel: '(no items)',
    placeholder: 'item name…',
    suffix: (f) => <> <span className="text-gray-500">×{f.qty ?? 0}</span></>,
    controls: [{ field: 'qty', testIdPart: '', titleLabel: 'qty' }],
    castable: false,
  },
  spellList: {
    testIdPrefix: 'spell',
    emptyLabel: '(no spells)',
    placeholder: 'spell name…',
    suffix: (f) => <span className="text-gray-500"> · Lv {f.level ?? 0} · Cost {f.mana ?? 0}</span>,
    controls: [
      { field: 'level', testIdPart: 'level', titleLabel: 'level' },
      { field: 'mana', testIdPart: 'mana', titleLabel: 'cost', caption: 'cost' },
    ],
    castable: true,
  },
  skillList: {
    testIdPrefix: 'skill',
    emptyLabel: '(no skills)',
    placeholder: 'skill name…',
    suffix: (f) => <span className="text-gray-500"> · Lv {f.level ?? 0}</span>,
    controls: [{ field: 'level', testIdPart: 'level', titleLabel: 'level' }],
    castable: false,
  },
}

function fieldMin(kind: ListStatKind, field: string): number {
  return LIST_STAT_FIELDS[kind].find((f) => f.key === field)?.min ?? 0
}

interface ListItemSectionProps {
  kind: ListStatKind
  character: Character
  def: StatDefinition
  effective: StatValue | undefined
  canEdit: boolean
  editorView: EditorView | null
}

/**
 * Structured-list stat section (inventory / spells / skills): one row per item
 * with a click-to-rename name, −/+ controls per numeric field, remove, and an
 * add-item input. Every change is written as a delta at the cursor.
 */
export function ListItemSection({ kind, character, def, effective, canEdit, editorView }: ListItemSectionProps) {
  const [addName, setAddName] = useState('')
  const config = KIND_CONFIG[kind]
  const prefix = `character-panel-${config.testIdPrefix}`
  const ids = `${character.id}-${def.id}`

  const emit = (op: StatDeltaOp) => {
    if (!editorView || !canEdit) return
    insertStatDelta(editorView, character.id, op)
  }

  const items =
    (effective?.kind === 'inventory' || effective?.kind === 'spellList' || effective?.kind === 'skillList') &&
    effective.kind === kind
      ? effective.items
      : []
  const manaStatId = def.manaStatId
  const manaStatExists = !!manaStatId && character.stats.some((s) => s.id === manaStatId)

  const handleAdd = () => {
    const trimmed = addName.trim()
    if (!trimmed) return
    emit({ kind: 'itemAdd', statId: def.id, name: trimmed, fields: defaultItemFields(kind) })
    setAddName('')
  }

  return (
    <div className="space-y-0.5">
      <span className="text-[11px] uppercase tracking-wide text-gray-500">{def.name}</span>
      {items.length === 0 ? (
        <div className="text-[11px] text-gray-600">{config.emptyLabel}</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => {
            const slug = itemSlug(item.name)
            const mana = item.fields.mana ?? 0
            const castDisabled = !canEdit || !manaStatId || !manaStatExists || mana <= 0
            return (
              <li
                key={item.name}
                className="flex items-center gap-1 text-[11px] rounded bg-gray-800 px-1.5 py-0.5"
              >
                <EditableName
                  value={item.name}
                  suffix={config.suffix(item.fields)}
                  canEdit={canEdit}
                  onCommit={(next) => renameListItem(character, def.id, item.name, next)}
                  testId={`${prefix}-name-${ids}-${slug}`}
                />
                {config.controls.map((control) => {
                  const value = item.fields[control.field] ?? 0
                  const part = control.testIdPart ? `${control.testIdPart}-` : ''
                  const adjust = (delta: number) =>
                    emit({ kind: 'itemFieldAdjust', statId: def.id, name: item.name, field: control.field, delta })
                  return (
                    <FieldButtons
                      key={control.field}
                      caption={control.caption}
                      decTestId={`${prefix}-${part}dec-${ids}-${slug}`}
                      incTestId={`${prefix}-${part}inc-${ids}-${slug}`}
                      decTitle={`${item.name} ${control.titleLabel} −1`}
                      incTitle={`${item.name} ${control.titleLabel} +1`}
                      decDisabled={!canEdit || value <= fieldMin(kind, control.field)}
                      incDisabled={!canEdit}
                      onDec={() => adjust(-1)}
                      onInc={() => adjust(1)}
                    />
                  )
                })}
                {config.castable && (
                  <button
                    data-testid={`${prefix}-cast-${ids}-${slug}`}
                    disabled={castDisabled}
                    onClick={() => {
                      if (!editorView || castDisabled || !manaStatId) return
                      insertStatDelta(editorView, character.id, {
                        kind: 'adjust',
                        statId: manaStatId,
                        delta: -mana,
                      })
                    }}
                    title={`Use ${item.name}`}
                    className={`${btnCls} text-blue-400 hover:text-blue-300`}
                  >
                    Use
                  </button>
                )}
                <button
                  data-testid={`${prefix}-remove-${ids}-${slug}`}
                  disabled={!canEdit}
                  onClick={() => emit({ kind: 'itemRemove', statId: def.id, name: item.name })}
                  title={`Remove ${item.name}`}
                  className={`${btnCls} text-gray-500 hover:text-red-400`}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {/* Add-item affordance */}
      <div className="flex items-center gap-1 pt-0.5">
        <input
          data-testid={`${prefix}-add-input-${ids}`}
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          disabled={!canEdit}
          placeholder={config.placeholder}
          className="flex-1 text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 placeholder-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          data-testid={`${prefix}-add-${ids}`}
          disabled={!canEdit || !addName.trim()}
          onClick={handleAdd}
          className={btnCls}
        >
          Add
        </button>
      </div>
    </div>
  )
}

interface FieldButtonsProps {
  caption?: string
  decTestId: string
  incTestId: string
  decTitle: string
  incTitle: string
  decDisabled: boolean
  incDisabled: boolean
  onDec: () => void
  onInc: () => void
}

function FieldButtons(props: FieldButtonsProps) {
  return (
    <>
      {props.caption && (
        <span className="text-[10px] text-gray-600 px-0.5 shrink-0">{props.caption}</span>
      )}
      <button
        data-testid={props.decTestId}
        disabled={props.decDisabled}
        onClick={props.onDec}
        title={props.decTitle}
        className={btnCls}
      >
        −
      </button>
      <button
        data-testid={props.incTestId}
        disabled={props.incDisabled}
        onClick={props.onInc}
        title={props.incTitle}
        className={btnCls}
      >
        +
      </button>
    </>
  )
}

interface PlainListSectionProps {
  character: Character
  def: StatDefinition
  items: string[]
  canEdit: boolean
  editorView: EditorView | null
}

/** Plain `list` stat section: inline add/remove per item (hidden when read-only). */
export function PlainListSection({ character, def, items, canEdit, editorView }: PlainListSectionProps) {
  const [addName, setAddName] = useState('')

  const emit = (op: StatDeltaOp) => {
    if (!editorView || !canEdit) return
    insertStatDelta(editorView, character.id, op)
  }

  const handleAdd = () => {
    const trimmed = addName.trim()
    if (!trimmed) return
    emit({ kind: 'listAdd', statId: def.id, items: [trimmed] })
    setAddName('')
  }

  return (
    <div className="space-y-0.5">
      <span className="text-[11px] uppercase tracking-wide text-gray-500">{def.name}</span>
      <div
        data-testid={`character-panel-effective-${character.id}-${def.id}`}
        className="text-[11px] text-gray-300"
      >
        {items.length === 0 ? (
          <span className="text-gray-600">(empty)</span>
        ) : (
          <ul className="space-y-0.5">
            {items.map((it, i) => {
              const slug = itemSlug(it)
              return (
                <li
                  key={`${it}-${i}`}
                  className="flex items-center gap-1 rounded bg-gray-800 px-1.5 py-0.5"
                >
                  <EditableName
                    value={it}
                    canEdit={canEdit}
                    onCommit={(next) => renameListItem(character, def.id, it, next)}
                    testId={`character-panel-list-name-${character.id}-${def.id}-${slug}`}
                  />
                  {canEdit && (
                    <button
                      data-testid={`character-panel-list-remove-${character.id}-${def.id}-${slug}`}
                      onClick={() => emit({ kind: 'listRemove', statId: def.id, items: [it] })}
                      title={`Remove ${it}`}
                      className={`${btnCls} text-gray-500 hover:text-red-400`}
                    >
                      ×
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 pt-0.5">
          <input
            data-testid={`character-panel-list-add-input-${character.id}-${def.id}`}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
            placeholder="add item…"
            className="flex-1 text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 placeholder-gray-600"
          />
          <button
            data-testid={`character-panel-list-add-${character.id}-${def.id}`}
            disabled={!addName.trim()}
            onClick={handleAdd}
            className={btnCls}
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
