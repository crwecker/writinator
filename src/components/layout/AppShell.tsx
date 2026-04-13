import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { EditorView } from '@codemirror/view'
import { Coins } from 'lucide-react'
import { Sidebar } from '../sidebar/Sidebar'
import Editor from '../editor/Editor'
import BubbleToolbar from '../editor/BubbleToolbar'
import VimStatusLine from '../editor/VimStatusLine'
import type { VimMode } from '../editor/VimStatusLine'
import { ShortcutsMenu } from './ShortcutsMenu'
import { ExportMenu } from './ExportMenu'
import { useDocumentStore } from '../../stores/documentStore'
import { useEditorStore } from '../../stores/editorStore'
import { quickSave, saveAsNewFile } from '../../lib/fileSystem'
import { createSnapshot } from '../../stores/snapshotStore'
import { useKeybindingStore, matchesEvent } from '../../stores/keybindingStore'
import { SnapshotBrowser } from './SnapshotBrowser'
import { StyleEditor } from '../editor/StyleEditor'
import { AdventurersGuild, type GuildTab } from '../quests/AdventurersGuild'
import { ImageRevealPanel } from '../quests/ImageRevealPanel'
import { QuestReminder } from '../quests/QuestReminder'
import { CharacterSheetModal } from '../characters/CharacterSheetModal'
import { CharacterPanel } from '../characters/CharacterPanel'
import { DeltaEditorModal } from '../characters/DeltaEditorModal'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { SubDocumentLinks } from '../editor/SubDocumentLinks'
import { LandingPage } from './LandingPage'
import { RewardToast } from '../quests/RewardToast'
import { usePlayerStore } from '../../stores/playerStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { countWords } from '../../lib/words'
import { JourneyBar } from './JourneyBar'
import { DailyTarget } from './DailyTarget'
import { MilestoneFlash } from './MilestoneFlash'
import { WriteathonCompleteCelebration } from '../quests/WriteathonCompleteCelebration'

export function AppShell() {
  const [wordCount, setWordCount] = useState(0)
  const [vimCurrentMode, setVimCurrentMode] = useState<VimMode>('NORMAL')
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [styleEditorOpen, setStyleEditorOpen] = useState(false)
  const [guildOpen, setGuildOpen] = useState(false)
  const [guildTab, setGuildTab] = useState<GuildTab>('board')
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false)
  const [characterPanelOpen, setCharacterPanelOpen] = useState(false)
  const [deltaEditorState, setDeltaEditorState] = useState<{
    open: boolean
    markerId: string | null
    mode: 'create' | 'edit'
  }>({ open: false, markerId: null, mode: 'create' })
  const [coinPulsing, setCoinPulsing] = useState(false)
  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const writeathonConfig = useWriteathonStore((s) => s.config)
  const activeBoardQuests = useWriteathonStore((s) => s.activeBoardQuests)
  const coins = usePlayerStore((s) => s.coins)
  const retroactiveGrantApplied = usePlayerStore((s) => s.retroactiveGrantApplied)
  const prevCoinsRef = useRef(coins)

  const book = useDocumentStore((s) => s.book)
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)
  const hasHydrated = useDocumentStore((s) => s.hasHydrated)
  const renameBook = useDocumentStore((s) => s.renameBook)
  const renameDocument = useDocumentStore((s) => s.renameDocument)
  const bookWordCount = useMemo(
    () => book?.documents.reduce((sum, doc) => sum + countWords(doc.content), 0) ?? 0,
    [book?.documents],
  )
  const distractionFree = useEditorStore((s) => s.distractionFree)
  const toggleDistractionFree = useEditorStore((s) => s.toggleDistractionFree)
  const renderMode = useEditorStore((s) => s.renderMode)
  const toggleRenderMode = useEditorStore((s) => s.toggleRenderMode)
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen)
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar)

  const activeDocument = book?.documents?.find((doc) => doc.id === activeDocumentId)

  const [editingBookTitle, setEditingBookTitle] = useState(false)
  const [bookTitleValue, setBookTitleValue] = useState('')
  const [editingDocTitle, setEditingDocTitle] = useState(false)
  const [docTitleValue, setDocTitleValue] = useState('')

  const startEditingBookTitle = useCallback(() => {
    if (!book) return
    setBookTitleValue(book.title)
    setEditingBookTitle(true)
  }, [book])

  const commitBookTitle = useCallback(() => {
    const trimmed = bookTitleValue.trim()
    if (trimmed && trimmed !== book?.title) renameBook(trimmed)
    setEditingBookTitle(false)
  }, [bookTitleValue, book?.title, renameBook])

  const startEditingDocTitle = useCallback(() => {
    if (!activeDocument) return
    setDocTitleValue(activeDocument.name)
    setEditingDocTitle(true)
  }, [activeDocument])

  const commitDocTitle = useCallback(() => {
    const trimmed = docTitleValue.trim()
    if (trimmed && activeDocumentId && trimmed !== activeDocument?.name) {
      renameDocument(activeDocumentId, trimmed)
    }
    setEditingDocTitle(false)
  }, [docTitleValue, activeDocumentId, activeDocument?.name, renameDocument])

  const handleWordCountChange = useCallback((c: number) => setWordCount(c), [])
  const handleVimModeChange = useCallback((m: VimMode) => setVimCurrentMode(m), [])
  const handleEditorView = useCallback((v: EditorView | null) => {
    setEditorView(v)
    editorViewRef.current = v
  }, [])

  const handleInsertMarker = useCallback((markerId: string) => {
    setDeltaEditorState({ open: true, markerId, mode: 'create' })
  }, [])

  const closeDeltaEditor = useCallback(() => {
    setDeltaEditorState((prev) => ({ ...prev, open: false }))
  }, [])

  // Delegated click listener for stat-marker dots.
  useEffect(() => {
    if (!editorView) return
    const contentDOM = editorView.contentDOM
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      const dot = target.closest('[data-marker-id]') as HTMLElement | null
      if (!dot) return
      const markerId = dot.getAttribute('data-marker-id')
      if (!markerId) return
      e.preventDefault()
      e.stopPropagation()
      setDeltaEditorState({ open: true, markerId, mode: 'edit' })
    }
    contentDOM.addEventListener('click', onClick)
    return () => contentDOM.removeEventListener('click', onClick)
  }, [editorView])

  const handleRestoreSnapshot = useCallback((content: string) => {
    if (!editorView) return
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content },
    })
    useDocumentStore.getState().updateDocumentContent(content)
  }, [editorView])

  // Global keyboard shortcuts (driven by keybinding store)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const km = useKeybindingStore.getState().keymap

      if (matchesEvent(km.toggleTypewriter, e)) {
        e.preventDefault()
        toggleDistractionFree()
        return
      }
      if (matchesEvent(km.snapshotHistory, e)) {
        e.preventDefault()
        setSnapshotsOpen((prev) => !prev)
        return
      }
      if (matchesEvent(km.toggleFileTree, e)) {
        e.preventDefault()
        useEditorStore.getState().toggleSidebar()
        return
      }
      if (matchesEvent(km.saveToDisk, e)) {
        e.preventDefault()
        const state = useDocumentStore.getState()
        state._flushContentUpdate()
        const { book: currentBook, activeDocumentId: docId, globalSettings } = useDocumentStore.getState()
        if (currentBook) {
          const doc = docId ? currentBook.documents.find((d) => d.id === docId) : null
          const snapshotPromise = doc?.content
            ? createSnapshot(docId!, doc.content, 'manual')
            : Promise.resolve(null)
          snapshotPromise.then(() =>
            quickSave(currentBook, globalSettings).then((saved) => {
              if (!saved) saveAsNewFile(currentBook, globalSettings)
            })
          )
        }
        return
      }
      if (matchesEvent(km.toggleRenderMode, e)) {
        e.preventDefault()
        toggleRenderMode()
        return
      }
      if (matchesEvent(km.closeBook, e)) {
        e.preventDefault()
        void useDocumentStore.getState().closeBook()
        return
      }
      if (km.toggleCharacterPanel && matchesEvent(km.toggleCharacterPanel, e)) {
        e.preventDefault()
        setCharacterPanelOpen((p) => !p)
        return
      }
      if (km.insertStatMarker && matchesEvent(km.insertStatMarker, e)) {
        const view = editorViewRef.current
        if (!view) return
        e.preventDefault()
        const { to } = view.state.selection.main
        const markerId = crypto.randomUUID()
        view.dispatch({
          changes: { from: to, to, insert: `<!-- stat:${markerId} -->` },
        })
        setDeltaEditorState({ open: true, markerId, mode: 'create' })
        return
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleDistractionFree, toggleRenderMode])

  // Auto-snapshot every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      const { book, activeDocumentId } = useDocumentStore.getState()
      if (!book || !activeDocumentId) return
      useDocumentStore.getState()._flushContentUpdate()
      const document = useDocumentStore.getState().book?.documents?.find(
        (doc) => doc.id === activeDocumentId
      )
      if (document?.content) {
        createSnapshot(activeDocumentId, document.content, 'auto')
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Coin pulse animation when balance changes
  useEffect(() => {
    if (coins !== prevCoinsRef.current) {
      prevCoinsRef.current = coins
      setCoinPulsing(true)
      const timer = setTimeout(() => setCoinPulsing(false), 400)
      return () => clearTimeout(timer)
    }
  }, [coins])

  // Retroactive coin grant for existing completed sessions
  useEffect(() => {
    if (retroactiveGrantApplied) return
    const { completedSessions } = useImageRevealStore.getState()
    const { addCoins, setRetroactiveGrantApplied } = usePlayerStore.getState()
    const successCount = completedSessions.filter((s) => s.result === 'success').length
    if (successCount > 0) {
      addCoins(successCount * 100)
    }
    setRetroactiveGrantApplied()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showSidebar = sidebarOpen && !distractionFree

  if (!hasHydrated) return null
  if (!book) return <LandingPage />

  return (
    <>
    <RewardToast />
    <MilestoneFlash />
    <WriteathonCompleteCelebration />
    <div className="flex flex-col h-screen w-screen bg-bg-darker text-gray-200 overflow-hidden">
      {/* Top bar — hidden in distraction-free mode */}
      {!distractionFree && (
        <div className="flex items-center justify-between border-b border-gray-700 bg-bg-dark px-4 py-1.5 text-sm shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 max-w-md">
            <button
              onClick={toggleSidebar}
              className={`text-gray-400 text-xs transition-transform shrink-0 ${sidebarOpen ? 'rotate-90' : ''}`}
              title="Toggle sidebar (Ctrl+B)"
            >
              &#9657;
            </button>
            {editingBookTitle ? (
              <input
                autoFocus
                className="bg-gray-800 border border-blue-300 rounded px-1 py-0 text-sm text-white font-semibold outline-none"
                value={bookTitleValue}
                onChange={(e) => setBookTitleValue(e.target.value)}
                onBlur={commitBookTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitBookTitle()
                  if (e.key === 'Escape') setEditingBookTitle(false)
                }}
              />
            ) : (
              <span
                className="text-gray-200 font-semibold truncate cursor-default"
                onDoubleClick={startEditingBookTitle}
                title="Double-click to rename book"
              >
                {book?.title ?? 'Writinator'}
              </span>
            )}
            {activeDocument && (
              <>
                <span className="text-gray-600 shrink-0">—</span>
                {editingDocTitle ? (
                  <input
                    autoFocus
                    className="bg-gray-800 border border-blue-300 rounded px-1 py-0 text-sm text-white font-medium outline-none"
                    value={docTitleValue}
                    onChange={(e) => setDocTitleValue(e.target.value)}
                    onBlur={commitDocTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitDocTitle()
                      if (e.key === 'Escape') setEditingDocTitle(false)
                    }}
                  />
                ) : (
                  <span
                    className="text-gray-400 font-medium truncate cursor-default"
                    onDoubleClick={startEditingDocTitle}
                    title="Double-click to rename document"
                  >
                    {activeDocument.name}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <ExportMenu />
            <button
              onClick={() => setSnapshotsOpen((prev) => !prev)}
              className="text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 text-xs"
              title="Snapshot history (Ctrl+Shift+H)"
            >
              History
            </button>
            <ShortcutsMenu />
          </div>
        </div>
      )}

      {/* Main content: Sidebar + Editor */}
      <div className="flex flex-1 min-h-0">
        {/* Persistent sidebar */}
        {showSidebar && (
          <Sidebar />
        )}

        {/* Editor area */}
        <div className="flex flex-col flex-1 min-w-0">
          <Editor
            onWordCountChange={handleWordCountChange}
            onVimModeChange={handleVimModeChange}
            onEditorView={handleEditorView}
          />
          <SubDocumentLinks />
          <BubbleToolbar
            editorView={editorView}
            onInsertMarker={handleInsertMarker}
            onEditStyles={() => setStyleEditorOpen(true)}
          />
          <SnapshotBrowser
            open={snapshotsOpen}
            onClose={() => setSnapshotsOpen(false)}
            onRestore={handleRestoreSnapshot}
          />
          <StyleEditor open={styleEditorOpen} onClose={() => setStyleEditorOpen(false)} editorView={editorView} />

          <ImageRevealPanel />

          {activeSessions.length === 0 && (
            <QuestReminder
              onStartQuest={() => {
                setGuildTab('board')
                setGuildOpen(true)
              }}
            />
          )}

          <AdventurersGuild
            open={guildOpen}
            activeTab={guildTab}
            onTabChange={setGuildTab}
            onClose={() => setGuildOpen(false)}
          />
          <CharacterSheetModal
            open={characterSheetOpen}
            onClose={() => setCharacterSheetOpen(false)}
          />
          <DeltaEditorModal
            open={deltaEditorState.open}
            onClose={closeDeltaEditor}
            markerId={deltaEditorState.markerId}
            mode={deltaEditorState.mode}
            editorView={editorView}
          />
        </div>

        {characterPanelOpen && !distractionFree && (
          <CharacterPanel
            open={characterPanelOpen}
            onClose={() => setCharacterPanelOpen(false)}
            editorView={editorView}
            onOpenCharacterSheet={() => {
              setCharacterPanelOpen(false)
              setCharacterSheetOpen(true)
            }}
          />
        )}
      </div>

      <JourneyBar bookWordCount={bookWordCount} />

      {/* Bottom bar — minimal in distraction-free mode */}
      <div className={`flex items-center justify-between border-t border-gray-700 bg-bg-dark px-4 py-1 text-xs shrink-0 ${distractionFree ? 'opacity-20 hover:opacity-60 transition-opacity' : ''}`}>
        <span className="text-gray-500 tabular-nums">
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          <span className="mx-1.5 text-gray-600">|</span>
          {bookWordCount.toLocaleString()} book
        </span>
        <span className="mx-1.5 text-gray-600">|</span>
        <DailyTarget bookWordCount={bookWordCount} />
        <div className="flex items-center gap-3">
          <button
            data-testid="character-panel-button"
            onClick={() => setCharacterPanelOpen((p) => !p)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Character stats panel (Ctrl+Shift+C)"
          >
            Stats
          </button>
          <button
            onClick={toggleRenderMode}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Cycle source/rendered/preview (Ctrl+Shift+E)"
          >
            {renderMode === 'source' ? 'Source' : renderMode === 'rendered' ? 'Rendered' : 'Preview'}
          </button>
          <button
            onClick={() => {
              setGuildTab('board')
              setGuildOpen(true)
            }}
            className={`flex items-center gap-1 tabular-nums transition-colors ${
              writeathonConfig?.active ||
              activeBoardQuests.length > 0 ||
              activeSessions.length > 0
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-amber-500 hover:text-amber-400'
            }`}
            title="Adventurer's Guild"
          >
            <Coins
              size={12}
              className={coinPulsing ? 'animate-coin-pulse' : ''}
            />
            <span className={`tabular-nums${coinPulsing ? ' animate-coin-pulse' : ''}`}>
              {coins.toLocaleString()}
            </span>
          </button>
          <VimStatusLine mode={vimCurrentMode} />
        </div>
      </div>
    </div>
    </>
  )
}
