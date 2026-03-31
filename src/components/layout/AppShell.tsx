import { useState, useCallback, useEffect, useRef } from 'react'
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
import { saveBook, openBook, clearFileHandle } from '../../lib/fileSystem'
import { createSnapshot } from '../../stores/snapshotStore'
import { useKeybindingStore, matchesEvent } from '../../stores/keybindingStore'
import { SnapshotBrowser } from './SnapshotBrowser'
import { QuestPicker } from '../quests/QuestPicker'
import { QuestProgress } from '../quests/QuestProgress'
import { useQuestStore } from '../../stores/questStore'

export function AppShell() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [vimCurrentMode, setVimCurrentMode] = useState<VimMode>('NORMAL')
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [questPickerOpen, setQuestPickerOpen] = useState(false)
  const activeQuest = useQuestStore((s) => s.activeQuest)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLButtonElement>(null)

  const book = useDocumentStore((s) => s.book)
  const activeChapterId = useDocumentStore((s) => s.activeChapterId)
  const createBook = useDocumentStore((s) => s.createBook)
  const loadBook = useDocumentStore((s) => s.loadBook)
  const distractionFree = useEditorStore((s) => s.distractionFree)
  const toggleDistractionFree = useEditorStore((s) => s.toggleDistractionFree)

  const activeChapter = book?.chapters.find((ch) => ch.id === activeChapterId)

  const handleWordCountChange = useCallback((c: number) => setWordCount(c), [])
  const handleVimModeChange = useCallback((m: VimMode) => setVimCurrentMode(m), [])
  const handleEditorView = useCallback((v: EditorView | null) => setEditorView(v), [])

  const handleRestoreSnapshot = useCallback((content: string) => {
    if (!editorView) return
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content },
    })
    // Persist the restored content
    useDocumentStore.getState().updateChapterContent(content)
  }, [editorView])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        titleRef.current &&
        !titleRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

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
        setDropdownOpen((prev) => !prev)
        return
      }
      if (matchesEvent(km.saveToDisk, e)) {
        e.preventDefault()
        const state = useDocumentStore.getState()
        state._flushContentUpdate()
        const currentBook = useDocumentStore.getState().book
        if (currentBook) {
          const chId = useDocumentStore.getState().activeChapterId
          const ch = chId ? currentBook.chapters.find((c) => c.id === chId) : null
          if (ch?.content) {
            createSnapshot(chId!, ch.content, 'manual')
          }
          saveBook(currentBook)
        }
        return
      }
      if (matchesEvent(km.openFromDisk, e)) {
        e.preventDefault()
        openBook().then((opened) => {
          if (opened) {
            clearFileHandle()
            loadBook(opened)
          }
        })
        return
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [loadBook, toggleDistractionFree])

  // Auto-snapshot every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      const { book, activeChapterId } = useDocumentStore.getState()
      if (!book || !activeChapterId) return
      useDocumentStore.getState()._flushContentUpdate()
      const chapter = useDocumentStore.getState().book?.chapters.find(
        (ch) => ch.id === activeChapterId
      )
      if (chapter?.content) {
        createSnapshot(activeChapterId, chapter.content, 'auto')
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-create a book if none exists
  useEffect(() => {
    if (!book) {
      createBook('Untitled Book')
    }
  }, [book, createBook])

  const titleText = book
    ? `${book.title}${activeChapter ? ` - ${activeChapter.name}` : ''}`
    : 'Writinator'

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-darker text-gray-200 overflow-hidden">
      {/* Top bar — hidden in distraction-free mode */}
      {!distractionFree && (
        <div className="flex items-center justify-between border-b border-gray-700 bg-bg-dark px-4 py-1.5 text-sm shrink-0 relative">
          <button
            ref={titleRef}
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="text-gray-200 hover:text-white font-medium truncate max-w-md text-left"
            title="Click to open file tree (Ctrl+B)"
          >
            {titleText}
            <span className="ml-1.5 text-gray-500 text-xs">{dropdownOpen ? '\u25B4' : '\u25BE'}</span>
          </button>

          <div className="flex items-center gap-1">
            <ExportMenu />
            <ShortcutsMenu />
          </div>

          {/* File tree dropdown */}
          {dropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 mt-0 z-50 w-[280px] max-h-[70vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-b-lg shadow-xl"
            >
              <Sidebar onChapterSelect={() => setDropdownOpen(false)} />
            </div>
          )}
        </div>
      )}

      {/* Editor area - full width, full height */}
      <Editor
        onWordCountChange={handleWordCountChange}
        onVimModeChange={handleVimModeChange}
        onEditorView={handleEditorView}
      />
      <BubbleToolbar editorView={editorView} />
      <SnapshotBrowser
        open={snapshotsOpen}
        onClose={() => setSnapshotsOpen(false)}
        onRestore={handleRestoreSnapshot}
      />

      {/* Quest progress — above bottom bar */}
      <QuestProgress />

      <QuestPicker
        open={questPickerOpen}
        onClose={() => setQuestPickerOpen(false)}
      />

      {/* Bottom bar — minimal in distraction-free mode */}
      <div className={`flex items-center justify-between border-t border-gray-700 bg-bg-dark px-4 py-1 text-xs shrink-0 ${distractionFree ? 'opacity-20 hover:opacity-60 transition-opacity' : ''}`}>
        <span className="text-gray-500 tabular-nums">
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQuestPickerOpen(true)}
            className={`transition-colors ${
              activeQuest
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
