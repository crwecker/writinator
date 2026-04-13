import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useCharacterStore } from '../../stores/characterStore'
import { useDocumentStore } from '../../stores/documentStore'
import { useEditorStore } from '../../stores/editorStore'
import { checkConsistency, computeStateAt, getDocumentTreeOrder } from '../../lib/characterState'
import { extractMarkers } from '../../lib/markerUtils'
import { ProgressionGraph } from './ProgressionGraph'
import type {
  Character,
  CharacterState,
  ConsistencyIssue,
  StatDefinition,
  StatDelta,
  StatDeltaOp,
  StatModifier,
  StatValue,
} from '../../types'

type PanelTab = 'stats' | 'graph' | 'issues' | 'changes'

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
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500 shrink-0">
          {def.name}
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            ref={valueRef}
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

export function CharacterPanel({ open, onClose, onOpenCharacterSheet, editorView }: Props) {
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const removeMarkerFromStore = useCharacterStore((s) => s.removeMarker)
  const setMarker = useCharacterStore((s) => s.setMarker)
  const setEquipmentSlots = useCharacterStore((s) => s.setEquipmentSlots)
  const cursorOffset = useEditorStore((s) => s.cursorOffset)
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)
  const setActiveDocument = useDocumentStore((s) => s.setActiveDocument)
  const book = useDocumentStore((s) => s.book)
  const [tab, setTab] = useState<PanelTab>('stats')
  const [graphCharacterIdRaw, setGraphCharacterId] = useState<string>('')
  const graphCharacterId = useMemo(() => {
    if (characters.length === 0) return ''
    if (characters.find((c) => c.id === graphCharacterIdRaw)) return graphCharacterIdRaw
    return characters[0].id
  }, [characters, graphCharacterIdRaw])


  const issues = useMemo<ConsistencyIssue[]>(() => {
    if (!book) return []
    return checkConsistency(book, characters, markers)
  }, [book, characters, markers])

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

  const jumpToMarker = (docId: string, offset: number) => {
    if (!editorView) return
    if (docId !== activeDocumentId) {
      setActiveDocument(docId)
      setTimeout(() => {
        const v = editorView
        if (!v) return
        const len = v.state.doc.length
        const pos = Math.min(offset, len)
        v.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
        v.focus()
      }, 30)
    } else {
      const len = editorView.state.doc.length
      const pos = Math.min(offset, len)
      editorView.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
      editorView.focus()
    }
  }

  if (!open) return null

  return (
    <div
      data-testid="character-panel"
      className="flex flex-col bg-gray-900 border-l border-gray-700 h-full w-[320px] shrink-0 overflow-hidden"
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

      {/* Tabs */}
      <div className="flex border-b border-gray-700 bg-gray-900/60">
        <TabButton active={tab === 'stats'} onClick={() => setTab('stats')} testId="character-panel-tab-stats">
          Stats
        </TabButton>
        <TabButton active={tab === 'graph'} onClick={() => setTab('graph')} testId="character-panel-tab-graph">
          Graph
        </TabButton>
        <TabButton
          active={tab === 'changes'}
          onClick={() => setTab('changes')}
          testId="character-panel-tab-changes"
        >
          Changes
        </TabButton>
        <TabButton
          active={tab === 'issues'}
          onClick={() => setTab('issues')}
          testId="character-panel-tab-issues"
          badgeCount={issues.length}
        >
          Issues
        </TabButton>
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
        ) : tab === 'stats' ? (
          <>
            {!book || !activeDocumentId ? (
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
            {onOpenCharacterSheet && (
              <div className="pt-3">
                <button
                  data-testid="character-panel-new-character"
                  onClick={onOpenCharacterSheet}
                  className="w-full text-xs text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-gray-100 rounded px-2 py-1.5 transition-colors"
                >
                  + New Character
                </button>
              </div>
            )}
          </>
        ) : tab === 'graph' ? (
          <GraphTab
            characters={characters}
            graphCharacterId={graphCharacterId}
            setGraphCharacterId={setGraphCharacterId}
          />
        ) : tab === 'changes' ? (
          <ChangesTab
            book={book}
            characters={characters}
            markers={markers}
            onJumpToMarker={jumpToMarker}
          />
        ) : (
          <IssuesTab
            issues={issues}
            characters={characters}
            book={book}
            editorView={editorView}
            onJumpToMarker={jumpToMarker}
            onRemoveOrphanFromText={(markerId, documentId) => {
              if (!book || !editorView) return
              const d = book.documents.find((x) => x.id === documentId)
              if (!d) return
              const content = d.content ?? ''
              const escaped = markerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const re = new RegExp(`<!--\\s*stat:${escaped}\\s*-->`)
              const match = content.match(re)
              if (!match || typeof match.index !== 'number') return
              const doRemove = () => {
                const view = editorView
                if (!view) return
                view.dispatch({
                  changes: {
                    from: match.index as number,
                    to: (match.index as number) + match[0].length,
                    insert: '',
                  },
                })
              }
              if (documentId === activeDocumentId) {
                doRemove()
              } else {
                setActiveDocument(documentId)
                setTimeout(doRemove, 30)
              }
            }}
            onCreateEmptyDelta={(markerId) => {
              setMarker(markerId, [])
            }}
            onDeleteInverseOrphan={(markerId) => {
              removeMarkerFromStore(markerId)
            }}
            onAddSlot={(characterId, slot) => {
              const character = characters.find((c) => c.id === characterId)
              if (!character) return
              if (character.equipmentSlots.includes(slot)) return
              setEquipmentSlots(characterId, [...character.equipmentSlots, slot])
            }}
          />
        )}
      </div>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  testId: string
  badgeCount?: number
  children: React.ReactNode
}

function TabButton({ active, onClick, testId, badgeCount, children }: TabButtonProps) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-xs flex items-center justify-center gap-1.5 transition-colors ${
        active
          ? 'text-gray-100 bg-gray-800/70 border-b-2 border-blue-400'
          : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
      }`}
    >
      <span>{children}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          data-testid={`${testId}-badge`}
          className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500/80 text-[9px] text-white font-semibold tabular-nums"
        >
          {badgeCount}
        </span>
      )}
    </button>
  )
}

interface GraphTabProps {
  characters: Character[]
  graphCharacterId: string
  setGraphCharacterId: (id: string) => void
}

function GraphTab({ characters, graphCharacterId, setGraphCharacterId }: GraphTabProps) {
  if (characters.length === 0) {
    return (
      <div className="text-center text-xs text-gray-500 py-8">No characters yet.</div>
    )
  }
  const activeId = characters.find((c) => c.id === graphCharacterId)
    ? graphCharacterId
    : characters[0].id
  return (
    <div className="space-y-3">
      {characters.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">
            Character
          </span>
          <select
            data-testid="character-panel-graph-character-select"
            value={activeId}
            onChange={(e) => setGraphCharacterId(e.target.value)}
            className="flex-1 bg-gray-800 text-gray-200 text-xs border border-gray-700 rounded px-2 py-1"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <ProgressionGraph characterId={activeId} />
    </div>
  )
}

interface IssuesTabProps {
  issues: ConsistencyIssue[]
  characters: Character[]
  book: import('../../types').Book | null
  editorView: EditorView | null
  onJumpToMarker: (documentId: string, offset: number) => void
  onRemoveOrphanFromText: (markerId: string, documentId: string) => void
  onCreateEmptyDelta: (markerId: string) => void
  onDeleteInverseOrphan: (markerId: string) => void
  onAddSlot: (characterId: string, slot: string) => void
}

function groupIssues(issues: ConsistencyIssue[]): Record<ConsistencyIssue['kind'], ConsistencyIssue[]> {
  const groups: Record<ConsistencyIssue['kind'], ConsistencyIssue[]> = {
    orphanMarker: [],
    inverseOrphan: [],
    impossibleValue: [],
    missingSlot: [],
    unequipEmpty: [],
  }
  for (const i of issues) {
    groups[i.kind].push(i)
  }
  return groups
}

const KIND_LABELS: Record<ConsistencyIssue['kind'], string> = {
  orphanMarker: 'Orphan Markers',
  inverseOrphan: 'Inverse Orphans',
  impossibleValue: 'Impossible Values',
  missingSlot: 'Missing Slots',
  unequipEmpty: 'Unequip of Empty Slot',
}

function IssuesTab({
  issues,
  characters,
  book,
  onJumpToMarker,
  onRemoveOrphanFromText,
  onCreateEmptyDelta,
  onDeleteInverseOrphan,
  onAddSlot,
}: IssuesTabProps) {
  if (!book) {
    return <div className="text-center text-xs text-gray-500 py-8">No active book.</div>
  }
  if (issues.length === 0) {
    return (
      <div
        data-testid="character-panel-issues-empty"
        className="text-center text-xs text-gray-500 py-8"
      >
        All clear — no consistency issues.
      </div>
    )
  }
  const groups = groupIssues(issues)
  const characterName = (id: string) =>
    characters.find((c) => c.id === id)?.name ?? 'Unknown'
  const docName = (id: string | undefined) =>
    id ? book.documents.find((d) => d.id === id)?.name ?? '(unknown doc)' : '(unknown doc)'

  return (
    <div className="space-y-3" data-testid="character-panel-issues">
      {(Object.keys(groups) as ConsistencyIssue['kind'][]).map((kind) => {
        const list = groups[kind]
        if (list.length === 0) return null
        return (
          <div key={kind} className="border border-gray-800 rounded overflow-hidden">
            <div className="px-2 py-1.5 bg-gray-800/60 text-[11px] text-gray-300 flex justify-between items-center">
              <span>{KIND_LABELS[kind]}</span>
              <span className="text-gray-500">{list.length}</span>
            </div>
            <ul className="divide-y divide-gray-800/60">
              {list.map((issue, i) => (
                <li
                  key={`${kind}-${i}`}
                  data-testid={`character-panel-issue-${kind}`}
                  className="px-2 py-2 text-[11px] text-gray-300 space-y-1"
                >
                  {issue.kind === 'orphanMarker' && (
                    <>
                      <div>
                        <span className="text-gray-500">Marker </span>
                        <code className="text-gray-400">{issue.markerId.slice(0, 8)}…</code>
                        <span className="text-gray-500"> in </span>
                        <span className="text-gray-300">{docName(issue.documentId)}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <IssueButton onClick={() => onRemoveOrphanFromText(issue.markerId, issue.documentId)}>
                          Remove from text
                        </IssueButton>
                        <IssueButton onClick={() => onCreateEmptyDelta(issue.markerId)}>
                          Create empty entry
                        </IssueButton>
                        <IssueButton onClick={() => onJumpToMarker(issue.documentId, issue.offset)}>
                          Jump
                        </IssueButton>
                      </div>
                    </>
                  )}
                  {issue.kind === 'inverseOrphan' && (
                    <>
                      <div>
                        <span className="text-gray-500">Store entry </span>
                        <code className="text-gray-400">{issue.markerId.slice(0, 8)}…</code>
                        <span className="text-gray-500"> has no text reference.</span>
                      </div>
                      <div className="flex gap-1.5">
                        <IssueButton onClick={() => onDeleteInverseOrphan(issue.markerId)}>
                          Delete store entry
                        </IssueButton>
                      </div>
                    </>
                  )}
                  {issue.kind === 'impossibleValue' && (
                    <>
                      <div>
                        <span className="text-gray-300">{characterName(issue.characterId)}</span>
                        <span className="text-gray-500"> — </span>
                        <span className="text-gray-300">{issue.reason}</span>
                      </div>
                      {issue.documentId && typeof issue.offset === 'number' && (
                        <div className="flex gap-1.5">
                          <IssueButton
                            onClick={() =>
                              onJumpToMarker(issue.documentId as string, issue.offset as number)
                            }
                          >
                            Jump to marker
                          </IssueButton>
                        </div>
                      )}
                    </>
                  )}
                  {issue.kind === 'missingSlot' && (
                    <>
                      <div>
                        <span className="text-gray-300">{characterName(issue.characterId)}</span>
                        <span className="text-gray-500"> has no slot </span>
                        <span className="text-gray-300">"{issue.slot}"</span>
                      </div>
                      <div className="flex gap-1.5">
                        <IssueButton
                          onClick={() => onAddSlot(issue.characterId, issue.slot)}
                        >
                          Add slot
                        </IssueButton>
                      </div>
                    </>
                  )}
                  {issue.kind === 'unequipEmpty' && (
                    <>
                      <div>
                        <span className="text-gray-300">{characterName(issue.characterId)}</span>
                        <span className="text-gray-500"> — unequip of empty </span>
                        <span className="text-gray-300">"{issue.slot}"</span>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function IssueButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
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

// ---------------------------------------------------------------------------
// Changes tab
// ---------------------------------------------------------------------------

function summarizeOp(op: StatDeltaOp, character: Character | undefined): string {
  const statName = (id: string) =>
    character?.stats.find((s) => s.id === id)?.name ?? id
  switch (op.kind) {
    case 'adjust': {
      const sign = op.delta >= 0 ? '+' : ''
      const attr = op.attributeKey ? ` ${op.attributeKey}` : ''
      return `${statName(op.statId)}${attr} ${sign}${op.delta}`
    }
    case 'set':
      return `${statName(op.statId)} = ${formatValue(op.value)}`
    case 'maxAdjust': {
      const sign = op.delta >= 0 ? '+' : ''
      return `${statName(op.statId)} max ${sign}${op.delta}`
    }
    case 'listAdd':
      return `${statName(op.statId)} + ${op.items.join(', ') || '(none)'}`
    case 'listRemove':
      return `${statName(op.statId)} − ${op.items.join(', ') || '(none)'}`
    case 'equip':
      return `Equip ${op.slot}: ${op.itemName ?? (op.itemId || '(item)')}`
    case 'unequip':
      return `Unequip ${op.slot}`
    case 'buffApply':
      return `Buff + ${op.buffName ?? op.buffId}`
    case 'buffRemove':
      return `Buff − ${op.buffId}`
    case 'rankChange':
      return op.direction === 'set'
        ? `${statName(op.statId)} = ${op.value ?? ''}`
        : `${statName(op.statId)} rank ${op.direction}`
  }
}

interface ChangeEntry {
  markerId: string
  documentId: string
  documentName: string
  offset: number
  deltas: StatDelta[]
}

function ChangesTab({
  book,
  characters,
  markers,
  onJumpToMarker,
}: {
  book: import('../../types').Book | null
  characters: Character[]
  markers: Record<string, StatDelta[]>
  onJumpToMarker: (documentId: string, offset: number) => void
}) {
  const entries = useMemo<ChangeEntry[]>(() => {
    const out: ChangeEntry[] = []
    if (!book) return out
    for (const doc of getDocumentTreeOrder(book)) {
      const extracted = extractMarkers(doc.content ?? '')
      for (const marker of extracted) {
        if (marker.kind !== 'delta') continue
        const deltas = markers[marker.id]
        if (!deltas || deltas.length === 0) continue
        out.push({
          markerId: marker.id,
          documentId: doc.id,
          documentName: doc.name,
          offset: marker.offset,
          deltas,
        })
      }
    }
    return out
  }, [book, markers])

  if (!book) {
    return <div className="text-center text-xs text-gray-500 py-8">No active book.</div>
  }
  if (entries.length === 0) {
    return (
      <div
        data-testid="character-panel-changes-empty"
        className="text-center text-xs text-gray-500 py-8"
      >
        No stat changes in this book yet.
      </div>
    )
  }

  const charById = new Map(characters.map((c) => [c.id, c]))
  let lastDocId: string | null = null

  return (
    <div className="space-y-2" data-testid="character-panel-changes">
      {entries.map((entry) => {
        const newDoc = entry.documentId !== lastDocId
        lastDocId = entry.documentId
        return (
          <div key={entry.markerId}>
            {newDoc && (
              <div className="text-[10px] uppercase tracking-wide text-gray-500 pt-2 pb-1">
                {entry.documentName}
              </div>
            )}
            <button
              data-testid="character-panel-change-row"
              onClick={() => onJumpToMarker(entry.documentId, entry.offset)}
              className="w-full text-left px-2 py-1.5 bg-gray-800/40 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded transition-colors space-y-1"
            >
              {entry.deltas.map((d) => {
                const c = charById.get(d.characterId)
                return (
                  <div key={d.id} className="flex items-baseline gap-1.5 text-[11px]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 translate-y-[1px]"
                      style={{ backgroundColor: c?.color ?? '#6b7280' }}
                    />
                    <span className="text-gray-400 shrink-0">
                      {c?.name ?? 'Unknown'}
                    </span>
                    <span className="text-gray-200 truncate">
                      {summarizeOp(d.op, c)}
                    </span>
                  </div>
                )
              })}
              {entry.deltas.some((d) => d.note) && (
                <div className="text-[10px] text-gray-500 italic truncate pl-3.5">
                  {entry.deltas
                    .map((d) => d.note)
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
