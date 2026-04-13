import { useEffect, useState, useCallback, useRef } from 'react'
import type { EditorView } from '@codemirror/view'
import { useDocumentStore } from '../../stores/documentStore'
import { useCharacterStore } from '../../stores/characterStore'
import type { NamedStyle } from '../../types'
import { DEFAULT_STYLE_NAMES } from '../../types'

interface BubbleToolbarProps {
  editorView: EditorView | null
  onInsertMarker?: (markerId: string) => void
  onEditStyles?: () => void
}

function insertStatMarkerAtSelection(
  view: EditorView,
  onInsert: (markerId: string) => void
) {
  const { to } = view.state.selection.main
  const markerId = crypto.randomUUID()
  const insert = `<!-- stat:${markerId} -->`
  view.dispatch({ changes: { from: to, to: to, insert } })
  onInsert(markerId)
}

/**
 * Insert a statblock marker on its own line at the end of the current line,
 * bracketed by newlines so block widgets render cleanly.
 */
function insertStatblockMarkerInline(
  view: EditorView,
  characterId: string,
  fields: string[] | undefined
) {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const insertAt = line.to
  const fieldsSuffix =
    fields && fields.length > 0 ? `:fields=${fields.join(',')}` : ''
  const marker = `<!-- statblock:${characterId}${fieldsSuffix} -->`
  // Ensure newlines bracket the marker so the block widget sits on its own line.
  const insert = `\n${marker}\n`
  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert },
    selection: { anchor: insertAt + insert.length },
  })
  view.focus()
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      title={title}
      className="rounded px-2 py-1 text-sm font-medium transition-colors text-gray-300 hover:bg-gray-700 hover:text-gray-100"
    >
      {children}
    </button>
  )
}

const FONT_FAMILIES: Record<string, string> = {
  serif: "'Lora', serif",
  sans: 'system-ui, -apple-system, sans-serif',
  mono: "'JetBrains Mono', monospace",
}

// All inline markers, longest first so matching prefers ** over *
const INLINE_MARKERS = ['**', '~~', '`', '*']

/**
 * Scan outward from a selection through other inline formatting markers
 * to find if a specific marker already wraps the selection.
 * E.g. for selection "text" in `~~**text**~~`, searching for ** finds it
 * even though ~~ sits between the selection and the ** markers.
 */
function findSurroundingMarker(
  view: EditorView, from: number, to: number, marker: string
): { openFrom: number; openTo: number; closeFrom: number; closeTo: number } | null {
  const line = view.state.doc.lineAt(from)
  if (view.state.doc.lineAt(to).number !== line.number) return null

  const lineText = line.text
  const relFrom = from - line.from
  const relTo = to - line.from
  const otherMarkers = INLINE_MARKERS.filter((m) => m !== marker)

  // Scan backward from selection start, skipping through other markers
  let backPos = relFrom
  for (let i = 0; i < 3 && backPos > 0; i++) {
    let skipped = false
    for (const m of otherMarkers) {
      if (backPos >= m.length && lineText.substring(backPos - m.length, backPos) === m) {
        // For single *, make sure it's not actually part of **
        if (m === '*' && backPos - m.length > 0 && lineText[backPos - m.length - 1] === '*') continue
        backPos -= m.length
        skipped = true
        break
      }
    }
    if (!skipped) break
  }

  // Check for our marker at the scanned position
  if (backPos < marker.length) return null
  if (lineText.substring(backPos - marker.length, backPos) !== marker) return null
  // For single *, verify it's not part of **
  if (marker === '*' && backPos - marker.length > 0 && lineText[backPos - marker.length - 1] === '*') return null

  const openFrom = line.from + backPos - marker.length
  const openTo = line.from + backPos

  // Scan forward from selection end, skipping through other markers
  let fwdPos = relTo
  for (let i = 0; i < 3 && fwdPos < lineText.length; i++) {
    let skipped = false
    for (const m of otherMarkers) {
      if (fwdPos + m.length <= lineText.length && lineText.substring(fwdPos, fwdPos + m.length) === m) {
        if (m === '*' && fwdPos + m.length < lineText.length && lineText[fwdPos + m.length] === '*') continue
        fwdPos += m.length
        skipped = true
        break
      }
    }
    if (!skipped) break
  }

  if (fwdPos + marker.length > lineText.length) return null
  if (lineText.substring(fwdPos, fwdPos + marker.length) !== marker) return null
  if (marker === '*' && fwdPos + marker.length < lineText.length && lineText[fwdPos + marker.length] === '*') return null

  return {
    openFrom,
    openTo,
    closeFrom: line.from + fwdPos,
    closeTo: line.from + fwdPos + marker.length,
  }
}

function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main
  if (from === to) return
  const selected = view.state.sliceDoc(from, to)
  const lines = selected.split('\n')

  if (lines.length <= 1) {
    // Check if selected text itself is wrapped with these markers
    if (selected.length > before.length + after.length
      && selected.startsWith(before) && selected.endsWith(after)) {
      const inner = selected.slice(before.length, selected.length - after.length)
      // For single *, make sure we're not stripping one * from **
      const isFalseMatch = before === '*' && (inner.startsWith('*') || inner.endsWith('*'))
      if (!isFalseMatch) {
        view.dispatch({
          changes: { from, to, insert: inner },
          selection: { anchor: from, head: from + inner.length },
        })
        view.focus()
        return
      }
    }

    // Check for markers surrounding the selection (possibly through other nested markers)
    const outer = findSurroundingMarker(view, from, to, before)
    if (outer) {
      // Remove both opening and closing markers
      view.dispatch({
        changes: [
          { from: outer.openFrom, to: outer.openTo, insert: '' },
          { from: outer.closeFrom, to: outer.closeTo, insert: '' },
        ],
      })
    } else {
      // Apply formatting
      view.dispatch({
        changes: { from, to, insert: `${before}${selected}${after}` },
        selection: { anchor: from + before.length, head: to + before.length },
      })
    }
  } else {
    // Multi-line: check if ALL non-empty lines are wrapped
    const escBefore = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escAfter = after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wrapRe = new RegExp(`^${escBefore}(.*)${escAfter}$`)
    const allWrapped = lines.every((line) => !line.trim() || wrapRe.test(line))
    if (allWrapped) {
      const unwrapped = lines.map((line) => {
        const m = line.match(wrapRe)
        return m ? m[1] : line
      }).join('\n')
      view.dispatch({
        changes: { from, to, insert: unwrapped },
        selection: { anchor: from, head: from + unwrapped.length },
      })
    } else {
      const wrapped = lines.map((line) =>
        line.trim() ? `${before}${line}${after}` : line
      ).join('\n')
      view.dispatch({
        changes: { from, to, insert: wrapped },
        selection: { anchor: from, head: from + wrapped.length },
      })
    }
  }
  view.focus()
}

function parseStyleString(style: string): Record<string, string> {
  return Object.fromEntries(
    style.split(';').filter(Boolean).map((s) => {
      const [k, ...v] = s.split(':')
      return [k.trim(), v.join(':').trim()]
    })
  )
}

function mergeStyles(existing: string, incoming: string): string {
  const merged = { ...parseStyleString(existing), ...parseStyleString(incoming) }
  return Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join('; ')
}

function wrapLineWithSpanStyle(line: string, style: string): string {
  // If already wrapped in a span, merge styles
  const spanMatch = line.match(/^<span\s+style="([^"]*)">(.*)<\/span>$/)
  if (spanMatch) {
    return `<span style="${mergeStyles(spanMatch[1], style)}">${spanMatch[2]}</span>`
  }
  return `<span style="${style}">${line}</span>`
}

// Find innermost span pair (style attr only) in `lineText` that fully contains
// the selection range [selStart, selEnd] (line-relative). Returns null if none.
function findEnclosingStyleSpan(
  lineText: string,
  selStart: number,
  selEnd: number
): { start: number; openEnd: number; closeStart: number; closeEnd: number; style: string } | null {
  const tagRegex = /<span\s+style="([^"]*)">|<\/span>/g
  type Open = { start: number; openEnd: number; style: string }
  const stack: Open[] = []
  const pairs: Array<{ start: number; openEnd: number; closeStart: number; closeEnd: number; style: string }> = []
  let m: RegExpExecArray | null
  while ((m = tagRegex.exec(lineText)) !== null) {
    if (m[1] !== undefined) {
      stack.push({ start: m.index, openEnd: m.index + m[0].length, style: m[1] })
    } else {
      const o = stack.pop()
      if (o) {
        pairs.push({
          start: o.start,
          openEnd: o.openEnd,
          closeStart: m.index,
          closeEnd: m.index + m[0].length,
          style: o.style,
        })
      }
    }
  }
  // pairs are in innermost-first order (close tags complete from the inside out)
  return pairs.find((p) => selStart >= p.openEnd && selEnd <= p.closeStart) ?? null
}

function wrapWithSpanStyle(view: EditorView, style: string) {
  const { from, to } = view.state.selection.main
  if (from === to) return
  const doc = view.state.doc
  const startLine = doc.lineAt(from)
  const endLine = doc.lineAt(to)

  // Single-line: check if selection is inside an existing span and merge instead of nest
  if (startLine.number === endLine.number) {
    const lineText = startLine.text
    const selStart = from - startLine.from
    const selEnd = to - startLine.from
    const enclosing = findEnclosingStyleSpan(lineText, selStart, selEnd)
    if (enclosing) {
      const mergedStyle = mergeStyles(enclosing.style, style)
      const inner = lineText.slice(enclosing.openEnd, enclosing.closeStart)
      const prefix = inner.slice(0, selStart - enclosing.openEnd)
      const selected = inner.slice(selStart - enclosing.openEnd, selEnd - enclosing.openEnd)
      const suffix = inner.slice(selEnd - enclosing.openEnd)

      if (prefix === '' && suffix === '') {
        // Selection covers entire span content: replace only the opening tag's style
        const newOpen = `<span style="${mergedStyle}">`
        view.dispatch({
          changes: {
            from: startLine.from + enclosing.start,
            to: startLine.from + enclosing.openEnd,
            insert: newOpen,
          },
          selection: {
            anchor: startLine.from + enclosing.start + newOpen.length,
            head: startLine.from + enclosing.start + newOpen.length + selected.length,
          },
        })
      } else {
        // Split: prefix keeps original style, selection gets merged, suffix keeps original
        const parts: string[] = []
        if (prefix) parts.push(`<span style="${enclosing.style}">${prefix}</span>`)
        const selectedSpan = `<span style="${mergedStyle}">${selected}</span>`
        const selSpanStartOffset = parts.reduce((n, p) => n + p.length, 0) + `<span style="${mergedStyle}">`.length
        parts.push(selectedSpan)
        if (suffix) parts.push(`<span style="${enclosing.style}">${suffix}</span>`)
        const replacement = parts.join('')
        const replStart = startLine.from + enclosing.start
        view.dispatch({
          changes: {
            from: replStart,
            to: startLine.from + enclosing.closeEnd,
            insert: replacement,
          },
          selection: {
            anchor: replStart + selSpanStartOffset,
            head: replStart + selSpanStartOffset + selected.length,
          },
        })
      }
      view.focus()
      return
    }
  }

  const selected = view.state.sliceDoc(from, to)
  const lines = selected.split('\n')
  const wrapped = lines.map((line) =>
    line.trim() ? wrapLineWithSpanStyle(line, style) : line
  ).join('\n')
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: from, head: from + wrapped.length },
  })
  view.focus()
}

function setAlignment(view: EditorView, alignment: 'left' | 'center' | 'right') {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: { from: number; to: number; insert: string }[] = []

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = view.state.doc.line(i)
    if (!line.text.trim()) continue
    const existingAlign = line.text.match(/^\{align:(center|right|left)\}\s?/)
    const removeEnd = existingAlign ? line.from + existingAlign[0].length : line.from
    const prefix = alignment === 'left' ? '' : `{align:${alignment}} `
    changes.push({ from: line.from, to: removeEnd, insert: prefix })
  }

  if (changes.length > 0) {
    view.dispatch({ changes })
  }
  view.focus()
}

function prependLineWith(view: EditorView, prefix: string) {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const text = line.text

  // Strip alignment prefix to find the content portion
  const alignMatch = text.match(/^(\{align:(?:center|right|left)\}\s?)/)
  const alignPrefix = alignMatch ? alignMatch[1] : ''
  const contentStart = line.from + alignPrefix.length
  const content = text.slice(alignPrefix.length)

  // Toggle: if content already starts with this prefix, remove it
  if (content.startsWith(prefix)) {
    view.dispatch({
      changes: { from: contentStart, to: contentStart + prefix.length },
    })
  } else {
    // Remove any existing heading prefix first
    const existingHeading = content.match(/^#{1,3}\s/)
    if (existingHeading) {
      view.dispatch({
        changes: {
          from: contentStart,
          to: contentStart + existingHeading[0].length,
          insert: prefix,
        },
      })
    } else {
      view.dispatch({
        changes: { from: contentStart, to: contentStart, insert: prefix },
      })
    }
  }
  view.focus()
}

function toggleBlockPrefix(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: { from: number; to: number; insert: string }[] = []

  // Check if all non-empty lines already have the prefix
  let allPrefixed = true
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = view.state.doc.line(i)
    if (line.text.trim() && !line.text.startsWith(prefix)) {
      allPrefixed = false
      break
    }
  }

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = view.state.doc.line(i)
    if (!line.text.trim()) continue
    if (allPrefixed) {
      // Remove prefix
      if (line.text.startsWith(prefix)) {
        changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
      }
    } else {
      // Add prefix (only if not already there)
      if (!line.text.startsWith(prefix)) {
        changes.push({ from: line.from, to: line.from, insert: prefix })
      }
    }
  }

  if (changes.length > 0) view.dispatch({ changes })
  view.focus()
}

function toggleCodeBlock(view: EditorView) {
  const { from, to } = view.state.selection.main
  if (from === to) return
  const selected = view.state.sliceDoc(from, to)

  // Check if selection is already a code block (wrapped in ```)
  const codeBlockMatch = selected.match(/^```\n?([\s\S]*?)\n?```$/)
  if (codeBlockMatch) {
    // Unwrap
    const inner = codeBlockMatch[1]
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    })
  } else {
    const wrapped = `\`\`\`\n${selected}\n\`\`\``
    view.dispatch({
      changes: { from, to, insert: wrapped },
      selection: { anchor: from, head: from + wrapped.length },
    })
  }
  view.focus()
}

function stripBlockPrefixes(view: EditorView) {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: { from: number; to: number; insert: string }[] = []

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = view.state.doc.line(i)
    if (!line.text.trim()) continue
    // Strip heading prefix
    const headingMatch = line.text.match(/^#{1,3}\s/)
    if (headingMatch) {
      changes.push({ from: line.from, to: line.from + headingMatch[0].length, insert: '' })
    }
    // Strip blockquote prefix
    const bqMatch = line.text.match(/^>\s?/)
    if (bqMatch) {
      changes.push({ from: line.from, to: line.from + bqMatch[0].length, insert: '' })
    }
  }

  if (changes.length > 0) view.dispatch({ changes })
  view.focus()
}

function styleToCSS(style: NamedStyle): string {
  const parts: string[] = []
  if (style.fontFamily) parts.push(`font-family: ${style.fontFamily}`)
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}px`)
  if (style.lineHeight) parts.push(`line-height: ${style.lineHeight}`)
  if (style.color) parts.push(`color: ${style.color}`)
  if (style.letterSpacing) parts.push(`letter-spacing: ${style.letterSpacing}`)
  if ('fontWeight' in style && style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`)
  if ('fontStyle' in style && style.fontStyle) parts.push(`font-style: ${style.fontStyle}`)
  if ('textDecoration' in style && style.textDecoration) parts.push(`text-decoration: ${style.textDecoration}`)
  if ('backgroundColor' in style && style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`)
  return parts.join('; ')
}

function wrapLineWithSpanClass(line: string, className: string): string | null {
  const classSpanMatch = line.match(/^<span\s+class="([^"]*)">(.*)<\/span>$/)
  if (classSpanMatch) {
    if (classSpanMatch[1] === className) {
      // Same class — unwrap
      return classSpanMatch[2]
    }
    // Different class — replace
    return `<span class="${className}">${classSpanMatch[2]}</span>`
  }
  return `<span class="${className}">${line}</span>`
}

function wrapWithSpanClass(view: EditorView, className: string) {
  const { from, to } = view.state.selection.main
  if (from === to) return
  const selected = view.state.sliceDoc(from, to)
  const lines = selected.split('\n')
  const wrapped = lines.map((line) =>
    line.trim() ? (wrapLineWithSpanClass(line, className) ?? line) : line
  ).join('\n')
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: from, head: from + wrapped.length },
  })
  view.focus()
}

export default function BubbleToolbar({ editorView, onInsertMarker, onEditStyles }: BubbleToolbarProps) {
  const documentStyles = useDocumentStore((s) => s.globalSettings.documentStyles)
  const namedStyles: Record<string, NamedStyle> | undefined = documentStyles
    ? Object.fromEntries(
        Object.entries(documentStyles).filter(
          ([k]) => !(DEFAULT_STYLE_NAMES as readonly string[]).includes(k)
        )
      )
    : undefined
  const characters = useCharacterStore((s) => s.characters)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [statblockPickerOpen, setStatblockPickerOpen] = useState(false)
  const [pickerCharacterId, setPickerCharacterId] = useState<string>('')
  const [pickerFields, setPickerFields] = useState<string>('')
  const pickerRef = useRef<HTMLDivElement | null>(null)

  const updatePosition = useCallback(() => {
    if (!editorView) {
      setPosition(null)
      return
    }

    const { from, to } = editorView.state.selection.main
    if (from === to) {
      setPosition(null)
      return
    }

    const start = editorView.coordsAtPos(from)
    const end = editorView.coordsAtPos(to)
    if (!start || !end) {
      setPosition(null)
      return
    }

    const toolbarWidth = 420 // approximate toolbar width
    const newTop = Math.max(4, start.top - 44)
    const rawLeft = (start.left + end.left) / 2
    // Clamp so toolbar stays on screen (half toolbar width as margin from edges)
    const newLeft = Math.max(toolbarWidth / 2 + 8, Math.min(rawLeft, window.innerWidth - toolbarWidth / 2 - 8))
    setPosition((prev) => {
      if (prev && Math.abs(prev.top - newTop) < 1 && Math.abs(prev.left - newLeft) < 1) return prev
      return { top: newTop, left: newLeft }
    })
  }, [editorView])

  useEffect(() => {
    if (!editorView) return

    const handler = () => {
      // Use requestAnimationFrame to ensure coords are available after selection update
      requestAnimationFrame(updatePosition)
    }

    // Listen for selection changes via DOM events
    editorView.contentDOM.addEventListener('mouseup', handler)
    editorView.contentDOM.addEventListener('keyup', handler)

    return () => {
      editorView.contentDOM.removeEventListener('mouseup', handler)
      editorView.contentDOM.removeEventListener('keyup', handler)
    }
  }, [editorView, updatePosition])

  // Also poll on a fast interval to catch vim visual mode selections
  useEffect(() => {
    if (!editorView) return
    const interval = setInterval(updatePosition, 200)
    return () => clearInterval(interval)
  }, [editorView, updatePosition])

  if (!position || !editorView) return null

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-gray-700 bg-gray-900 px-1 py-1 shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <ToolbarButton
        onClick={() => wrapSelection(editorView, '**', '**')}
        title="Bold"
      >
        <strong>B</strong>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => wrapSelection(editorView, '*', '*')}
        title="Italic"
      >
        <em>I</em>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => wrapSelection(editorView, '~~', '~~')}
        title="Strikethrough"
      >
        <s>S</s>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => wrapSelection(editorView, '`', '`')}
        title="Inline code"
      >
        <span className="font-mono text-xs">&lt;/&gt;</span>
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-gray-700" />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => setAlignment(editorView, 'left')}
        title="Align left"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h18"/></svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setAlignment(editorView, 'center')}
        title="Align center"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12M3 18h18"/></svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setAlignment(editorView, 'right')}
        title="Align right"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M9 12h12M3 18h18"/></svg>
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-gray-700" />

      {/* Font family */}
      <select
        value=""
        onChange={(e) => {
          if (!e.target.value) return
          const css = FONT_FAMILIES[e.target.value]
          if (css) wrapWithSpanStyle(editorView, `font-family: ${css}`)
          e.target.value = ''
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-transparent text-gray-300 hover:text-gray-100 text-xs outline-none cursor-pointer px-1 py-1"
      >
        <option value="" disabled>Font</option>
        <option value="serif">Serif</option>
        <option value="sans">Sans</option>
        <option value="mono">Mono</option>
      </select>

      {/* Font size */}
      <select
        value=""
        onChange={(e) => {
          if (!e.target.value) return
          wrapWithSpanStyle(editorView, `font-size: ${e.target.value}px`)
          e.target.value = ''
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-transparent text-gray-300 hover:text-gray-100 text-xs outline-none cursor-pointer px-1 py-1"
      >
        <option value="" disabled>Size</option>
        {[12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
          <option key={s} value={s}>{s}px</option>
        ))}
      </select>

      {/* Color picker */}
      <label
        title="Text color"
        onMouseDown={(e) => e.preventDefault()}
        className="relative flex flex-col items-center justify-center cursor-pointer rounded px-1.5 py-1 text-gray-300 hover:bg-gray-700 hover:text-gray-100"
      >
        <span className="text-sm font-semibold leading-none">A</span>
        <span className="mt-0.5 block h-0.5 w-3.5 rounded-sm bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500" />
        <input
          type="color"
          onChange={(e) => {
            wrapWithSpanStyle(editorView, `color: ${e.target.value}`)
            editorView.focus()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      {/* Styles dropdown — default document styles + named styles */}
      {(() => {
        const defaultStyles: { key: string; label: string; style: NamedStyle | undefined }[] = [
          { key: 'body', label: 'Body', style: documentStyles?.body },
          { key: 'h1', label: 'Heading 1', style: documentStyles?.h1 },
          { key: 'h2', label: 'Heading 2', style: documentStyles?.h2 },
          { key: 'h3', label: 'Heading 3', style: documentStyles?.h3 },
          { key: 'blockquote', label: 'Blockquote', style: documentStyles?.blockquote },
          { key: 'code', label: 'Code', style: documentStyles?.code },
        ]
        const hasNamed = namedStyles && Object.keys(namedStyles).length > 0
        return (
          <>
            <div className="mx-1 h-5 w-px bg-gray-700" />
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                const val = e.target.value
                if (val === '__edit__') {
                  onEditStyles?.()
                } else if (val.startsWith('named:')) {
                  wrapWithSpanClass(editorView, val.slice(6))
                } else if (val === 'blockquote') {
                  toggleBlockPrefix(editorView, '> ')
                } else if (val === 'code') {
                  toggleCodeBlock(editorView)
                } else if (val === 'h1') {
                  prependLineWith(editorView, '# ')
                } else if (val === 'h2') {
                  prependLineWith(editorView, '## ')
                } else if (val === 'h3') {
                  prependLineWith(editorView, '### ')
                } else if (val === 'body') {
                  // Remove heading/blockquote prefixes to reset to body
                  stripBlockPrefixes(editorView)
                } else {
                  const found = defaultStyles.find((d) => d.key === val)
                  if (found?.style) {
                    const css = styleToCSS(found.style)
                    if (css) wrapWithSpanStyle(editorView, css)
                  }
                }
                e.target.value = ''
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="bg-transparent text-gray-300 hover:text-gray-100 text-xs outline-none cursor-pointer px-1 py-1"
            >
              <option value="" disabled>Style</option>
              {defaultStyles.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
              {hasNamed && (
                <option disabled>───</option>
              )}
              {hasNamed && Object.keys(namedStyles!).map((name) => (
                <option key={name} value={`named:${name}`}>{name}</option>
              ))}
              {onEditStyles && <option disabled>───</option>}
              {onEditStyles && <option value="__edit__">Edit Styles…</option>}
            </select>
          </>
        )
      })()}

      {onInsertMarker && (
        <>
          <div className="mx-1 h-5 w-px bg-gray-700" />
          <button
            data-testid="bubble-stat-change"
            onMouseDown={(e) => {
              e.preventDefault()
              insertStatMarkerAtSelection(editorView, onInsertMarker)
            }}
            title="Insert stat change marker after selection"
            className="rounded px-2 py-1 text-xs font-medium transition-colors text-gray-300 hover:bg-gray-700 hover:text-gray-100"
          >
            Stat Change
          </button>
          <button
            data-testid="bubble-statblock-insert"
            onMouseDown={(e) => {
              e.preventDefault()
              setPickerCharacterId((prev) => prev || characters[0]?.id || '')
              setStatblockPickerOpen((v) => !v)
            }}
            title="Insert status block"
            className="rounded px-2 py-1 text-xs font-medium transition-colors text-gray-300 hover:bg-gray-700 hover:text-gray-100"
          >
            Status Block
          </button>
        </>
      )}

      {statblockPickerOpen && (
        <div
          ref={pickerRef}
          data-testid="bubble-statblock-picker"
          className="absolute top-full right-0 mt-1 w-72 rounded-md border border-gray-700 bg-gray-900 p-3 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {characters.length === 0 ? (
            <div className="text-xs text-gray-400">
              No characters yet. Open the Characters panel to create one.
            </div>
          ) : (
            <>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-400">
                Character
              </label>
              <select
                data-testid="bubble-statblock-picker-character"
                value={pickerCharacterId}
                onChange={(e) => setPickerCharacterId(e.target.value)}
                className="mb-2 w-full rounded bg-gray-800 px-2 py-1 text-sm text-gray-100 outline-none"
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-400">
                Fields (optional, comma-separated)
              </label>
              <input
                data-testid="bubble-statblock-picker-fields"
                type="text"
                value={pickerFields}
                placeholder="hp,mp,level"
                onChange={(e) => setPickerFields(e.target.value)}
                className="mb-3 w-full rounded bg-gray-800 px-2 py-1 text-sm text-gray-100 outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setStatblockPickerOpen(false)
                  }}
                  className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  data-testid="bubble-statblock-picker-confirm"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (!pickerCharacterId) return
                    const fields = pickerFields
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                    insertStatblockMarkerInline(
                      editorView,
                      pickerCharacterId,
                      fields.length > 0 ? fields : undefined
                    )
                    setStatblockPickerOpen(false)
                    setPickerFields('')
                  }}
                  className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
                >
                  Insert
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
