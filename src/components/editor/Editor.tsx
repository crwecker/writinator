import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, placeholder, drawSelection, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, historyKeymap } from '@codemirror/commands'
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { vim, getCM as getVimCM, Vim } from '@replit/codemirror-vim'
import { searchEmojis } from '../../lib/emoji'
import { useStoryletStore } from '../../stores/storyletStore'
import { useEditorStore } from '../../stores/editorStore'
import { useMetricsStore } from '../../stores/metricsStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useNotesStore } from '../../stores/notesStore'
import { htmlToMarkdownWithStyles } from '../../lib/richPaste'
import { useIsFileLocked, isFileLockedNow } from '../../lib/fileLock'
import {
  statMarkerExtension,
  dispatchCharacterSnapshot,
} from './statMarkerExtension'
import {
  statRefExtension,
  dispatchStatRefStoryletContext,
} from './statRefExtension'
import {
  statblockMarkerExtension,
  dispatchStatblockActiveStorylet,
} from './statblockMarkerExtension'
import {
  noteMarkerExtension,
  dispatchNotesSnapshot,
} from './noteMarkerExtension'
import type { DocumentStyles } from '../../types'
import type { VimMode } from './VimStatusLine'
import { renderModeField, setRenderModeEffect } from './renderMode'
import { markdownDecorationPlugin, docStylesChangedEffect } from './markdownDecorations'
import { countWords } from '../../lib/words'
import { isWritingUpdate, wordCountDelta } from './wordCount'
import {
  editorHistory,
  isProgrammaticLoad,
  loadContentIntoView,
  makeLockExt,
  needsEditorReload,
  type LoadedDoc,
} from './docLoad'
import './editor.css'

// Map j/k to gj/gk so vim navigation respects visual (wrapped) lines
// instead of jumping over whole paragraphs.
Vim.map('j', 'gj', 'normal')
Vim.map('k', 'gk', 'normal')
Vim.map('j', 'gj', 'visual')
Vim.map('k', 'gk', 'visual')

const FONT_FAMILY_MAP: Record<string, string> = {
  serif: "'Lora', serif",
  sans: 'system-ui, -apple-system, sans-serif',
  mono: "'JetBrains Mono', monospace",
}

// Map the vim adapter's mode names ('insert', 'replace', 'visual', 'normal')
// to the status-line labels.
function vimModeLabel(mode: string): VimMode {
  if (mode === 'insert') return 'INSERT'
  if (mode === 'replace') return 'REPLACE'
  if (mode === 'visual') return 'VISUAL'
  return 'NORMAL'
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


function makeDocStylesTheme(styles: DocumentStyles | undefined): Extension {
  if (!styles) return []
  const rules: Record<string, Record<string, string>> = {}
  if (styles.body) {
    const body: Record<string, string> = {}
    if (styles.body.fontFamily) body.fontFamily = styles.body.fontFamily
    if (styles.body.fontSize) body.fontSize = `${styles.body.fontSize}px`
    if (styles.body.lineHeight) body.lineHeight = String(styles.body.lineHeight)
    if (styles.body.color) body.color = styles.body.color
    if (styles.body.letterSpacing) body.letterSpacing = styles.body.letterSpacing
    if (Object.keys(body).length) rules['.cm-content'] = body
  }
  return Object.keys(rules).length ? EditorView.theme(rules) : []
}

// Snap the cursor out of any hidden (atomic) range that a motion lands it inside,
// and eagerly across when a forward motion lands on a range's entry boundary (or a
// backward motion on its exit boundary). Entry/exit boundaries render at the same
// visual position as the far side of the hidden range, so stopping there feels
// like a dead keypress (true for l/h/arrows AND w/b/counted motions).
//
// Reads every registered EditorView.atomicRanges provider in the view, so the
// behavior covers every extension that publishes atomic ranges — markdown markers,
// stat/note/statblock marker widgets, and any future hider that follows the pattern.
// Needed because @replit/codemirror-vim NORMAL-mode motions walk by document offsets
// and ignore the atomicRanges facet. Also catches mouse clicks and programmatic
// dispatches that land mid-range.
const atomicCursorSnap = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      if (!update.selectionSet || update.docChanged) return
      const sel = update.state.selection.main
      if (!sel.empty) return
      const pos = sel.head
      const oldPos = update.startState.selection.main.head
      const forward = pos >= oldPos

      let snapTo: number | null = null
      const providers = update.view.state.facet(EditorView.atomicRanges)
      outer: for (const provider of providers) {
        const ranges = provider(update.view)
        const iter = ranges.iter()
        while (iter.value && iter.from <= pos) {
          if (pos > iter.from && pos < iter.to) {
            snapTo = forward ? iter.to : iter.from
            break outer
          }
          if (forward && pos === iter.from) { snapTo = iter.to; break outer }
          if (!forward && pos === iter.to) { snapTo = iter.from; break outer }
          iter.next()
        }
      }

      if (snapTo === null) return
      const target = snapTo
      queueMicrotask(() => {
        update.view.dispatch({ selection: { anchor: target } })
      })
    }
  }
)

// Custom kj keymap for exiting insert mode.
// Fires when 'j' arrives at exactly the cursor position where 'k' was just
// inserted — no time limit, but any intervening edit or cursor movement resets
// the sequence so a stray k earlier in a paragraph won't accidentally trigger.
function kjExitInsertMode(): Extension {
  let lastKey = ''
  let kPos = -1

  return EditorView.domEventHandlers({
    keydown(event, view) {
      const cmVim = getVimCM(view)
      if (!cmVim) return false

      const vimState = (cmVim as unknown as Record<string, unknown>).state as Record<string, unknown> | undefined
      const vimMode = vimState?.vim as Record<string, unknown> | undefined
      if (!vimMode || vimMode.mode !== 'insert') {
        lastKey = ''
        return false
      }

      if (event.key === 'k') {
        lastKey = 'k'
        // Cursor is still at pre-insertion position; after k is typed it will
        // sit at kPos + 1.
        kPos = view.state.selection.main.head
        return false
      }

      if (event.key === 'j' && lastKey === 'k') {
        const cursor = view.state.selection.main.head
        if (cursor === kPos + 1) {
          event.preventDefault()
          // Delete the 'k' that was typed
          view.dispatch({ changes: { from: cursor - 1, to: cursor }, userEvent: 'delete.backward' })
          // Use VIM API to exit insert mode instead of synthetic Escape event
          Vim.handleKey(cmVim, '<Esc>', 'mapping')
          lastKey = ''
          return true
        }
      }

      lastKey = ''
      return false
    },
  })
}

// Extract opening+closing tag from HTML markup string.
// Given `<span class="System Message">anything</span>`, returns { open, close }.
function extractTagWrap(markup: string): { open: string; close: string } | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(markup, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) {
    const el = walker.currentNode as Element
    if (el.getAttribute('class') || el.getAttribute('style')) {
      const tag = el.tagName.toLowerCase()
      const attrs = Array.from(el.attributes)
        .map((a) => `${a.name}="${a.value}"`)
        .join(' ')
      return { open: `<${tag} ${attrs}>`, close: `</${tag}>` }
    }
  }
  return null
}

// Paste Style: read clipboard, extract the wrapping tag(s),
// and apply them around the current selection.
async function pasteStyle(view: EditorView): Promise<boolean> {
  try {
    const clipText = await navigator.clipboard.readText()

    // First try: treat the clipboard plain text itself as HTML markup
    // (covers copying `<span class="X">text</span>` from the editor)
    const tagMatch = clipText.match(/^<[a-z][^>]*(?:class|style)=[^>]*>/i)
    let wrap: { open: string; close: string } | null = null

    if (tagMatch) {
      wrap = extractTagWrap(clipText)
    }

    // Fallback: check the text/html clipboard representation
    if (!wrap) {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html')
          const html = await blob.text()
          wrap = extractTagWrap(html)
          break
        }
      }
    }

    if (!wrap) return false

    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)

    // If pasting a <span> wrap and the selection already contains span(s),
    // replace their opening tags rather than nesting an outer wrapper.
    const isSpanWrap = /^<span\b/i.test(wrap.open)
    const hasExistingSpan = /<span\s+(?:class|style)="[^"]*">/i.test(selected)
    const wrapped =
      isSpanWrap && hasExistingSpan
        ? selected.replace(/<span\s+(?:class|style)="[^"]*">/g, wrap.open)
        : `${wrap.open}${selected}${wrap.close}`

    view.dispatch({
      changes: { from, to, insert: wrapped },
      selection: { anchor: from + wrapped.length },
    })
    return true
  } catch {
    return false
  }
}

// Emoji autocomplete source. Triggers when the cursor is immediately after
// `:word` — selecting an option replaces the entire `:word` with the emoji
// character. Typing just `:` alone won't open the menu; the user must type at
// least one character so shortcodes like `http://` don't flicker the picker.
function emojiCompletion(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/:\w+/)
  if (!match) return null
  const query = match.text.slice(1)
  const results = searchEmojis(query, 50)
  if (!results.length) return null
  return {
    from: match.from,
    to: match.to,
    options: results.map(({ entry, score }) => ({
      label: `:${entry.n}:`,
      displayLabel: `${entry.c}  :${entry.n}:`,
      apply: entry.c,
      boost: score,
    })),
    validFor: /^:\w*$/,
  }
}

// Typewriter mode: scrolls cursor line to vertical center on every update
function typewriterScroll(): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet || update.docChanged) {
      const view = update.view
      const cursor = view.state.selection.main.head
      const coords = view.coordsAtPos(cursor)
      if (!coords) return
      const editorRect = view.dom.getBoundingClientRect()
      const centerY = editorRect.top + editorRect.height / 2
      const offset = coords.top - centerY
      if (Math.abs(offset) > 10) {
        view.scrollDOM.scrollBy({ top: offset, behavior: 'instant' })
      }
    }
  })
}

interface EditorProps {
  onWordCountChange?: (count: number) => void
  onVimModeChange?: (mode: VimMode) => void
  onEditorView?: (view: EditorView | null) => void
}

export default function Editor({ onWordCountChange, onVimModeChange, onEditorView }: EditorProps) {
  // Use selectors to avoid re-renders on unrelated store changes
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const activeDocVersion = useStoryletStore(
    (s) => s.book?.storylets.find((sl) => sl.id === s.activeStoryletId)?.docVersion ?? 0
  )
  const bookLoadNonce = useStoryletStore((s) => s.bookLoadNonce)
  const fontFamily = useEditorStore((s) => s.fontFamily)
  const fontSize = useEditorStore((s) => s.fontSize)
  const renderMode = useEditorStore((s) => s.renderMode)
  const documentStyles = useStoryletStore((s) => s.globalSettings.documentStyles)

  const distractionFree = useEditorStore((s) => s.distractionFree)
  const vimMode = useEditorStore((s) => s.vimMode)
  const locked = useIsFileLocked()

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Tracks which storylet (id + docVersion) is currently loaded into the EditorView.
  // docVersion lets external bulk mutations (e.g. Find-in-Book replace) force a reload
  // even when the active id is unchanged.
  const loadedDocumentRef = useRef<LoadedDoc | null>(null)
  const fontCompartmentRef = useRef<Compartment | null>(null)
  const fontSizeCompartmentRef = useRef<Compartment | null>(null)
  const typewriterCompartmentRef = useRef<Compartment | null>(null)
  const docStylesCompartmentRef = useRef<Compartment | null>(null)
  const lockCompartmentRef = useRef<Compartment | null>(null)
  const vimCompartmentRef = useRef<Compartment | null>(null)
  // Word count of the editor's document, kept current incrementally on every
  // doc change (only changed lines are re-counted). Drives WPM deltas.
  const wordCountRef = useRef<number>(0)

  // Stable callback refs
  const callbacksRef = useRef({ onWordCountChange, onVimModeChange, onEditorView })
  useEffect(() => {
    callbacksRef.current = { onWordCountChange, onVimModeChange, onEditorView }
  })

  // Create editor on mount — compartments are instance-scoped via refs
  useEffect(() => {
    if (!containerRef.current) return

    // Clear container in case of StrictMode double-mount
    containerRef.current.innerHTML = ''

    const fontComp = new Compartment()
    const fontSizeComp = new Compartment()
    const typewriterComp = new Compartment()
    const docStylesComp = new Compartment()
    const lockComp = new Compartment()
    const vimComp = new Compartment()
    fontCompartmentRef.current = fontComp
    fontSizeCompartmentRef.current = fontSizeComp
    typewriterCompartmentRef.current = typewriterComp
    docStylesCompartmentRef.current = docStylesComp
    lockCompartmentRef.current = lockComp
    vimCompartmentRef.current = vimComp

    const updateContent = useStoryletStore.getState().updateStoryletContent

    const state = EditorState.create({
      doc: '',
      extensions: [
        // vim() must come first so its keymap precedes defaultKeymap. Compartmented
        // so the toggleVim action can swap it in/out without rebuilding the view.
        vimComp.of(useEditorStore.getState().vimMode ? vim() : []),
        drawSelection(),
        kjExitInsertMode(),
        editorHistory(),
        keymap.of([
          { key: 'Ctrl-Shift-v', run: (view) => { void pasteStyle(view); return true }, preventDefault: true },
          { key: 'Meta-Shift-v', run: (view) => { void pasteStyle(view); return true }, preventDefault: true },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        autocompletion({
          override: [emojiCompletion],
          icons: false,
          activateOnTyping: true,
        }),
        markdown(),
        oneDark,
        renderModeField,
        markdownDecorationPlugin,
        atomicCursorSnap,
        statMarkerExtension(),
        statRefExtension(),
        noteMarkerExtension(),
        statblockMarkerExtension(),
        placeholder('Start writing...'),
        fontComp.of(makeFontTheme(useEditorStore.getState().fontFamily)),
        fontSizeComp.of(makeFontSizeTheme(useEditorStore.getState().fontSize)),
        typewriterComp.of(useEditorStore.getState().distractionFree ? typewriterScroll() : []),
        docStylesComp.of(makeDocStylesTheme(useStoryletStore.getState().globalSettings.documentStyles)),
        lockComp.of(makeLockExt(isFileLockedNow())),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: 'transparent' },
          '.cm-scroller': { overflow: 'auto', padding: '2rem', lineHeight: '1.75' },
          '.cm-content': { maxWidth: '800px', margin: '0 auto', caretColor: 'var(--color-opal-100, #6ee7b7)' },
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
        // Rich paste: convert HTML from clipboard to Markdown
        EditorView.domEventHandlers({
          paste(event, view) {
            const html = event.clipboardData?.getData('text/html')
            if (!html) return false // fall through to default plain text paste
            event.preventDefault()
            const { markdown: md, styles, pastedBodyFont } = htmlToMarkdownWithStyles(html)
            const { from, to } = view.state.selection.main

            // Check for font conflict between pasted content and existing document styles
            const existingFont = useStoryletStore.getState().globalSettings.documentStyles?.body?.fontFamily
            if (pastedBodyFont && existingFont) {
              const existingNorm = existingFont.replace(/['"]/g, '').toLowerCase()
              const pastedNorm = pastedBodyFont.toLowerCase()
              if (existingNorm !== pastedNorm) {
                const update = window.confirm(
                  `The pasted text uses "${pastedBodyFont}" but the document font is "${existingFont}".\n\n` +
                  `OK = Update document font to "${pastedBodyFont}"\n` +
                  `Cancel = Keep current font (pasted text will be wrapped in font spans)`
                )
                if (update) {
                  // Update document body font, paste as-is
                  view.dispatch({
                    changes: { from, to, insert: md },
                    selection: { anchor: from + md.length },
                    userEvent: 'input.paste',
                  })
                  if (styles) {
                    const existing = useStoryletStore.getState().globalSettings.documentStyles ?? {}
                    useStoryletStore.getState().updateGlobalSettings({ documentStyles: { ...existing, ...styles } })
                  }
                } else {
                  // Wrap each line in a font span for the pasted body font
                  const fontCss = `font-family: '${pastedBodyFont.replace(/'/g, '')}'`
                  const wrapped = md.split('\n').map((line) => {
                    if (!line.trim()) return line
                    // Don't double-wrap lines that already have font spans
                    if (/<span\s+style="font-family:/.test(line)) return line
                    // Keep alignment markers outside the span
                    const alignMatch = line.match(/^(\{align:(center|right|left)\}\s)(.*)$/)
                    if (alignMatch) {
                      return `${alignMatch[1]}<span style="${fontCss}">${alignMatch[3]}</span>`
                    }
                    return `<span style="${fontCss}">${line}</span>`
                  }).join('\n')
                  view.dispatch({
                    changes: { from, to, insert: wrapped },
                    selection: { anchor: from + wrapped.length },
                    userEvent: 'input.paste',
                  })
                }
                return true
              }
            }

            // No conflict — paste normally
            view.dispatch({
              changes: { from, to, insert: md },
              selection: { anchor: from + md.length },
              userEvent: 'input.paste',
            })
            if (styles) {
              const existing = useStoryletStore.getState().globalSettings.documentStyles ?? {}
              useStoryletStore.getState().updateGlobalSettings({ documentStyles: { ...existing, ...styles } })
            }
            return true
          },
        }),
        EditorView.updateListener.of((update) => {
          // Swapping in a storylet's text is not typing: don't save it back or
          // count it toward WPM.
          if (update.docChanged && !update.transactions.some(isProgrammaticLoad)) {
            const text = update.state.doc.toString()
            const delta = wordCountDelta(update.changes, update.startState.doc, update.state.doc)
            const newCount = wordCountRef.current + delta
            wordCountRef.current = newCount
            // Undo/redo, snapshot restores and marker insertion change the text
            // but aren't writing: save them, but keep them out of WPM, metrics
            // and quest progress.
            const countAsWriting = isWritingUpdate(update.transactions)
            // WPM ring-buffer sampling — hot path, must be cheap.
            if (countAsWriting && delta > 0) {
              useMetricsStore.getState().recordWpmSample(delta, Date.now())
            }
            // Defer React state updates out of CM6's synchronous update cycle
            // to prevent React re-renders from interfering with CM6 DOM updates
            // Tag the text with the storylet it was typed in, captured now —
            // the active storylet may change before the microtask runs.
            const storyletId = loadedDocumentRef.current?.id
            queueMicrotask(() => {
              callbacksRef.current.onWordCountChange?.(newCount)
              updateContent(text, storyletId, { countAsWriting })
            })
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            // setCursorOffset short-circuits if the value hasn't changed.
            useEditorStore.getState().setCursorOffset(head)
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    callbacksRef.current.onEditorView?.(view)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __editorView?: EditorView }).__editorView = view
    }

    // Load initial storylet content
    const store = useStoryletStore.getState()
    const activeStorylet = store.book?.storylets?.find((s) => s.id === store.activeStoryletId)
    if (activeStorylet) {
      loadedDocumentRef.current = {
        id: activeStorylet.id,
        version: activeStorylet.docVersion ?? 0,
        loadNonce: store.bookLoadNonce,
      }
    }
    if (activeStorylet?.content) {
      // Seed the word count so the first edit doesn't spike a huge delta
      wordCountRef.current = countWords(activeStorylet.content)
      loadContentIntoView(view, activeStorylet.content)
      callbacksRef.current.onWordCountChange?.(wordCountRef.current)
    }

    return () => {
      viewRef.current = null
      fontCompartmentRef.current = null
      fontSizeCompartmentRef.current = null
      typewriterCompartmentRef.current = null
      docStylesCompartmentRef.current = null
      lockCompartmentRef.current = null
      vimCompartmentRef.current = null
      callbacksRef.current.onEditorView?.(null)
      view.destroy()
    }
  }, [])

  // Toggle VIM extension. Reconfiguring the compartment teardowns the vim
  // StateField when disabled and re-mounts it (in NORMAL mode) when enabled.
  useEffect(() => {
    const view = viewRef.current
    const comp = vimCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({ effects: comp.reconfigure(vimMode ? vim() : []) })
    // When vim turns off, reset the displayed mode so a stale INSERT/VISUAL
    // label doesn't reappear if it's later re-enabled.
    if (!vimMode) {
      callbacksRef.current.onVimModeChange?.('NORMAL')
      return
    }
    // The vim adapter is recreated each time vim is enabled, so subscribe to
    // its mode-change signal here. Its initial 'normal' signal has already
    // fired, so report the current mode once up front.
    const cmVim = getVimCM(view)
    if (!cmVim) return
    const vimState = cmVim.state.vim
    callbacksRef.current.onVimModeChange?.(
      vimState?.insertMode
        ? cmVim.state.overwrite ? 'REPLACE' : 'INSERT'
        : vimState?.visualMode ? 'VISUAL' : 'NORMAL'
    )
    const onModeChange = (e: { mode: string }) => {
      callbacksRef.current.onVimModeChange?.(vimModeLabel(e.mode))
    }
    cmVim.on('vim-mode-change', onModeChange)
    return () => cmVim.off('vim-mode-change', onModeChange)
  }, [vimMode])

  // Load storylet content when active storylet changes
  const loadStorylet = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const store = useStoryletStore.getState()
    const activeStorylet = store.book?.storylets?.find((s) => s.id === store.activeStoryletId)
    if (!activeStorylet) return
    if (!needsEditorReload(loadedDocumentRef.current, activeStorylet, store.bookLoadNonce)) return

    loadedDocumentRef.current = {
      id: activeStorylet.id,
      version: activeStorylet.docVersion ?? 0,
      loadNonce: store.bookLoadNonce,
    }
    const content = activeStorylet.content ?? ''
    loadContentIntoView(view, content)
    // Reset the WPM baseline so switching to a longer storylet isn't counted as typing.
    wordCountRef.current = countWords(content)
    callbacksRef.current.onWordCountChange?.(wordCountRef.current)
  }, [])

  useEffect(() => {
    loadStorylet()
    const view = viewRef.current
    if (view) {
      dispatchStatblockActiveStorylet(view, activeStoryletId ?? '')
      const slState = useStoryletStore.getState()
      dispatchStatRefStoryletContext(view, {
        book: slState.book ?? null,
        storyletId: activeStoryletId ?? null,
        documentStyles: slState.globalSettings.documentStyles,
        snippets: slState.globalSettings.snippets,
      })
    }
  }, [activeStoryletId, activeDocVersion, bookLoadNonce, loadStorylet])

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

  // Update document styles (body theme + refresh decorations for named/heading styles)
  useEffect(() => {
    const view = viewRef.current
    const comp = docStylesCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({
      effects: [
        comp.reconfigure(makeDocStylesTheme(documentStyles)),
        docStylesChangedEffect.of(null),
      ],
    })
  }, [documentStyles])

  // Sync render mode into CM6 state
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setRenderModeEffect.of(renderMode) })
  }, [renderMode])

  // Sync character store → CM6 snapshot so stat-marker dots refresh on store
  // changes. Dispatches once on mount + any time `characters` or `markers`
  // reference-changes in the Zustand store.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const initial = useCharacterStore.getState()
    dispatchCharacterSnapshot(view, {
      characters: initial.characters,
      markers: initial.markers,
    })
    const unsubscribe = useCharacterStore.subscribe((state, prev) => {
      if (
        state.characters === prev.characters &&
        state.markers === prev.markers
      ) {
        return
      }
      const v = viewRef.current
      if (!v) return
      dispatchCharacterSnapshot(v, {
        characters: state.characters,
        markers: state.markers,
      })
    })
    // Same idea for the stat-ref widget: re-resolve `{HP}` tokens whenever
    // the storylet store mutates (book reference change or active storylet
    // change). Reference equality is fine — Zustand updates produce new
    // references on relevant writes.
    const unsubStorylet = useStoryletStore.subscribe((state, prev) => {
      if (
        state.book === prev.book &&
        state.activeStoryletId === prev.activeStoryletId &&
        state.globalSettings.documentStyles === prev.globalSettings.documentStyles &&
        state.globalSettings.snippets === prev.globalSettings.snippets
      ) {
        return
      }
      const v = viewRef.current
      if (!v) return
      dispatchStatRefStoryletContext(v, {
        book: state.book ?? null,
        storyletId: state.activeStoryletId ?? null,
        documentStyles: state.globalSettings.documentStyles,
        snippets: state.globalSettings.snippets,
      })
    })
    // Dev-only: expose the stores on window for poking at state from the
    // browser console.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __characterStore?: typeof useCharacterStore }).__characterStore =
        useCharacterStore
      ;(window as unknown as { __storyletStore?: typeof useStoryletStore }).__storyletStore =
        useStoryletStore
      ;(window as unknown as { __notesStore?: typeof useNotesStore }).__notesStore =
        useNotesStore
    }
    return () => {
      unsubscribe()
      unsubStorylet()
    }
  }, [])

  // Sync notes store → CM6 snapshot so note-marker squares refresh on store
  // changes. Dispatches once on mount + any time `positionNotes` reference-
  // changes in the Zustand store. Mirrors the character snapshot pattern.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const initial = useNotesStore.getState()
    dispatchNotesSnapshot(view, { positionNotes: initial.positionNotes })
    const unsubscribe = useNotesStore.subscribe((state, prev) => {
      if (state.positionNotes === prev.positionNotes) return
      const v = viewRef.current
      if (!v) return
      dispatchNotesSnapshot(v, { positionNotes: state.positionNotes })
    })
    return unsubscribe
  }, [])

  // Toggle typewriter mode
  useEffect(() => {
    const view = viewRef.current
    const comp = typewriterCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({ effects: comp.reconfigure(distractionFree ? typewriterScroll() : []) })
    // Toggle CSS class for line fading
    view.dom.classList.toggle('typewriter-mode', distractionFree)
  }, [distractionFree])

  // Apply/clear read-only lock when file connection changes
  useEffect(() => {
    const view = viewRef.current
    const comp = lockCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({ effects: comp.reconfigure(makeLockExt(locked)) })
    view.dom.classList.toggle('editor-locked', locked)
  }, [locked])

  const hasBook = useStoryletStore((s) => !!s.book)
  const hasStorylet = useStoryletStore((s) => !!s.activeStoryletId)

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-bg-default relative">
      <div ref={containerRef} className="h-full w-full" />
      {(!hasBook || !hasStorylet) && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Create a book or select a storylet to start writing.</p>
        </div>
      )}
    </div>
  )
}
