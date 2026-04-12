import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, placeholder, drawSelection, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { EditorState, Compartment, StateField, StateEffect, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { vim, getCM as getVimCM, Vim } from '@replit/codemirror-vim'
import { useDocumentStore } from '../../stores/documentStore'
import { useEditorStore } from '../../stores/editorStore'
import { htmlToMarkdownWithStyles } from '../../lib/richPaste'
import type { DocumentStyles } from '../../types'
import type { VimMode } from './VimStatusLine'
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

function countWords(text: string): number {
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

// StateEffect and StateField for render mode so the decoration plugin can read it synchronously
const setRenderModeEffect = StateEffect.define<'source' | 'rendered'>()
const renderModeField = StateField.define<'source' | 'rendered'>({
  create: () => useEditorStore.getState().renderMode,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setRenderModeEffect)) return e.value
    }
    return value
  },
})

// Markdown decoration plugin
function markdownDecorations(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = []
  const doc = view.state.doc
  const mode = view.state.field(renderModeField)
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
  const isRendered = mode === 'rendered'

  // Cache document styles for heading overrides
  const docStyles = useDocumentStore.getState().globalSettings.documentStyles

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const text = line.text
    const isCursorLine = i === cursorLine

    // Headings
    const headingMatch = text.match(/^(#{1,3})\s/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const defaultSizes = ['1.8em', '1.4em', '1.15em']
      const defaultWeights = ['700', '600', '600']
      const styleKey = `h${level}` as 'h1' | 'h2' | 'h3'
      const hs = docStyles?.[styleKey]

      const fontSize = hs?.fontSize ? `${hs.fontSize}px` : defaultSizes[level - 1]
      const fontWeight = hs?.fontWeight ?? defaultWeights[level - 1]
      const extras: string[] = []
      if (hs?.fontFamily) extras.push(`font-family: ${hs.fontFamily}`)
      if (hs?.color) extras.push(`color: ${hs.color}`)
      if (hs?.lineHeight) extras.push(`line-height: ${hs.lineHeight}`)

      const style = `font-size: ${fontSize}; font-weight: ${fontWeight}; line-height: 1.3;${extras.length ? ' ' + extras.join('; ') + ';' : ''}`

      decorations.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ attributes: { style } }),
      })

      // In rendered mode on non-cursor lines, hide the "# " prefix
      if (isRendered && !isCursorLine) {
        const prefixLen = headingMatch[0].length // e.g. "## " = 3
        decorations.push({
          from: line.from,
          to: line.from + prefixLen,
          deco: Decoration.replace({}),
        })
      }
    }

    // Bold+Italic: ***text*** (must come before bold to avoid partial matches)
    const boldItalicRegex = /\*\*\*(.+?)\*\*\*/g
    let match
    while ((match = boldItalicRegex.exec(text)) !== null) {
      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      if (isRendered && !isCursorLine) {
        decorations.push({
          from: matchStart,
          to: matchStart + 3,
          deco: Decoration.replace({}),
        })
        decorations.push({
          from: matchStart + 3,
          to: matchEnd - 3,
          deco: Decoration.mark({ attributes: { style: 'font-weight: 700; font-style: italic;' } }),
        })
        decorations.push({
          from: matchEnd - 3,
          to: matchEnd,
          deco: Decoration.replace({}),
        })
      } else {
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ attributes: { style: 'font-weight: 700; font-style: italic;' } }),
        })
      }
    }

    // Bold: **text** (exactly 2 asterisks, not 3+)
    const boldRegex = /(?<!\*)\*\*(?!\*)(.+?)(?<!\*)\*\*(?!\*)/g
    while ((match = boldRegex.exec(text)) !== null) {
      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      if (isRendered && !isCursorLine) {
        // Replace opening **
        decorations.push({
          from: matchStart,
          to: matchStart + 2,
          deco: Decoration.replace({}),
        })
        // Mark inner content as bold
        decorations.push({
          from: matchStart + 2,
          to: matchEnd - 2,
          deco: Decoration.mark({ attributes: { style: 'font-weight: 700;' } }),
        })
        // Replace closing **
        decorations.push({
          from: matchEnd - 2,
          to: matchEnd,
          deco: Decoration.replace({}),
        })
      } else {
        // Source mode: mark the whole match
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ attributes: { style: 'font-weight: 700;' } }),
        })
      }
    }

    // Italic: *text* (not **)
    const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g
    while ((match = italicRegex.exec(text)) !== null) {
      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      if (isRendered && !isCursorLine) {
        decorations.push({
          from: matchStart,
          to: matchStart + 1,
          deco: Decoration.replace({}),
        })
        decorations.push({
          from: matchStart + 1,
          to: matchEnd - 1,
          deco: Decoration.mark({ attributes: { style: 'font-style: italic;' } }),
        })
        decorations.push({
          from: matchEnd - 1,
          to: matchEnd,
          deco: Decoration.replace({}),
        })
      } else {
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ attributes: { style: 'font-style: italic;' } }),
        })
      }
    }

    // Strikethrough: ~~text~~
    const strikeRegex = /~~(.+?)~~/g
    while ((match = strikeRegex.exec(text)) !== null) {
      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      if (isRendered && !isCursorLine) {
        decorations.push({
          from: matchStart,
          to: matchStart + 2,
          deco: Decoration.replace({}),
        })
        decorations.push({
          from: matchStart + 2,
          to: matchEnd - 2,
          deco: Decoration.mark({ attributes: { style: 'text-decoration: line-through;' } }),
        })
        decorations.push({
          from: matchEnd - 2,
          to: matchEnd,
          deco: Decoration.replace({}),
        })
      } else {
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ attributes: { style: 'text-decoration: line-through;' } }),
        })
      }
    }

    // Inline code: `text`
    const codeRegex = /`([^`]+)`/g
    while ((match = codeRegex.exec(text)) !== null) {
      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      if (isRendered && !isCursorLine) {
        decorations.push({
          from: matchStart,
          to: matchStart + 1,
          deco: Decoration.replace({}),
        })
        decorations.push({
          from: matchStart + 1,
          to: matchEnd - 1,
          deco: Decoration.mark({ class: 'cm-md-code' }),
        })
        decorations.push({
          from: matchEnd - 1,
          to: matchEnd,
          deco: Decoration.replace({}),
        })
      } else {
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ class: 'cm-md-code' }),
        })
      }
    }

    // Alignment: {align:center} or {align:right} prefix
    const alignMatch = text.match(/^\{align:(center|right|left)\}\s?/)
    if (alignMatch) {
      const alignment = alignMatch[1]
      if (alignment !== 'left') {
        decorations.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ attributes: { style: `text-align: ${alignment};` } }),
        })
      }
      if (isRendered && !isCursorLine) {
        decorations.push({
          from: line.from,
          to: line.from + alignMatch[0].length,
          deco: Decoration.replace({}),
        })
      }
    }

    // Inline <span style="...">...</span> for font overrides
    const spanRegex = /<span\s+style="([^"]*)">(.*?)<\/span>/g
    while ((match = spanRegex.exec(text)) !== null) {
      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      // The opening tag: <span style="...">
      const openTag = match[0].indexOf('>') + 1 // length of opening tag
      const openTagEnd = matchStart + openTag
      // The closing tag: </span>
      const closeTagLen = '</span>'.length
      const closeTagStart = matchEnd - closeTagLen

      if (isRendered && !isCursorLine) {
        // Replace opening <span style="...">
        decorations.push({
          from: matchStart,
          to: openTagEnd,
          deco: Decoration.replace({}),
        })
        // Mark inner content with the inline style
        decorations.push({
          from: openTagEnd,
          to: closeTagStart,
          deco: Decoration.mark({ attributes: { style: match[1] } }),
        })
        // Replace closing </span>
        decorations.push({
          from: closeTagStart,
          to: matchEnd,
          deco: Decoration.replace({}),
        })
      } else {
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ attributes: { style: match[1] } }),
        })
      }
    }

    // Named style spans: <span class="styleName">text</span>
    const classSpanRegex = /<span\s+class="([^"]*)">(.*?)<\/span>/g
    while ((match = classSpanRegex.exec(text)) !== null) {
      const className = match[1]
      const namedStyle = docStyles?.namedStyles?.[className]
      if (!namedStyle) continue // unknown style, skip

      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      const openTag = match[0].indexOf('>') + 1
      const openTagEnd = matchStart + openTag
      const closeTagLen = '</span>'.length
      const closeTagStart = matchEnd - closeTagLen

      // Convert NamedStyle to CSS string
      const cssProps: string[] = []
      if (namedStyle.fontFamily) cssProps.push(`font-family: ${namedStyle.fontFamily}`)
      if (namedStyle.fontSize) cssProps.push(`font-size: ${namedStyle.fontSize}px`)
      if (namedStyle.lineHeight) cssProps.push(`line-height: ${namedStyle.lineHeight}`)
      if (namedStyle.color) cssProps.push(`color: ${namedStyle.color}`)
      if (namedStyle.letterSpacing) cssProps.push(`letter-spacing: ${namedStyle.letterSpacing}`)
      if (namedStyle.fontWeight) cssProps.push(`font-weight: ${namedStyle.fontWeight}`)
      if (namedStyle.fontStyle) cssProps.push(`font-style: ${namedStyle.fontStyle}`)
      if (namedStyle.textDecoration) cssProps.push(`text-decoration: ${namedStyle.textDecoration}`)
      if (namedStyle.backgroundColor) cssProps.push(`background-color: ${namedStyle.backgroundColor}`)
      const cssString = cssProps.join('; ') + ';'

      if (isRendered && !isCursorLine) {
        decorations.push({
          from: matchStart,
          to: openTagEnd,
          deco: Decoration.replace({}),
        })
        decorations.push({
          from: openTagEnd,
          to: closeTagStart,
          deco: Decoration.mark({ attributes: { style: cssString } }),
        })
        decorations.push({
          from: closeTagStart,
          to: matchEnd,
          deco: Decoration.replace({}),
        })
      } else {
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ attributes: { style: cssString } }),
        })
      }
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
      } else if (update.view.state.field(renderModeField) === 'rendered' && update.selectionSet) {
        const oldLine = update.startState.doc.lineAt(update.startState.selection.main.head).number
        const newLine = update.state.doc.lineAt(update.state.selection.main.head).number
        if (oldLine !== newLine) {
          this.decorations = markdownDecorations(update.view)
        }
      }
    }
  },
  { decorations: (v) => v.decorations }
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
          view.dispatch({ changes: { from: cursor - 1, to: cursor } })
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
    const wrapped = `${wrap.open}${selected}${wrap.close}`

    view.dispatch({
      changes: { from, to, insert: wrapped },
      selection: { anchor: from + wrapped.length },
    })
    return true
  } catch {
    return false
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
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)
  const fontFamily = useEditorStore((s) => s.fontFamily)
  const fontSize = useEditorStore((s) => s.fontSize)
  const renderMode = useEditorStore((s) => s.renderMode)

  const distractionFree = useEditorStore((s) => s.distractionFree)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const loadedDocumentRef = useRef<string | null>(null)
  const fontCompartmentRef = useRef<Compartment | null>(null)
  const fontSizeCompartmentRef = useRef<Compartment | null>(null)
  const typewriterCompartmentRef = useRef<Compartment | null>(null)
  const docStylesCompartmentRef = useRef<Compartment | null>(null)

  // Stable callback refs
  const callbacksRef = useRef({ onWordCountChange, onVimModeChange, onEditorView })
  useEffect(() => {
    callbacksRef.current = { onWordCountChange, onVimModeChange, onEditorView }
  })

  // VIM mode polling
  useEffect(() => {
    let lastMode: VimMode = 'NORMAL'
    const interval = setInterval(() => {
      const view = viewRef.current
      if (!view) return
      const cmVim = getVimCM(view)
      if (!cmVim) return
      const cmState = (cmVim as unknown as Record<string, unknown>).state as Record<string, unknown> | undefined
      const vimMode = cmState?.vim as Record<string, unknown> | undefined
      if (!vimMode) return

      let currentMode: VimMode = 'NORMAL'
      if (vimMode.mode === 'insert') currentMode = 'INSERT'
      else if (vimMode.mode === 'visual') currentMode = 'VISUAL'

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
    const typewriterComp = new Compartment()
    const docStylesComp = new Compartment()
    fontCompartmentRef.current = fontComp
    fontSizeCompartmentRef.current = fontSizeComp
    typewriterCompartmentRef.current = typewriterComp
    docStylesCompartmentRef.current = docStylesComp

    const updateContent = useDocumentStore.getState().updateDocumentContent

    const state = EditorState.create({
      doc: '',
      extensions: [
        vim(),
        drawSelection(),
        kjExitInsertMode(),
        history(),
        keymap.of([
          { key: 'Ctrl-Shift-v', run: (view) => { void pasteStyle(view); return true }, preventDefault: true },
          { key: 'Meta-Shift-v', run: (view) => { void pasteStyle(view); return true }, preventDefault: true },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown(),
        oneDark,
        renderModeField,
        markdownDecorationPlugin,
        placeholder('Start writing...'),
        fontComp.of(makeFontTheme(useEditorStore.getState().fontFamily)),
        fontSizeComp.of(makeFontSizeTheme(useEditorStore.getState().fontSize)),
        typewriterComp.of(useEditorStore.getState().distractionFree ? typewriterScroll() : []),
        docStylesComp.of(makeDocStylesTheme(undefined)),
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
            const existingFont = useDocumentStore.getState().globalSettings.documentStyles?.body?.fontFamily
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
                  })
                  if (styles) {
                    const existing = useDocumentStore.getState().globalSettings.documentStyles ?? {}
                    useDocumentStore.getState().updateGlobalSettings({ documentStyles: { ...existing, ...styles } })
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
                  })
                }
                return true
              }
            }

            // No conflict — paste normally
            view.dispatch({
              changes: { from, to, insert: md },
              selection: { anchor: from + md.length },
            })
            if (styles) {
              const existing = useDocumentStore.getState().globalSettings.documentStyles ?? {}
              useDocumentStore.getState().updateGlobalSettings({ documentStyles: { ...existing, ...styles } })
            }
            return true
          },
        }),
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

    // Load initial document content
    const store = useDocumentStore.getState()
    const activeDocument = store.book?.documents?.find((doc) => doc.id === store.activeDocumentId)
    if (activeDocument?.content) {
      view.dispatch({ changes: { from: 0, to: 0, insert: activeDocument.content } })
      callbacksRef.current.onWordCountChange?.(countWords(activeDocument.content))
      loadedDocumentRef.current = activeDocument.id
    } else if (activeDocument) {
      loadedDocumentRef.current = activeDocument.id
    }

    return () => {
      viewRef.current = null
      fontCompartmentRef.current = null
      fontSizeCompartmentRef.current = null
      typewriterCompartmentRef.current = null
      docStylesCompartmentRef.current = null
      callbacksRef.current.onEditorView?.(null)
      view.destroy()
    }
  }, [])

  // Load document content when active document changes
  const loadDocument = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const store = useDocumentStore.getState()
    const activeDocument = store.book?.documents?.find((doc) => doc.id === store.activeDocumentId)
    if (!activeDocument) return
    if (loadedDocumentRef.current === activeDocument.id) return

    loadedDocumentRef.current = activeDocument.id
    const content = activeDocument.content ?? ''
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    })
    callbacksRef.current.onWordCountChange?.(countWords(content))
  }, [])

  useEffect(() => {
    loadDocument()
  }, [activeDocumentId, loadDocument])

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

  // Sync render mode into CM6 state
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setRenderModeEffect.of(renderMode) })
  }, [renderMode])

  // Toggle typewriter mode
  useEffect(() => {
    const view = viewRef.current
    const comp = typewriterCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({ effects: comp.reconfigure(distractionFree ? typewriterScroll() : []) })
    // Toggle CSS class for line fading
    view.dom.classList.toggle('typewriter-mode', distractionFree)
  }, [distractionFree])

  const hasBook = useDocumentStore((s) => !!s.book)
  const hasDocument = useDocumentStore((s) => !!s.activeDocumentId)

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-bg-default relative">
      <div ref={containerRef} className="h-full w-full" />
      {(!hasBook || !hasDocument) && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Create a book or select a document to start writing.</p>
        </div>
      )}
    </div>
  )
}
