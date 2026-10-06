import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { insertStatDelta } from '../../lib/insertStatDelta'
import { PANEL_VALUE_FORMAT, formatStatValue } from '../../lib/statFormat'
import { ListItemSection, PlainListSection } from './ListItemSection'
import type {
  Character,
  CharacterState,
  StatDefinition,
  StatDeltaOp,
  StatModifier,
  StatValue,
} from '../../types'

export interface ComputedCharacterView {
  state: CharacterState
  effective: Record<string, StatValue>
}

const formatValue = (v: StatValue | undefined) => formatStatValue(v, PANEL_VALUE_FORMAT)

interface StatsTabProps {
  characters: Character[]
  computedPerCharacter: Map<string, ComputedCharacterView>
  /** False when no book or storylet is open — there is no cursor to compute at. */
  hasStorylet: boolean
  canEdit: boolean
  editorView: EditorView | null
  onOpenCharacterSheet?: () => void
}

/** Stats tab: each character's state at the cursor, with inline delta controls. */
export function StatsTab({
  characters,
  computedPerCharacter,
  hasStorylet,
  canEdit,
  editorView,
  onOpenCharacterSheet,
}: StatsTabProps) {
  return (
    <>
      {!hasStorylet ? (
        <div className="text-center text-xs text-gray-500 py-8">
          Open a storylet to see live-computed state.
        </div>
      ) : (
        characters.map((c) => {
          const computed = computedPerCharacter.get(c.id)
          if (!computed) return null
          return (
            <CharacterSection key={c.id} character={c} computed={computed} canEdit={canEdit} editorView={editorView} />
          )
        })
      )}
      {onOpenCharacterSheet && (
        <div className="pt-3">
          <button
            data-testid="character-panel-new-character"
            onClick={onOpenCharacterSheet}
            className="w-full text-xs text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-gray-100 rounded px-2 py-1.5 transition-colors"
          >
            {characters.length > 0 ? 'Edit Characters' : '+ New Character'}
          </button>
        </div>
      )}
    </>
  )
}

function formatModifier(mod: StatModifier, defs: StatDefinition[]): string {
  const def = defs.find((d) => d.id === mod.statId)
  const name = def?.name ?? mod.statId
  const sign = mod.amount >= 0 ? '+' : ''
  const suffix = mod.kind === 'maxFlat' ? ' max' : ''
  const attr = mod.attributeKey ? ` ${mod.attributeKey}` : ''
  return `${sign}${mod.amount} ${name}${attr}${suffix}`
}

function valuesEqual(a: StatValue | undefined, b: StatValue | undefined): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'number':
      return b.kind === 'number' && a.value === b.value
    case 'numberWithMax':
      return b.kind === 'numberWithMax' && a.value === b.value && a.max === b.max
    case 'text':
      return b.kind === 'text' && a.value === b.value
    case 'list':
      return (
        b.kind === 'list' &&
        a.items.length === b.items.length &&
        a.items.every((it, i) => it === b.items[i])
      )
    case 'attributeSet': {
      if (b.kind !== 'attributeSet') return false
      const ak = Object.keys(a.values)
      const bk = Object.keys(b.values)
      if (ak.length !== bk.length) return false
      return ak.every((k) => a.values[k] === b.values[k])
    }
    case 'rank':
      return b.kind === 'rank' && a.tier === b.tier
    case 'inventory':
    case 'spellList':
    case 'skillList': {
      if (b.kind !== a.kind) return false
      if (a.items.length !== b.items.length) return false
      return a.items.every((aItem, i) => {
        const bItem = b.items[i]
        if (aItem.name !== bItem.name) return false
        const aKeys = Object.keys(aItem.fields)
        const bKeys = Object.keys(bItem.fields)
        if (aKeys.length !== bKeys.length) return false
        return aKeys.every((k) => aItem.fields[k] === bItem.fields[k])
      })
    }
  }
}

interface StatRowProps {
  character: Character
  def: StatDefinition
  base: StatValue | undefined
  effective: StatValue | undefined
  testId: string
  canEdit: boolean
  editorView: EditorView | null
}

function StatRow({ character, def, base, effective, testId, canEdit, editorView }: StatRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [editingText, setEditingText] = useState<string | null>(null)
  const differs = !valuesEqual(base, effective)
  const valueRef = useRef<HTMLSpanElement>(null)
  const prevEffectiveRef = useRef<StatValue | undefined>(effective)
  useEffect(() => {
    if (!valuesEqual(prevEffectiveRef.current, effective)) {
      const el = valueRef.current
      if (el) {
        el.classList.remove('cm-value-flash')
        // Force reflow so re-adding the class restarts the animation.
        void el.offsetWidth
        el.classList.add('cm-value-flash')
      }
    }
    prevEffectiveRef.current = effective
  }, [effective])
  const isTextEditable = def.type === 'text' && canEdit && !!editorView
  const commitText = (raw: string) => {
    setEditingText(null)
    if (!editorView) return
    const next = raw.trim()
    const current = effective?.kind === 'text' ? effective.value : ''
    if (next === current) return
    insertStatDelta(editorView, character.id, {
      kind: 'set',
      statId: def.id,
      value: { kind: 'text', value: next },
    })
  }
  const stepBtnCls =
    'flex-1 text-[10px] tabular-nums rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-1 py-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const inlineStepBtnCls =
    'text-[10px] tabular-nums rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-1.5 py-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0'
  const emit = (op: StatDeltaOp) => {
    if (!editorView || !canEdit) return
    insertStatDelta(editorView, character.id, op)
  }
  return (
    <div className="flex flex-col gap-0.5 rounded bg-gray-800 px-1.5 py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500 shrink-0">
          {def.name}
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          {editingText !== null ? (
            <input
              data-testid={`character-panel-text-input-${character.id}-${def.id}`}
              autoFocus
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onBlur={(e) => commitText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditingText(null)
                }
              }}
              className="text-sm bg-gray-900 border border-blue-500 rounded px-1 py-0 outline-none text-gray-200 min-w-0 flex-1"
            />
          ) : (
            <span
              ref={valueRef}
              data-testid={testId}
              onClick={() => {
                if (isTextEditable) {
                  setEditingText(effective?.kind === 'text' ? effective.value : '')
                }
              }}
              className={`text-sm tabular-nums truncate ${
                differs ? 'text-blue-300' : 'text-gray-200'
              } ${isTextEditable ? 'cursor-text hover:text-gray-100' : ''}`}
              title={isTextEditable ? 'Click to edit' : formatValue(effective)}
            >
              {formatValue(effective)}
            </span>
          )}
          {differs && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
              title="Show layered breakdown"
            >
              {expanded ? 'hide' : 'info'}
            </button>
          )}
          {def.type === 'number' && (
            <>
              <button
                data-testid={`character-panel-stat-dec-${character.id}-${def.id}`}
                disabled={!canEdit}
                onClick={() => emit({ kind: 'adjust', statId: def.id, delta: -1 })}
                title={`${def.name} −1`}
                className={inlineStepBtnCls}
              >
                −
              </button>
              <button
                data-testid={`character-panel-stat-inc-${character.id}-${def.id}`}
                disabled={!canEdit}
                onClick={() => emit({ kind: 'adjust', statId: def.id, delta: 1 })}
                title={`${def.name} +1`}
                className={inlineStepBtnCls}
              >
                +
              </button>
            </>
          )}
        </div>
      </div>
      {expanded && differs && (
        <div className="text-[10px] text-gray-500 pl-2 border-l border-gray-800 space-y-0.5">
          <div>base: <span className="text-gray-400">{formatValue(base)}</span></div>
          <div>effective: <span className="text-blue-300">{formatValue(effective)}</span></div>
          <div className="text-gray-600">
            Δ from equipment &amp; buffs on {character.name}
          </div>
        </div>
      )}
      {def.type === 'numberWithMax' && (
        <div className="flex items-center gap-0.5 mt-0.5">
          <button
            data-testid={`character-panel-stat-dec-${character.id}-${def.id}`}
            disabled={!canEdit}
            onClick={() => emit({ kind: 'adjust', statId: def.id, delta: -1 })}
            title={`${def.name} −1`}
            className={stepBtnCls}
          >
            −
          </button>
          <button
            data-testid={`character-panel-stat-inc-${character.id}-${def.id}`}
            disabled={!canEdit}
            onClick={() => emit({ kind: 'adjust', statId: def.id, delta: 1 })}
            title={`${def.name} +1`}
            className={stepBtnCls}
          >
            +
          </button>
          <span className="text-[10px] text-gray-500 px-0.5 shrink-0">/</span>
          <button
            data-testid={`character-panel-stat-maxdec-${character.id}-${def.id}`}
            disabled={!canEdit}
            onClick={() => emit({ kind: 'maxAdjust', statId: def.id, delta: -1 })}
            title={`${def.name} max −1`}
            className={stepBtnCls}
          >
            −
          </button>
          <button
            data-testid={`character-panel-stat-maxinc-${character.id}-${def.id}`}
            disabled={!canEdit}
            onClick={() => emit({ kind: 'maxAdjust', statId: def.id, delta: 1 })}
            title={`${def.name} max +1`}
            className={stepBtnCls}
          >
            +
          </button>
          <button
            data-testid={`character-panel-stat-max-${character.id}-${def.id}`}
            disabled={!canEdit}
            onClick={() => emit({ kind: 'fill', statId: def.id })}
            title={`${def.name} → max`}
            className="text-[10px] tabular-nums rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-1.5 py-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            max
          </button>
        </div>
      )}
    </div>
  )
}

interface SectionProps {
  character: Character
  computed: ComputedCharacterView
  canEdit: boolean
  editorView: EditorView | null
}

function CharacterSection({ character, computed, canEdit, editorView }: SectionProps) {
  const [expanded, setExpanded] = useState(true)
  const { state, effective } = computed

  // Group stats by type for clean display
  const groups = useMemo(() => {
    const byKind: Record<string, StatDefinition[]> = {
      numberWithMax: [],
      number: [],
      text: [],
      rank: [],
      attributeSet: [],
      list: [],
      inventory: [],
      spellList: [],
      skillList: [],
    }
    for (const s of character.stats) {
      if (byKind[s.type]) byKind[s.type].push(s)
    }
    return byKind
  }, [character.stats])

  const GRID_KINDS = new Set(['numberWithMax', 'number'])

  return (
    <div
      data-testid={`character-panel-section-${character.id}`}
      className="border border-gray-800 rounded overflow-hidden"
    >
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 w-full text-left px-2 py-1.5 bg-gray-800/50 hover:bg-gray-800 transition-colors"
      >
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: character.color }}
        />
        <span className="text-sm text-gray-200 font-medium flex-1 truncate">
          {character.name}
        </span>
        <span className="text-[10px] text-gray-500">{expanded ? '\u25BC' : '\u25B6'}</span>
      </button>
      {expanded && (
        <div className="px-2 py-1.5 space-y-1.5 bg-gray-900/40">
          {(['numberWithMax', 'number', 'text', 'rank'] as const).map((kind) =>
            groups[kind].length > 0 ? (
              <div key={kind} className={GRID_KINDS.has(kind) ? 'grid grid-cols-2 gap-1' : 'space-y-1'}>
                {groups[kind].map((def) => (
                  <StatRow
                    key={def.id}
                    character={character}
                    def={def}
                    base={state.base[def.id]}
                    effective={effective[def.id]}
                    testId={`character-panel-effective-${character.id}-${def.id}`}
                    canEdit={canEdit}
                    editorView={editorView}
                  />
                ))}
              </div>
            ) : null,
          )}

          {groups.attributeSet.length > 0 && (
            <div className="space-y-1">
              {groups.attributeSet.map((def) => {
                const eff = effective[def.id]
                if (!eff || eff.kind !== 'attributeSet') return null
                const base = state.base[def.id]
                const differs = !valuesEqual(base, eff)
                return (
                  <div key={def.id} className="space-y-0.5">
                    <span className="text-[11px] uppercase tracking-wide text-gray-500">
                      {def.name}
                    </span>
                    <div
                      data-testid={`character-panel-effective-${character.id}-${def.id}`}
                      className="grid grid-cols-2 gap-1"
                    >
                      {Object.entries(eff.values).map(([k, n]) => (
                        <div
                          key={k}
                          className={`flex items-center gap-0.5 text-[11px] tabular-nums rounded bg-gray-800 px-1 py-0.5 ${
                            differs ? 'text-blue-300' : 'text-gray-300'
                          }`}
                        >
                          <button
                            data-testid={`character-panel-attr-dec-${character.id}-${def.id}-${k}`}
                            disabled={!canEdit}
                            onClick={() => {
                              if (!editorView || !canEdit) return
                              insertStatDelta(editorView, character.id, { kind: 'adjust', statId: def.id, delta: -1, attributeKey: k })
                            }}
                            className="text-[10px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-1 py-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          >
                            −
                          </button>
                          <span className="flex-1 text-center">
                            <span className="text-gray-500 mr-0.5">{k}</span>
                            {n}
                          </span>
                          <button
                            data-testid={`character-panel-attr-inc-${character.id}-${def.id}-${k}`}
                            disabled={!canEdit}
                            onClick={() => {
                              if (!editorView || !canEdit) return
                              insertStatDelta(editorView, character.id, { kind: 'adjust', statId: def.id, delta: 1, attributeKey: k })
                            }}
                            className="text-[10px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300 px-1 py-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {groups.list.length > 0 && (
            <div className="space-y-1.5">
              {groups.list.map((def) => {
                const eff = effective[def.id]
                const items = eff && eff.kind === 'list' ? eff.items : []
                return (
                  <PlainListSection
                    key={def.id}
                    character={character}
                    def={def}
                    items={items}
                    canEdit={canEdit}
                    editorView={editorView}
                  />
                )
              })}
            </div>
          )}

          {(['inventory', 'spellList', 'skillList'] as const).map((kind) =>
            groups[kind].length > 0 ? (
              <div key={kind} className="space-y-1.5">
                {groups[kind].map((def) => (
                  <ListItemSection
                    key={def.id}
                    kind={kind}
                    character={character}
                    def={def}
                    effective={effective[def.id]}
                    canEdit={canEdit}
                    editorView={editorView}
                  />
                ))}
              </div>
            ) : null,
          )}

          {/* Active buffs */}
          <div className="space-y-1 pt-1 border-t border-gray-800">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">
              Active Buffs
            </span>
            {state.activeBuffs.length === 0 ? (
              <div className="text-[11px] text-gray-600">(none)</div>
            ) : (
              <div className="space-y-0.5">
                {state.activeBuffs.map((buff) => (
                  <div key={buff.buffId} className="text-[11px] text-gray-300">
                    <span className="text-gray-200">
                      {buff.buffName ?? buff.buffId}
                    </span>
                    {buff.remaining !== undefined && (
                      <span className="text-gray-600"> ({buff.remaining} left)</span>
                    )}
                    {buff.modifiers.length > 0 && (
                      <div className="text-gray-500 pl-2">
                        {buff.modifiers
                          .map((m) => formatModifier(m, character.stats))
                          .join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
