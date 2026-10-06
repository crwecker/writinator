import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { RangeSet, StateEffect, type EditorState, type Text } from '@codemirror/state'
import { useStoryletStore } from '../../stores/storyletStore'
import { namedStyleToCss } from '../../lib/styleCss'
import type { DocumentStyles } from '../../types'
import { renderModeField, setRenderModeEffect, shouldHideMarkdown } from './renderMode'

// Effect dispatched when documentStyles changes so the decoration plugin re-runs
export const docStylesChangedEffect = StateEffect.define<null>()

const GROUP_OPEN_RE = /^\{group(?::(center|right|left))?\}\s*$/
const GROUP_CLOSE_RE = /^\{\/group\}\s*$/

/** A `{group}` … `{/group}` block, by line start offsets. `closeFrom` is null
 *  when the group is never closed (it then runs to the end of the doc). */
export interface GroupSpan {
  openFrom: number
  closeFrom: number | null
  align: string | null
}

/**
 * Find every group in the document. Groups don't nest: inside a group a
 * `{group}` line is an ordinary inner line, and outside one a `{/group}` line
 * is ignored. That makes the state at any line depend on everything above it,
 * so this scans the whole doc — but cheaply: iterLines hands back the stored
 * line strings without copying, and only lines starting with `{` hit a regex.
 */
export function findGroups(doc: Text): GroupSpan[] {
  const groups: GroupSpan[] = []
  let current: GroupSpan | null = null
  let pos = 0
  for (const text of doc.iterLines()) {
    if (text.charCodeAt(0) === 123 /* { */) {
      if (!current) {
        const m = GROUP_OPEN_RE.exec(text)
        if (m) {
          current = { openFrom: pos, closeFrom: null, align: m[1] ?? null }
          groups.push(current)
        }
      } else if (GROUP_CLOSE_RE.test(text)) {
        current.closeFrom = pos
        current = null
      }
    }
    pos += text.length + 1
  }
  return groups
}

type GroupRole =
  | { kind: 'open' | 'close' | 'inner'; align: string | null }
  | null

/** Group role of the line starting at `lineFrom`. `hint` is the index to start
 *  searching from; lines are visited in increasing order, so it only advances. */
function groupRoleAt(
  groups: GroupSpan[],
  lineFrom: number,
  hint: { i: number },
): GroupRole {
  while (hint.i < groups.length) {
    const g = groups[hint.i]
    if (g.closeFrom !== null && g.closeFrom < lineFrom) {
      hint.i++
      continue
    }
    if (lineFrom < g.openFrom) return null
    if (lineFrom === g.openFrom) return { kind: 'open', align: g.align }
    if (lineFrom === g.closeFrom) return { kind: 'close', align: g.align }
    return { kind: 'inner', align: g.align }
  }
  return null
}

export interface MarkdownDecorationResult {
  decorations: DecorationSet
  atomicRanges: DecorationSet
}

/**
 * Build the markdown decorations for the lines touched by `ranges` (normally
 * `view.visibleRanges`). Only those lines are regex-scanned; the group pass is
 * the one whole-document step (see findGroups).
 */
export function buildMarkdownDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
  docStyles: DocumentStyles | undefined,
): MarkdownDecorationResult {
  const decorations: { from: number; to: number; deco: Decoration }[] = []
  const atomicEntries: { from: number; to: number; deco: Decoration }[] = []

  const pushReplace = (from: number, to: number) => {
    const deco = Decoration.replace({})
    decorations.push({ from, to, deco })
    atomicEntries.push({ from, to, deco })
  }
  const doc = state.doc
  const mode = state.field(renderModeField)
  const cursorLine = doc.lineAt(state.selection.main.head).number

  // Map lines to their group role so inner lines can inherit the group's
  // alignment and fence lines can be hidden/dimmed.
  const groups = findGroups(doc)
  const groupHint = { i: 0 }

  // Adjacent visible ranges can share a line; decorate each line once.
  let lastLine = 0
  for (const range of ranges) {
    const firstLine = Math.max(doc.lineAt(range.from).number, lastLine + 1)
    const endLine = doc.lineAt(range.to).number
    for (let i = firstLine; i <= endLine; i++) {
      decorateLine(i)
    }
    lastLine = Math.max(lastLine, endLine)
  }

  function decorateLine(i: number) {
    const line = doc.line(i)
    const text = line.text
    const isCursorLine = i === cursorLine
    const groupRole = groupRoleAt(groups, line.from, groupHint)

    // Group fence lines: collapse entire row when rendered, dim as chrome otherwise.
    if (groupRole && (groupRole.kind === 'open' || groupRole.kind === 'close')) {
      const fenceClass = shouldHideMarkdown(mode, isCursorLine)
        ? 'cm-group-fence-hidden'
        : 'cm-group-fence'
      decorations.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: fenceClass }),
      })
    }

    // Inner group lines: tight spacing + accent via class, plus alignment inheritance.
    if (groupRole && groupRole.kind === 'inner') {
      decorations.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: 'cm-group-inner' }),
      })
      if (groupRole.align && groupRole.align !== 'left') {
        decorations.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ attributes: { style: `text-align: ${groupRole.align};` } }),
        })
      }
    }

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
      if (shouldHideMarkdown(mode, isCursorLine)) {
        const prefixLen = headingMatch[0].length // e.g. "## " = 3
        pushReplace(line.from, line.from + prefixLen)
      }
    }

    // Bold+Italic: ***text*** (must come before bold to avoid partial matches)
    const boldItalicRegex = /\*\*\*(.+?)\*\*\*/g
    let match
    while ((match = boldItalicRegex.exec(text)) !== null) {
      const matchStart = line.from + match.index
      const matchEnd = matchStart + match[0].length
      if (shouldHideMarkdown(mode, isCursorLine)) {
        pushReplace(matchStart, matchStart + 3)
        decorations.push({
          from: matchStart + 3,
          to: matchEnd - 3,
          deco: Decoration.mark({ attributes: { style: 'font-weight: 700; font-style: italic;' } }),
        })
        pushReplace(matchEnd - 3, matchEnd)
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
      if (shouldHideMarkdown(mode, isCursorLine)) {
        // Replace opening **
        pushReplace(matchStart, matchStart + 2)
        // Mark inner content as bold
        decorations.push({
          from: matchStart + 2,
          to: matchEnd - 2,
          deco: Decoration.mark({ attributes: { style: 'font-weight: 700;' } }),
        })
        // Replace closing **
        pushReplace(matchEnd - 2, matchEnd)
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
      if (shouldHideMarkdown(mode, isCursorLine)) {
        pushReplace(matchStart, matchStart + 1)
        decorations.push({
          from: matchStart + 1,
          to: matchEnd - 1,
          deco: Decoration.mark({ attributes: { style: 'font-style: italic;' } }),
        })
        pushReplace(matchEnd - 1, matchEnd)
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
      if (shouldHideMarkdown(mode, isCursorLine)) {
        pushReplace(matchStart, matchStart + 2)
        decorations.push({
          from: matchStart + 2,
          to: matchEnd - 2,
          deco: Decoration.mark({ attributes: { style: 'text-decoration: line-through;' } }),
        })
        pushReplace(matchEnd - 2, matchEnd)
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
      if (shouldHideMarkdown(mode, isCursorLine)) {
        pushReplace(matchStart, matchStart + 1)
        decorations.push({
          from: matchStart + 1,
          to: matchEnd - 1,
          deco: Decoration.mark({ class: 'cm-md-code' }),
        })
        pushReplace(matchEnd - 1, matchEnd)
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
      if (shouldHideMarkdown(mode, isCursorLine)) {
        pushReplace(line.from, line.from + alignMatch[0].length)
      }
    }

    // Span tags (style/class) with proper nesting support.
    // Tokenize all <span ...> / </span> tags, pair them via a stack so that
    // nested spans get their own decorations and the innermost style wins.
    const spanTagRegex = /<span\s+(style|class)="([^"]*)">|<\/span>/g
    type SpanOpen = { start: number; openEnd: number; kind: 'style' | 'class'; value: string }
    const spanStack: SpanOpen[] = []
    const spanPairs: Array<{ open: SpanOpen; closeStart: number; closeEnd: number }> = []
    while ((match = spanTagRegex.exec(text)) !== null) {
      const tokenStart = match.index
      const tokenEnd = tokenStart + match[0].length
      if (match[1]) {
        spanStack.push({
          start: tokenStart,
          openEnd: tokenEnd,
          kind: match[1] as 'style' | 'class',
          value: match[2],
        })
      } else {
        const open = spanStack.pop()
        if (open) {
          spanPairs.push({ open, closeStart: tokenStart, closeEnd: tokenEnd })
        }
      }
    }

    // Process inner-most pairs last so their decorations sort after outer ones.
    // spanPairs from the stack-based scan already lists inner pairs before outer pairs.
    for (const { open, closeStart, closeEnd } of spanPairs) {
      const matchStart = line.from + open.start
      const openTagEnd = line.from + open.openEnd
      const closeTagStart = line.from + closeStart
      const matchEnd = line.from + closeEnd

      let cssString: string | null = null
      if (open.kind === 'style') {
        cssString = open.value
      } else {
        const namedStyle = docStyles?.[open.value]
        // Trailing `;` keeps an empty named style non-null (its tags still hide).
        if (namedStyle) cssString = namedStyleToCss(namedStyle) + ';'
      }
      if (cssString === null) continue

      // line-height on an inline span doesn't change the block line box for
      // soft-wrapped rows — promote it to a line-level decoration so wrapped
      // rows actually tighten/expand.
      const lineHeightMatch = cssString.match(/line-height:\s*([^;]+)/)
      if (lineHeightMatch) {
        decorations.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({
            attributes: { style: `line-height: ${lineHeightMatch[1].trim()};` },
          }),
        })
      }

      if (shouldHideMarkdown(mode, isCursorLine)) {
        pushReplace(matchStart, openTagEnd)
        decorations.push({
          from: openTagEnd,
          to: closeTagStart,
          deco: Decoration.mark({ attributes: { style: cssString } }),
        })
        pushReplace(closeTagStart, matchEnd)
      } else {
        decorations.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.mark({ attributes: { style: cssString } }),
        })
      }
    }
  }

  const cmp = (a: { from: number; to: number }, b: { from: number; to: number }) => a.from - b.from || a.to - b.to
  decorations.sort(cmp)
  atomicEntries.sort(cmp)
  return {
    decorations: Decoration.set(decorations.map((d) => d.deco.range(d.from, d.to))),
    atomicRanges: Decoration.set(atomicEntries.map((d) => d.deco.range(d.from, d.to)), true),
  }
}

function buildForView(view: EditorView): MarkdownDecorationResult {
  return buildMarkdownDecorations(
    view.state,
    view.visibleRanges,
    useStoryletStore.getState().globalSettings.documentStyles,
  )
}

export const markdownDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    atomicRanges: DecorationSet
    constructor(view: EditorView) {
      const result = buildForView(view)
      this.decorations = result.decorations
      this.atomicRanges = result.atomicRanges
    }
    update(update: ViewUpdate) {
      const renderModeChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setRenderModeEffect))
      )
      const stylesChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(docStylesChangedEffect))
      )
      let rebuild = update.docChanged || update.viewportChanged || renderModeChanged || stylesChanged
      if (!rebuild && update.view.state.field(renderModeField) === 'rendered' && update.selectionSet) {
        const oldLine = update.startState.doc.lineAt(update.startState.selection.main.head).number
        const newLine = update.state.doc.lineAt(update.state.selection.main.head).number
        rebuild = oldLine !== newLine
      }
      if (rebuild) {
        const result = buildForView(update.view)
        this.decorations = result.decorations
        this.atomicRanges = result.atomicRanges
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Respected natively by CM6 motion commands and INSERT-mode arrow keys.
    // NORMAL-mode VIM motions bypass this facet; atomicCursorSnap in Editor.tsx catches them.
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.atomicRanges ?? RangeSet.empty
      ),
  }
)
