import { useMemo, useState, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { useEditorStore } from '../../stores/editorStore'
import { checkConsistency, computeStateAt, withLiveStorylet } from '../../lib/characterState'
import { markerCommentRegex, removeMarkerFromStorylet } from '../../lib/removeMarker'
import { getLiveBook } from '../editor/statRefExtension'
import { StatsTab, type ComputedCharacterView } from './StatsTab'
import { SnippetsTab } from './SnippetsTab'
import { GraphTab } from './GraphTab'
import { IssuesTab } from './IssuesTab'
import { ChangesTab } from './ChangesTab'
import type { ConsistencyIssue } from '../../types'

type PanelTab = 'stats' | 'snippets' | 'graph' | 'issues' | 'changes'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
  onOpenCharacterSheet?: () => void
  /** When true, render only the inner body (tabs + content) — skip outer wrapper and header. */
  embedded?: boolean
}

export function CharacterPanel({ open, onClose, onOpenCharacterSheet, editorView, embedded = false }: Props) {
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const removeMarkerFromStore = useCharacterStore((s) => s.removeMarker)
  const setMarker = useCharacterStore((s) => s.setMarker)
  const setEquipmentSlots = useCharacterStore((s) => s.setEquipmentSlots)
  const cursorOffset = useEditorStore((s) => s.cursorOffset)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const setActiveStorylet = useStoryletStore((s) => s.setActiveStorylet)
  const book = useStoryletStore((s) => s.book)
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

  // The store's copy of the open storylet trails the editor by up to 1.5s,
  // but the cursor offset is live — compute against the editor's text. The
  // editor's own live book is shared with its widgets (same timeline cache).
  // Re-renders come from cursor moves and marker changes, which accompany
  // every edit that could change state.
  const liveBook =
    book && activeStoryletId && editorView
      ? getLiveBook(editorView.state) ??
        withLiveStorylet(book, activeStoryletId, editorView.state.doc.toString())
      : book

  const computedPerCharacter = useMemo(() => {
    const map = new Map<string, ComputedCharacterView>()
    if (!liveBook) return map
    const stopAt = activeStoryletId
      ? { storyletId: activeStoryletId, offset: cursorOffset }
      : undefined
    for (const c of characters) {
      map.set(c.id, computeStateAt(c, liveBook, markers, stopAt))
    }
    return map
  }, [characters, markers, liveBook, activeStoryletId, cursorOffset])

  const canEdit = !!activeStoryletId && !!editorView

  const jumpToMarker = (docId: string, offset: number) => {
    if (!editorView) return
    if (docId !== activeStoryletId) {
      setActiveStorylet(docId)
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

  const body = (
    <>
      {/* Tabs */}
      <div className="flex border-b border-gray-700 bg-gray-900/60">
        <TabButton active={tab === 'stats'} onClick={() => setTab('stats')} testId="character-panel-tab-stats">
          Stats
        </TabButton>
        <TabButton active={tab === 'snippets'} onClick={() => setTab('snippets')} testId="character-panel-tab-snippets">
          Snippets
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
        {characters.length === 0 && tab !== 'snippets' ? (
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
          <StatsTab
            characters={characters}
            computedPerCharacter={computedPerCharacter}
            hasStorylet={!!book && !!activeStoryletId}
            canEdit={canEdit}
            editorView={editorView}
            onOpenCharacterSheet={onOpenCharacterSheet}
          />
        ) : tab === 'snippets' ? (
          <SnippetsTab editorView={editorView} canEdit={canEdit} />
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
            onRemoveOrphanFromText={(markerId, storyletId) => {
              if (!book) return
              removeMarkerFromStorylet({
                book,
                storyletId,
                activeStoryletId,
                view: editorView,
                pattern: markerCommentRegex('stat', markerId),
              })
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
    </>
  )

  if (embedded) {
    return (
      <div data-testid="character-panel" className="flex flex-col h-full overflow-hidden">
        {body}
      </div>
    )
  }

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
      {body}
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  testId: string
  badgeCount?: number
  children: ReactNode
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
