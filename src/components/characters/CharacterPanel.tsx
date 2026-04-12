import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useCharacterStore } from '../../stores/characterStore'
import { useDocumentStore } from '../../stores/documentStore'
import { useEditorStore } from '../../stores/editorStore'
import { computeStateAt } from '../../lib/characterState'
import type {
  Character,
  CharacterState,
  StatDefinition,
  StatModifier,
  StatValue,
} from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
  onOpenCharacterSheet?: () => void
}

function formatModifier(mod: StatModifier, defs: StatDefinition[]): string {
  const def = defs.find((d) => d.id === mod.statId)
  const name = def?.name ?? mod.statId
  const sign = mod.amount >= 0 ? '+' : ''
  const suffix = mod.kind === 'maxFlat' ? ' max' : ''
  const attr = mod.attributeKey ? ` ${mod.attributeKey}` : ''
  return `${sign}${mod.amount} ${name}${attr}${suffix}`
}

function formatValue(v: StatValue | undefined): string {
  if (!v) return '—'
  switch (v.kind) {
    case 'number':
      return String(v.value)
    case 'numberWithMax':
      return `${v.value}/${v.max}`
    case 'text':
      return v.value || '—'
    case 'list':
      return v.items.length === 0 ? '(empty)' : v.items.join(', ')
    case 'attributeSet':
      return Object.entries(v.values)
        .map(([k, n]) => `${k} ${n}`)
        .join('  ')
    case 'rank':
      return v.tier
  }
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
  }
}

interface StatRowProps {
  character: Character
  def: StatDefinition
  base: StatValue | undefined
  effective: StatValue | undefined
  testId: string
}

function StatRow({ character, def, base, effective, testId }: StatRowProps) {
  const [expanded, setExpanded] = useState(false)
  const differs = !valuesEqual(base, effective)
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500 shrink-0">
          {def.name}
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            data-testid={testId}
            className={`text-sm tabular-nums truncate ${
              differs ? 'text-blue-300' : 'text-gray-200'
            }`}
            title={formatValue(effective)}
          >
            {formatValue(effective)}
          </span>
          {differs && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
              title="Show layered breakdown"
            >
              {expanded ? 'hide' : 'info'}
            </button>
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
    </div>
  )
}

interface SectionProps {
  character: Character
  computed: { state: CharacterState; effective: Record<string, StatValue> }
}

function CharacterSection({ character, computed }: SectionProps) {
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
    }
    for (const s of character.stats) {
      if (byKind[s.type]) byKind[s.type].push(s)
    }
    return byKind
  }, [character.stats])

  const equippedSlots = Object.keys(state.equipped)

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
        <div className="px-2 py-2 space-y-2 bg-gray-900/40">
          {(['numberWithMax', 'number', 'text', 'rank'] as const).map((kind) =>
            groups[kind].length > 0 ? (
              <div key={kind} className="space-y-1">
                {groups[kind].map((def) => (
                  <StatRow
                    key={def.id}
                    character={character}
                    def={def}
                    base={state.base[def.id]}
                    effective={effective[def.id]}
                    testId={`character-panel-effective-${character.id}-${def.id}`}
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
                      className="grid grid-cols-4 gap-1"
                    >
                      {Object.entries(eff.values).map(([k, n]) => (
                        <div
                          key={k}
                          className={`text-[11px] tabular-nums rounded bg-gray-800 px-1 py-0.5 text-center ${
                            differs ? 'text-blue-300' : 'text-gray-300'
                          }`}
                        >
                          <span className="text-gray-500 mr-0.5">{k}</span>
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {groups.list.length > 0 && (
            <div className="space-y-1">
              {groups.list.map((def) => {
                const eff = effective[def.id]
                const items =
                  eff && eff.kind === 'list' ? eff.items : []
                return (
                  <div key={def.id} className="space-y-0.5">
                    <span className="text-[11px] uppercase tracking-wide text-gray-500">
                      {def.name}
                    </span>
                    <div
                      data-testid={`character-panel-effective-${character.id}-${def.id}`}
                      className="text-[11px] text-gray-300"
                    >
                      {items.length === 0 ? (
                        <span className="text-gray-600">(empty)</span>
                      ) : (
                        <ul className="list-disc list-inside space-y-0.5">
                          {items.map((it, i) => (
                            <li key={`${it}-${i}`}>{it}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Equipment */}
          <div className="space-y-1 pt-1 border-t border-gray-800">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">
              Equipment
            </span>
            {character.equipmentSlots.length === 0 && equippedSlots.length === 0 ? (
              <div className="text-[11px] text-gray-600">(no slots)</div>
            ) : (
              <div className="space-y-0.5">
                {character.equipmentSlots.map((slot) => {
                  const eq = state.equipped[slot]
                  return (
                    <div key={slot} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="text-gray-500 shrink-0">{slot}</span>
                      {eq ? (
                        <span className="text-gray-300 truncate text-right">
                          {eq.itemName ?? eq.itemId}
                          {eq.modifiers.length > 0 && (
                            <span className="text-gray-500">
                              {' '}
                              ({eq.modifiers
                                .map((m) => formatModifier(m, character.stats))
                                .join(', ')})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </div>
                  )
                })}
                {/* Any equipped slots not in the declared list */}
                {equippedSlots
                  .filter((s) => !character.equipmentSlots.includes(s))
                  .map((slot) => {
                    const eq = state.equipped[slot]
                    if (!eq) return null
                    return (
                      <div key={slot} className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="text-gray-500 italic shrink-0">{slot}</span>
                        <span className="text-gray-300 truncate text-right">
                          {eq.itemName ?? eq.itemId}
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

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

export function CharacterPanel({ open, onClose, onOpenCharacterSheet }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const cursorOffset = useEditorStore((s) => s.cursorOffset)
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)
  const book = useDocumentStore((s) => s.book)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Close on click outside (registered via setTimeout to avoid the same
  // mousedown that opened the panel closing it).
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      function onClick(e: MouseEvent) {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onClose()
        }
      }
      document.addEventListener('mousedown', onClick)
      cleanup = () => document.removeEventListener('mousedown', onClick)
    }, 0)
    let cleanup: (() => void) | null = null
    return () => {
      clearTimeout(timer)
      if (cleanup) cleanup()
    }
  }, [open, onClose])

  const computedPerCharacter = useMemo(() => {
    if (!book) return new Map<string, { state: CharacterState; effective: Record<string, StatValue> }>()
    const stopAt = activeDocumentId
      ? { documentId: activeDocumentId, offset: cursorOffset }
      : undefined
    const map = new Map<string, { state: CharacterState; effective: Record<string, StatValue> }>()
    for (const c of characters) {
      map.set(c.id, computeStateAt(c, book, markers, stopAt))
    }
    return map
  }, [characters, markers, book, activeDocumentId, cursorOffset])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      data-testid="character-panel"
      className="fixed right-0 top-0 bottom-0 z-50 w-[320px] max-w-[90vw] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">Characters</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {characters.length === 0 ? (
          <div
            data-testid="character-panel-empty"
            className="text-center text-xs text-gray-500 py-8 space-y-3"
          >
            <p>No characters yet.</p>
            {onOpenCharacterSheet && (
              <button
                onClick={onOpenCharacterSheet}
                className="px-3 py-1.5 text-xs text-gray-300 border border-gray-700 hover:border-gray-500 rounded transition-colors"
              >
                Open Character Sheet
              </button>
            )}
          </div>
        ) : !book || !activeDocumentId ? (
          <div className="text-center text-xs text-gray-500 py-8">
            Open a document to see live-computed state.
          </div>
        ) : (
          characters.map((c) => {
            const computed = computedPerCharacter.get(c.id)
            if (!computed) return null
            return (
              <CharacterSection key={c.id} character={c} computed={computed} />
            )
          })
        )}
      </div>
    </div>
  )
}
