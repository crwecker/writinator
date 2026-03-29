import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, placeholder, drawSelection, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { vim, getCM as getVimCM, Vim } from '@replit/codemirror-vim'
import { useDocumentStore } from '../../stores/documentStore'
import { useEditorStore } from '../../stores/editorStore'
import type { VimMode } from './VimStatusLine'
import './editor.css'

const FONT_FAMILY_MAP: Record<string, string> = {
  serif: "'Lora', serif",
  sans: 'system-ui, -apple-system, sans-serif',
  mono: "'JetBrains Mono', monospace",
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function makeFontTheme(fontFamily: string): Extension {
  const cssFont = FONT_FAMILY_MAP[fontFamily] ?? FONT_FAMILY_MAP.serif
  return EditorView.theme({
    '.cm-content': { fontFamily: cssFont },
  })
}

function makeFontSizeTheme(fontSize: number): Extension {
  return EditorView.theme({
    '.cm-content': { fontSize: `${fontSize}px` },
  })
}

// Markdown decoration plugin
function markdownDecorations(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = []
  const doc = view.state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const text = line.text

    const headingMatch = text.match(/^(#{1,3})\s/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const sizes = ['1.8em', '1.4em', '1.15em']
      const weights = ['700', '600', '600']
      decorations.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({
          attributes: {
            style: `font-size: ${sizes[level - 1]}; font-weight: ${weights[level - 1]}; line-height: 1.3;`,
          },
        }),
      })
    }

    const boldRegex = /\*\*(.+?)\*\*/g
    let match
    while ((match = boldRegex.exec(text)) !== null) {
      decorations.push({
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
        deco: Decoration.mark({ attributes: { style: 'font-weight: 700;' } }),
      })
    }

    const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g
    while ((match = italicRegex.exec(text)) !== null) {
      decorations.push({
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
        deco: Decoration.mark({ attributes: { style: 'font-style: italic;' } }),
      })
    }

    const strikeRegex = /~~(.+?)~~/g
    while ((match = strikeRegex.exec(text)) !== null) {
      decorations.push({
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
        deco: Decoration.mark({ attributes: { style: 'text-decoration: line-through;' } }),
      })
    }

    const codeRegex = /`([^`]+)`/g
    while ((match = codeRegex.exec(text)) !== null) {
      decorations.push({
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
        deco: Decoration.mark({ class: 'cm-md-code' }),
      })
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(decorations.map((d) => d.deco.range(d.from, d.to)))
}

const markdownDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = markdownDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = markdownDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// Custom kj keymap for exiting insert mode
function kjExitInsertMode(): Extension {
  let lastKey = ''
  let lastTime = 0

  return EditorView.domEventHandlers({
    keydown(event, view) {
      const ts = Date.now()
      const cmVim = getVimCM(view)
      if (!cmVim) return false

      const vimState = (cmVim as any).state?.vim
      if (!vimState || vimState.mode !== 'insert') {
        lastKey = ''
        return false
      }

      if (event.key === 'j') {
        lastKey = 'j'
        lastTime = ts
        return false
      }

      if (event.key === 'k' && lastKey === 'j' && ts - lastTime < 500) {
        event.preventDefault()
        // Delete the 'j' that was typed
        const cursor = view.state.selection.main.head
        if (cursor > 0) {
          view.dispatch({ changes: { from: cursor - 1, to: cursor } })
        }
        // Use VIM API to exit insert mode instead of synthetic Escape event
        Vim.handleKey(cmVim, '<Esc>', 'mapping')
        lastKey = ''
        return true
      }

      lastKey = ''
      return false
    },
  })
}

interface EditorProps {
  onWordCountChange?: (count: number) => void
  onVimModeChange?: (mode: VimMode) => void
  onEditorView?: (view: EditorView | null) => void
}

export default function Editor({ onWordCountChange, onVimModeChange, onEditorView }: EditorProps) {
  // Use selectors to avoid re-renders on unrelated store changes
  const activeChapterId = useDocumentStore((s) => s.activeChapterId)
  const fontFamily = useEditorStore((s) => s.fontFamily)
  const fontSize = useEditorStore((s) => s.fontSize)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const loadedChapterRef = useRef<string | null>(null)
  const fontCompartmentRef = useRef<Compartment | null>(null)
  const fontSizeCompartmentRef = useRef<Compartment | null>(null)

  // Stable callback refs
  const callbacksRef = useRef({ onWordCountChange, onVimModeChange, onEditorView })
  callbacksRef.current = { onWordCountChange, onVimModeChange, onEditorView }

  // VIM mode polling
  useEffect(() => {
    let lastMode: VimMode = 'NORMAL'
    const interval = setInterval(() => {
      const view = viewRef.current
      if (!view) return
      const cmVim = getVimCM(view)
      if (!cmVim) return
      const vimState = (cmVim as any).state?.vim
      if (!vimState) return

      let currentMode: VimMode = 'NORMAL'
      if (vimState.mode === 'insert') currentMode = 'INSERT'
      else if (vimState.mode === 'visual') currentMode = 'VISUAL'

      if (currentMode !== lastMode) {
        lastMode = currentMode
        callbacksRef.current.onVimModeChange?.(currentMode)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Create editor on mount — compartments are instance-scoped via refs
  useEffect(() => {
    if (!containerRef.current) return

    // Clear container in case of StrictMode double-mount
    containerRef.current.innerHTML = ''

    const fontComp = new Compartment()
    const fontSizeComp = new Compartment()
    fontCompartmentRef.current = fontComp
    fontSizeCompartmentRef.current = fontSizeComp

    const updateContent = useDocumentStore.getState().updateChapterContent

    const state = EditorState.create({
      doc: '',
      extensions: [
        vim(),
        drawSelection(),
        kjExitInsertMode(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        oneDark,
        markdownDecorationPlugin,
        placeholder('Start writing...'),
        fontComp.of(makeFontTheme(useEditorStore.getState().fontFamily)),
        fontSizeComp.of(makeFontSizeTheme(useEditorStore.getState().fontSize)),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: 'transparent' },
          '.cm-scroller': { overflow: 'auto', padding: '2rem', lineHeight: '1.75' },
          '.cm-content': { maxWidth: 'none', caretColor: 'var(--color-opal-100, #6ee7b7)' },
          '.cm-gutters': { display: 'none' },
          '.cm-md-code': {
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: '0.25rem',
            padding: '0.1em 0.3em',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.9em',
          },
          '.cm-cursor': { borderLeftColor: 'var(--color-opal-100, #6ee7b7)' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, & .cm-selectionBackground': {
            backgroundColor: 'rgba(110, 231, 183, 0.3) !important',
          },
          '.cm-selectionMatch': {
            backgroundColor: 'rgba(110, 231, 183, 0.15) !important',
          },
          '.cm-fat-cursor': {
            backgroundColor: 'rgba(110, 231, 183, 0.4) !important',
            color: 'inherit !important',
          },
          '.cm-panels': { backgroundColor: '#1e1e2e', color: '#cdd6f4' },
          '.cm-panels .cm-panel': { backgroundColor: '#1e1e2e' },
        }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString()
            // Defer React state updates out of CM6's synchronous update cycle
            // to prevent React re-renders from interfering with CM6 DOM updates
            queueMicrotask(() => {
              callbacksRef.current.onWordCountChange?.(countWords(text))
              updateContent(text)
            })
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    callbacksRef.current.onEditorView?.(view)

    // Load initial chapter content
    const store = useDocumentStore.getState()
    const chapter = store.book?.chapters.find((ch) => ch.id === store.activeChapterId)
    if (chapter?.content) {
      view.dispatch({ changes: { from: 0, to: 0, insert: chapter.content } })
      callbacksRef.current.onWordCountChange?.(countWords(chapter.content))
      loadedChapterRef.current = chapter.id
    } else if (chapter) {
      loadedChapterRef.current = chapter.id
    }

    return () => {
      viewRef.current = null
      fontCompartmentRef.current = null
      fontSizeCompartmentRef.current = null
      callbacksRef.current.onEditorView?.(null)
      view.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load chapter content when active chapter changes
  const loadChapter = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const store = useDocumentStore.getState()
    const chapter = store.book?.chapters.find((ch) => ch.id === store.activeChapterId)
    if (!chapter) return
    if (loadedChapterRef.current === chapter.id) return

    loadedChapterRef.current = chapter.id
    const content = chapter.content ?? ''
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    })
    callbacksRef.current.onWordCountChange?.(countWords(content))
  }, [])

  useEffect(() => {
    loadChapter()
  }, [activeChapterId, loadChapter])

  // Update font family
  useEffect(() => {
    const view = viewRef.current
    const comp = fontCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({ effects: comp.reconfigure(makeFontTheme(fontFamily)) })
  }, [fontFamily])

  // Update font size
  useEffect(() => {
    const view = viewRef.current
    const comp = fontSizeCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({ effects: comp.reconfigure(makeFontSizeTheme(fontSize)) })
  }, [fontSize])

  const hasBook = useDocumentStore((s) => !!s.book)
  const hasChapter = useDocumentStore((s) => !!s.activeChapterId)

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-bg-default relative">
      <div ref={containerRef} className="h-full w-full" />
      {(!hasBook || !hasChapter) && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Create a book or select a chapter to start writing.</p>
        </div>
      )}
    </div>
  )
}
