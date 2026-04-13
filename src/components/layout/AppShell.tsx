import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { EditorView } from '@codemirror/view'
import { BookOpenCheck, Coins, Send } from 'lucide-react'
import { Sidebar } from '../sidebar/Sidebar'
import Editor from '../editor/Editor'
import BubbleToolbar from '../editor/BubbleToolbar'
import VimStatusLine from '../editor/VimStatusLine'
import type { VimMode } from '../editor/VimStatusLine'
import { ShortcutsMenu } from './ShortcutsMenu'
import { ExportMenu } from './ExportMenu'
import { useStoryletStore } from '../../stores/storyletStore'
import { useEditorStore } from '../../stores/editorStore'
import { quickSave, saveAsNewFile } from '../../lib/fileSystem'
import { createSnapshot } from '../../stores/snapshotStore'
import { useKeybindingStore, matchesEvent } from '../../stores/keybindingStore'
import { SnapshotBrowser } from './SnapshotBrowser'
import { PublishedSnapshotsBrowser } from './PublishedSnapshotsBrowser'
import { PublishModal } from './PublishModal'
import { StyleEditor } from '../editor/StyleEditor'
import { AdventurersGuild, type GuildTab } from '../quests/AdventurersGuild'
import { ImageRevealPanel } from '../quests/ImageRevealPanel'
import { QuestReminder } from '../quests/QuestReminder'
import { CharacterSheetModal } from '../characters/CharacterSheetModal'
import { CharacterPanel } from '../characters/CharacterPanel'
import { DeltaEditorModal } from '../characters/DeltaEditorModal'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { SubStoryletLinks } from '../editor/SubStoryletLinks'
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
  const [publishedSnapshotsOpen, setPublishedSnapshotsOpen] = useState(false)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
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

  const book = useStoryletStore((s) => s.book)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const hasHydrated = useStoryletStore((s) => s.hasHydrated)
  const renameBook = useStoryletStore((s) => s.renameBook)
  const renameStorylet = useStoryletStore((s) => s.renameStorylet)
  const bookWordCount = useMemo(
    () => book?.storylets.reduce((sum, storylet) => sum + countWords(storylet.content), 0) ?? 0,
    [book?.storylets],
  )
  const distractionFree = useEditorStore((s) => s.distractionFree)
  const toggleDistractionFree = useEditorStore((s) => s.toggleDistractionFree)
  const toggleRenderMode = useEditorStore((s) => s.toggleRenderMode)
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen)
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar)

  const activeStorylet = book?.storylets?.find((storylet) => storylet.id === activeStoryletId)

  const [editingBookTitle, setEditingBookTitle] = useState(false)
  const [bookTitleValue, setBookTitleValue] = useState('')
  const [editingStoryletTitle, setEditingStoryletTitle] = useState(false)
  const [storyletTitleValue, setStoryletTitleValue] = useState('')

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

  const startEditingStoryletTitle = useCallback(() => {
    if (!activeStorylet) return
    setStoryletTitleValue(activeStorylet.name)
    setEditingStoryletTitle(true)
  }, [activeStorylet])

  const commitStoryletTitle = useCallback(() => {
    const trimmed = storyletTitleValue.trim()
    if (trimmed && activeStoryletId && trimmed !== activeStorylet?.name) {
      renameStorylet(activeStoryletId, trimmed)
    }
    setEditingStoryletTitle(false)
  }, [storyletTitleValue, activeStoryletId, activeStorylet?.name, renameStorylet])

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
    useStoryletStore.getState().updateStoryletContent(content)
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
        setPublishedSnapshotsOpen(false)
        return
      }
      if (km.openPublishedSnapshots && matchesEvent(km.openPublishedSnapshots, e)) {
        e.preventDefault()
        setPublishedSnapshotsOpen((prev) => !prev)
        setSnapshotsOpen(false)
        return
      }
      if (km.publishStorylet && matchesEvent(km.publishStorylet, e)) {
        e.preventDefault()
        if (useStoryletStore.getState().activeStoryletId) {
          setPublishModalOpen(true)
        }
        return
      }
      if (matchesEvent(km.toggleFileTree, e)) {
        e.preventDefault()
        useEditorStore.getState().toggleSidebar()
        return
      }
      if (matchesEvent(km.saveToDisk, e)) {
        e.preventDefault()
        const state = useStoryletStore.getState()
        state._flushContentUpdate()
        const { book: currentBook, activeStoryletId: docId, globalSettings } = useStoryletStore.getState()
        if (currentBook) {
          const storylet = docId ? currentBook.storylets.find((d) => d.id === docId) : null
          const snapshotPromise = storylet?.content
            ? createSnapshot(docId!, storylet.content, 'manual')
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
        void useStoryletStore.getState().closeBook()
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
      const { book, activeStoryletId } = useStoryletStore.getState()
      if (!book || !activeStoryletId) return
      useStoryletStore.getState()._flushContentUpdate()
      const storylet = useStoryletStore.getState().book?.storylets?.find(
        (s) => s.id === activeStoryletId
      )
      if (storylet?.content) {
        createSnapshot(activeStoryletId, storylet.content, 'auto')
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
            {activeStorylet && (
              <>
                <span className="text-gray-600 shrink-0">—</span>
                {editingStoryletTitle ? (
                  <input
                    autoFocus
                    className="bg-gray-800 border border-blue-300 rounded px-1 py-0 text-sm text-white font-medium outline-none"
                    value={storyletTitleValue}
                    onChange={(e) => setStoryletTitleValue(e.target.value)}
                    onBlur={commitStoryletTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitStoryletTitle()
                      if (e.key === 'Escape') setEditingStoryletTitle(false)
                    }}
                  />
                ) : (
                  <span
                    className="text-gray-400 font-medium truncate cursor-default"
                    onDoubleClick={startEditingStoryletTitle}
                    title="Double-click to rename storylet"
                  >
                    {activeStorylet.name}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <ExportMenu />
            <button
              onClick={() => setPublishModalOpen(true)}
              disabled={!activeStorylet}
              className="text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-0.5 text-xs flex items-center gap-1"
              title="Publish storylet (Ctrl+Shift+P)"
            >
              <Send size={12} /> Publish
            </button>
            <button
              onClick={() => {
                setPublishedSnapshotsOpen((prev) => !prev)
                setSnapshotsOpen(false)
              }}
              className="text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 text-xs flex items-center gap-1"
              title="Published versions (Ctrl+Shift+L)"
            >
              <BookOpenCheck size={12} /> Published
            </button>
            <button
              onClick={() => {
                setSnapshotsOpen((prev) => !prev)
                setPublishedSnapshotsOpen(false)
              }}
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
          <SubStoryletLinks />
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
          <PublishedSnapshotsBrowser
            open={publishedSnapshotsOpen}
            onClose={() => setPublishedSnapshotsOpen(false)}
          />
          <PublishModal
            open={publishModalOpen}
            onClose={() => setPublishModalOpen(false)}
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
