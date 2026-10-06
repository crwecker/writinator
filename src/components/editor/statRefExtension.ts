import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import {
  StateEffect,
  StateField,
  RangeSetBuilder,
  type Extension,
} from '@codemirror/state'
import type { Book, DocumentStyles, NamedStyle } from '../../types'
import {
  STAT_REF_REGEX,
  expandRefs,
  resolveRef,
  formatStatValueInline,
} from '../../lib/statRefs'
import { computeStateAt } from '../../lib/characterState'
import { characterSnapshotField } from './statMarkerExtension'
import { renderModeField, setRenderModeEffect } from './renderMode'

/**
 * Storylet context the stat-ref widget needs to call `computeStateAt`.
 * Held in its own StateField so the modal/editor wiring can dispatch updates
 * independently of the character snapshot (which is updated by the store
 * subscription) and the book/storylet (driven by the storylet store).
 */
interface StoryletContext {
  book: Book | null
  storyletId: string | null
  documentStyles: DocumentStyles | undefined
  snippets: Record<string, string> | undefined
}

const EMPTY: StoryletContext = {
  book: null,
  storyletId: null,
  documentStyles: undefined,
  snippets: undefined,
}

export const setStatRefStoryletContextEffect = StateEffect.define<StoryletContext>()

const storyletContextField = StateField.define<StoryletContext>({
  create: () => EMPTY,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setStatRefStoryletContextEffect)) return e.value
    }
    return value
  },
})

export function dispatchStatRefStoryletContext(
  view: EditorView,
  ctx: StoryletContext,
): void {
  view.dispatch({ effects: setStatRefStoryletContextEffect.of(ctx) })
}

class StatRefWidget extends WidgetType {
  readonly text: string
  readonly raw: string
  readonly className: string
  readonly inlineStyle: string
  readonly documentStyles: DocumentStyles | undefined
  constructor(
    text: string,
    raw: string,
    className: string,
    inlineStyle: string,
    documentStyles: DocumentStyles | undefined,
  ) {
    super()
    this.text = text
    this.raw = raw
    this.className = className
    this.inlineStyle = inlineStyle
    this.documentStyles = documentStyles
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof StatRefWidget &&
      other.text === this.text &&
      other.raw === this.raw &&
      other.className === this.className &&
      other.inlineStyle === this.inlineStyle &&
      other.documentStyles === this.documentStyles
    )
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = this.className
    if (this.inlineStyle) span.setAttribute('style', this.inlineStyle)
    span.setAttribute('title', this.raw)
    // The expanded text may contain author-typed HTML (snippets), so parse +
    // sanitize into real DOM nodes. The simpler `<br/>` list rendering falls
    // out of the same path because <br> is in the allowlist.
    if (/<[a-z]/i.test(this.text) || this.text.includes('<br')) {
      const children = buildSnippetDom(this.text, this.documentStyles)
      for (const child of children) span.appendChild(child)
    } else {
      span.textContent = this.text
    }
    return span
  }
  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Inline HTML allowed inside snippet templates. Block-level tags would break
 * CodeMirror's per-line layout, and external/script-y tags are simply unsafe
 * even though authoring is single-user.
 */
const SNIPPET_ALLOWED_TAGS = new Set([
  'SPAN', 'B', 'I', 'EM', 'STRONG', 'U', 'S', 'SMALL', 'SUP', 'SUB', 'CODE', 'BR',
])

const UNSAFE_STYLE_RE = /javascript:|expression\(|behavior\s*:|@import|url\s*\(/i

/**
 * Parse a snippet-expanded HTML string into sanitized DOM nodes for the
 * widget. Resolves `<span class="X">` against `documentStyles` so author
 * named styles work inside snippets the same way they do in document prose.
 */
function buildSnippetDom(
  html: string,
  documentStyles: DocumentStyles | undefined,
): Node[] {
  const resolved = documentStyles
    ? html.replace(
        /<span\s+class="([^"]+)"\s*>/g,
        (match, cls: string) => {
          const named = documentStyles[cls]
          if (!named) return match
          const css = namedStyleToCss(named)
          return css ? `<span style="${css}">` : match
        },
      )
    : html
  const tpl = document.createElement('template')
  tpl.innerHTML = resolved
  return Array.from(tpl.content.childNodes).map(sanitizeSnippetNode)
}

function sanitizeSnippetNode(n: Node): Node {
  if (n.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(n.textContent ?? '')
  }
  if (n.nodeType !== Node.ELEMENT_NODE) {
    return document.createTextNode('')
  }
  const el = n as HTMLElement
  if (!SNIPPET_ALLOWED_TAGS.has(el.tagName)) {
    return document.createTextNode(el.textContent ?? '')
  }
  const out = document.createElement(el.tagName.toLowerCase())
  if (el.tagName === 'SPAN') {
    const style = el.getAttribute('style')
    if (style && !UNSAFE_STYLE_RE.test(style)) out.setAttribute('style', style)
  }
  for (const child of Array.from(el.childNodes)) {
    out.appendChild(sanitizeSnippetNode(child))
  }
  return out
}

/**
 * Build a CSS string for a NamedStyle, matching the same property set the
 * markdown decoration plugin uses so widgets visually agree with the
 * surrounding prose.
 */
function namedStyleToCss(style: NamedStyle): string {
  const parts: string[] = []
  if (style.fontFamily) parts.push(`font-family: ${style.fontFamily}`)
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}px`)
  if (style.lineHeight) parts.push(`line-height: ${style.lineHeight}`)
  if (style.color) parts.push(`color: ${style.color}`)
  if (style.letterSpacing) parts.push(`letter-spacing: ${style.letterSpacing}`)
  if (style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`)
  if (style.fontStyle) parts.push(`font-style: ${style.fontStyle}`)
  if (style.textDecoration) parts.push(`text-decoration: ${style.textDecoration}`)
  if (style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`)
  return parts.length === 0 ? '' : parts.join('; ') + ';'
}

/**
 * Find the innermost `<span style="...">` / `<span class="...">` pair that
 * encloses `offset` on a single `line` and return its resolved CSS, or '' if
 * the offset is not inside any span. CodeMirror renders inline replacement
 * widgets as siblings of surrounding mark spans, so widgets that should look
 * like prose must carry the enclosing style as an inline attribute.
 */
function findEnclosingSpanCss(
  line: string,
  offset: number,
  documentStyles: DocumentStyles | undefined,
): string {
  const tagRe = /<span\s+(style|class)="([^"]*)">|<\/span>/g
  type Open = { start: number; end: number; kind: 'style' | 'class'; value: string }
  const stack: Open[] = []
  let match: RegExpExecArray | null
  let best: Open | null = null
  while ((match = tagRe.exec(line)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (match[1]) {
      stack.push({ start, end, kind: match[1] as 'style' | 'class', value: match[2] })
    } else {
      const open = stack.pop()
      if (open && offset >= open.end && offset <= start) {
        // Innermost wins — last close that still contains offset becomes best.
        best = open
      }
    }
  }
  if (!best) return ''
  if (best.kind === 'style') return best.value
  const named = documentStyles?.[best.value]
  return named ? namedStyleToCss(named) : ''
}

function buildDecorations(view: EditorView): DecorationSet {
  const mode = view.state.field(renderModeField)
  // source mode: leave every `{HP}` token visible as raw text. No widgets.
  if (mode === 'source') return Decoration.none

  const snapshot = view.state.field(characterSnapshotField)
  const ctx = view.state.field(storyletContextField)
  if (!ctx.book || !ctx.storyletId) return Decoration.none
  if (snapshot.characters.length === 0 && !ctx.snippets) return Decoration.none

  // In `rendered` mode we reveal raw source on the cursor's line so the author
  // can edit refs in place. `preview` and `clean` never reveal.
  // `clean` mode renders the value with no chrome (no blue underline).
  const cursorLine =
    mode === 'rendered' ? view.state.doc.lineAt(view.state.selection.main.head) : null
  const className = mode === 'clean' ? 'cm-stat-ref-plain' : 'cm-stat-ref'

  const formatStat = (
    hit: import('../../lib/statRefs').StatRefHit,
    offset: number,
  ): string | null => {
    if (!ctx.book || !ctx.storyletId) return null
    const computed = computeStateAt(hit.character, ctx.book, snapshot.markers, {
      storyletId: ctx.storyletId,
      offset,
    })
    const value = computed.effective[hit.def.id]
    if (!value) return null
    return formatStatValueInline(value, hit.subkey)
  }

  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    const re = new RegExp(STAT_REF_REGEX.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const start = from + m.index
      const end = start + m[0].length
      if (cursorLine && start >= cursorLine.from && start <= cursorLine.to) continue
      const hit = resolveRef(m[1], snapshot.characters, ctx.snippets)
      if (!hit) continue
      let formatted: string
      if (hit.kind === 'snippet') {
        // Snippet — expand recursively. Stat refs inside the snippet use the
        // CURRENT token's document offset so they see exactly the same earlier
        // markers the author would see if they typed the snippet's text here.
        formatted = expandRefs(hit.template, {
          characters: snapshot.characters,
          snippets: ctx.snippets,
          formatStat: (innerHit) => formatStat(innerHit, start),
        })
      } else if (hit.kind === 'characterProperty') {
        formatted = hit.character.name
      } else {
        const f = formatStat(hit.hit, start)
        formatted = f ?? ''
      }
      if (!formatted) continue
      // Only `clean` mode strips chrome and tries to blend in with surrounding
      // prose. The mark span that styles the prose is rendered as a SIBLING of
      // the widget by CodeMirror (atomic ranges break out of mark decorations),
      // so we copy its CSS onto the widget DOM directly.
      let inlineStyle = ''
      if (mode === 'clean') {
        const line = view.state.doc.lineAt(start)
        const lineText = view.state.doc.sliceString(line.from, line.to)
        inlineStyle = findEnclosingSpanCss(lineText, start - line.from, ctx.documentStyles)
      }
      builder.add(
        start,
        end,
        Decoration.replace({
          widget: new StatRefWidget(formatted, m[0], className, inlineStyle, ctx.documentStyles),
        }),
      )
    }
  }
  return builder.finish()
}

const statRefViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate): void {
      const snapshotChanged =
        update.startState.field(characterSnapshotField) !==
        update.state.field(characterSnapshotField)
      const ctxChanged =
        update.startState.field(storyletContextField) !==
        update.state.field(storyletContextField)
      const renderModeChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setRenderModeEffect)),
      )
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        snapshotChanged ||
        ctxChanged ||
        renderModeChanged
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
      ),
  },
)

const statRefBaseTheme = EditorView.baseTheme({
  '.cm-stat-ref': {
    display: 'inline',
    color: '#60a5fa',
    fontVariantNumeric: 'tabular-nums',
    padding: '0 1px',
    borderBottom: '1px dotted rgba(96, 165, 250, 0.5)',
  },
  '.cm-stat-ref-plain': {
    display: 'inline',
    fontVariantNumeric: 'tabular-nums',
  },
})

export function statRefExtension(): Extension {
  return [storyletContextField, statRefViewPlugin, statRefBaseTheme]
}
