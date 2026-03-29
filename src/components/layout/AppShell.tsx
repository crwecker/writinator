import { useState, useCallback, useEffect, useRef } from 'react'
import type { EditorView } from '@codemirror/view'
import { Sidebar } from '../sidebar/Sidebar'
import Editor from '../editor/Editor'
import BubbleToolbar from '../editor/BubbleToolbar'
import VimStatusLine from '../editor/VimStatusLine'
import type { VimMode } from '../editor/VimStatusLine'
import { ShortcutsMenu } from './ShortcutsMenu'
import { useDocumentStore } from '../../stores/documentStore'
import { useEditorStore } from '../../stores/editorStore'
import { saveBook, openBook, clearFileHandle } from '../../lib/fileSystem'

export function AppShell() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [vimCurrentMode, setVimCurrentMode] = useState<VimMode>('NORMAL')
  const [editorView, setEditorView] = useState<EditorView | null>(null)
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

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return

      // Ctrl+Shift+F toggles typewriter/focus mode
      if (e.key === 'F' && e.shiftKey) {
        e.preventDefault()
        toggleDistractionFree()
        return
      }

      switch (e.key) {
        case 'b':
          e.preventDefault()
          setDropdownOpen((prev) => !prev)
          break
        case 's': {
          e.preventDefault()
          const currentBook = useDocumentStore.getState().book
          if (currentBook) {
            useDocumentStore.getState()._flushContentUpdate()
            saveBook(currentBook)
          }
          break
        }
        case 'o':
          e.preventDefault()
          openBook().then((opened) => {
            if (opened) {
              clearFileHandle()
              loadBook(opened)
            }
          })
          break
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [loadBook, toggleDistractionFree])

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

          <ShortcutsMenu />

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

      {/* Bottom bar — minimal in distraction-free mode */}
      <div className={`flex items-center justify-between border-t border-gray-700 bg-bg-dark px-4 py-1 text-xs shrink-0 ${distractionFree ? 'opacity-20 hover:opacity-60 transition-opacity' : ''}`}>
        <span className="text-gray-500 tabular-nums">
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
        </span>
        <VimStatusLine mode={vimCurrentMode} />
      </div>
    </div>
  )
}
