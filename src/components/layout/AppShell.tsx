import { useState, useCallback, useEffect } from 'react'
import type { EditorView } from '@codemirror/view'
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
import { QuestPicker } from '../quests/QuestPicker'
import { ImageRevealPanel } from '../quests/ImageRevealPanel'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { SubDocumentLinks } from '../editor/SubDocumentLinks'
import { LandingPage } from './LandingPage'

export function AppShell() {
  const [wordCount, setWordCount] = useState(0)
  const [vimCurrentMode, setVimCurrentMode] = useState<VimMode>('NORMAL')
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [styleEditorOpen, setStyleEditorOpen] = useState(false)
  const [questPickerOpen, setQuestPickerOpen] = useState(false)
  const activeSessions = useImageRevealStore((s) => s.activeSessions)

  const book = useDocumentStore((s) => s.book)
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)
  const hasHydrated = useDocumentStore((s) => s.hasHydrated)
  const distractionFree = useEditorStore((s) => s.distractionFree)
  const toggleDistractionFree = useEditorStore((s) => s.toggleDistractionFree)
  const renderMode = useEditorStore((s) => s.renderMode)
  const toggleRenderMode = useEditorStore((s) => s.toggleRenderMode)
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen)
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar)

  const activeDocument = book?.documents?.find((doc) => doc.id === activeDocumentId)

  const handleWordCountChange = useCallback((c: number) => setWordCount(c), [])
  const handleVimModeChange = useCallback((m: VimMode) => setVimCurrentMode(m), [])
  const handleEditorView = useCallback((v: EditorView | null) => setEditorView(v), [])

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

  const titleText = book
    ? `${book.title}${activeDocument ? ` - ${activeDocument.name}` : ''}`
    : 'Writinator'

  const showSidebar = sidebarOpen && !distractionFree

  if (!hasHydrated) return null
  if (!book) return <LandingPage />

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-darker text-gray-200 overflow-hidden">
      {/* Top bar — hidden in distraction-free mode */}
      {!distractionFree && (
        <div className="flex items-center justify-between border-b border-gray-700 bg-bg-dark px-4 py-1.5 text-sm shrink-0">
          <button
            onClick={toggleSidebar}
            className="text-gray-200 hover:text-white font-medium truncate max-w-md text-left"
            title="Toggle sidebar (Ctrl+B)"
          >
            {titleText}
            <span className="ml-1.5 text-gray-500 text-xs">{sidebarOpen ? '\u25C0' : '\u25B6'}</span>
          </button>

          <div className="flex items-center gap-1">
            <ExportMenu />
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
          <BubbleToolbar editorView={editorView} />
          <SnapshotBrowser
            open={snapshotsOpen}
            onClose={() => setSnapshotsOpen(false)}
            onRestore={handleRestoreSnapshot}
          />
          <StyleEditor open={styleEditorOpen} onClose={() => setStyleEditorOpen(false)} />

          <ImageRevealPanel />

          <QuestPicker
            open={questPickerOpen}
            onClose={() => setQuestPickerOpen(false)}
          />
        </div>
      </div>

      {/* Bottom bar — minimal in distraction-free mode */}
      <div className={`flex items-center justify-between border-t border-gray-700 bg-bg-dark px-4 py-1 text-xs shrink-0 ${distractionFree ? 'opacity-20 hover:opacity-60 transition-opacity' : ''}`}>
        <span className="text-gray-500 tabular-nums">
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStyleEditorOpen((p) => !p)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Document styles"
          >
            Styles
          </button>
          <button
            onClick={toggleRenderMode}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Toggle source/rendered (Ctrl+Shift+E)"
          >
            {renderMode === 'source' ? 'Source' : 'Rendered'}
          </button>
          <button
            onClick={() => setQuestPickerOpen(true)}
            className={`transition-colors ${
              activeSessions.length > 0
                ? 'text-amber-500 hover:text-amber-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Quests"
          >
            Quest
          </button>
          <button
            onClick={() => setSnapshotsOpen((prev) => !prev)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Snapshot history (Ctrl+Shift+H)"
          >
            History
          </button>
          <VimStatusLine mode={vimCurrentMode} />
        </div>
      </div>
    </div>
  )
}
