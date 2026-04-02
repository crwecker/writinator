import { useEffect, useState, useCallback } from 'react'
import type { EditorView } from '@codemirror/view'
import { useDocumentStore } from '../../stores/documentStore'

interface BubbleToolbarProps {
  editorView: EditorView | null
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

function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main
  if (from === to) return
  const selected = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length, head: to + before.length },
  })
  view.focus()
}

function wrapWithSpanStyle(view: EditorView, style: string) {
  const { from, to } = view.state.selection.main
  if (from === to) return
  const selected = view.state.sliceDoc(from, to)

  // If already wrapped in a span, merge styles
  const spanMatch = selected.match(/^<span\s+style="([^"]*)">(.*)<\/span>$/)
  if (spanMatch) {
    const existingStyles = spanMatch[1]
    // Parse existing and new styles, new wins on conflicts
    const existing = Object.fromEntries(
      existingStyles.split(';').filter(Boolean).map((s) => {
        const [k, ...v] = s.split(':')
        return [k.trim(), v.join(':').trim()]
      })
    )
    const incoming = Object.fromEntries(
      style.split(';').filter(Boolean).map((s) => {
        const [k, ...v] = s.split(':')
        return [k.trim(), v.join(':').trim()]
      })
    )
    const merged = { ...existing, ...incoming }
    const mergedStyle = Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join('; ')
    const inner = spanMatch[2]
    const replacement = `<span style="${mergedStyle}">${inner}</span>`
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from, head: from + replacement.length },
    })
  } else {
    const before = `<span style="${style}">`
    const after = '</span>'
    view.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: { anchor: from + before.length, head: to + before.length },
    })
  }
  view.focus()
}

function prependLineWith(view: EditorView, prefix: string) {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const text = line.text

  // Toggle: if line already starts with this prefix, remove it
  if (text.startsWith(prefix)) {
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length },
    })
  } else {
    // Remove any existing heading prefix first
    const existingHeading = text.match(/^#{1,3}\s/)
    if (existingHeading) {
      view.dispatch({
        changes: {
          from: line.from,
          to: line.from + existingHeading[0].length,
          insert: prefix,
        },
      })
    } else {
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: prefix },
      })
    }
  }
  view.focus()
}

function wrapWithSpanClass(view: EditorView, className: string) {
  const { from, to } = view.state.selection.main
  if (from === to) return
  const selected = view.state.sliceDoc(from, to)

  // If already wrapped in a class span, replace the class
  const classSpanMatch = selected.match(/^<span\s+class="([^"]*)">(.*)<\/span>$/)
  if (classSpanMatch) {
    if (classSpanMatch[1] === className) {
      // Same class — unwrap (remove the span entirely)
      view.dispatch({
        changes: { from, to, insert: classSpanMatch[2] },
        selection: { anchor: from, head: from + classSpanMatch[2].length },
      })
    } else {
      // Different class — replace
      const replacement = `<span class="${className}">${classSpanMatch[2]}</span>`
      view.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from, head: from + replacement.length },
      })
    }
  } else {
    const before = `<span class="${className}">`
    const after = '</span>'
    view.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: { anchor: from + before.length, head: to + before.length },
    })
  }
  view.focus()
}

export default function BubbleToolbar({ editorView }: BubbleToolbarProps) {
  const namedStyles = useDocumentStore((s) => s.book?.documentStyles?.namedStyles)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

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

      <ToolbarButton
        onClick={() => prependLineWith(editorView, '# ')}
        title="Heading 1"
      >
        H1
      </ToolbarButton>

      <ToolbarButton
        onClick={() => prependLineWith(editorView, '## ')}
        title="Heading 2"
      >
        H2
      </ToolbarButton>

      <ToolbarButton
        onClick={() => prependLineWith(editorView, '### ')}
        title="Heading 3"
      >
        H3
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

      {/* Named styles */}
      {namedStyles && Object.keys(namedStyles).length > 0 && (
        <>
          <div className="mx-1 h-5 w-px bg-gray-700" />
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return
              wrapWithSpanClass(editorView, e.target.value)
              e.target.value = ''
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-transparent text-gray-300 hover:text-gray-100 text-xs outline-none cursor-pointer px-1 py-1"
          >
            <option value="" disabled>Style</option>
            {Object.keys(namedStyles).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}
