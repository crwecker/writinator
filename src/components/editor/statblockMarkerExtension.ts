import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
  type EditorState,
} from '@codemirror/state'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { STATBLOCK_MARKER_REGEX } from '../../lib/markerUtils'
import StatBlockWidget from '../characters/StatBlockWidget'
import { useDocumentStore } from '../../stores/documentStore'

function parseOptionsRaw(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      out[trimmed] = ''
    } else {
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (key) out[key] = value
    }
  }
  return out
}

function parseFields(options: Record<string, string>): string[] | undefined {
  const raw = options.fields
  if (!raw) return undefined
  return raw
    .split('|')
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
}

class StatBlockWidgetType extends WidgetType {
  readonly characterId: string
  readonly fields: string[] | undefined
  readonly offsetInDocument: number
  readonly documentId: string

  private root: Root | null = null

  constructor(
    characterId: string,
    fields: string[] | undefined,
    offsetInDocument: number,
    documentId: string
  ) {
    super()
    this.characterId = characterId
    this.fields = fields
    this.offsetInDocument = offsetInDocument
    this.documentId = documentId
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof StatBlockWidgetType)) return false
    const a = this.fields
    const b = other.fields
    const fieldsEq =
      a === b ||
      (Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((v, i) => v === b[i]))
    return (
      fieldsEq &&
      other.characterId === this.characterId &&
      other.offsetInDocument === this.offsetInDocument &&
      other.documentId === this.documentId
    )
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-statblock-widget'
    container.setAttribute('data-statblock-character-id', this.characterId)
    container.contentEditable = 'false'
    const root = createRoot(container)
    root.render(
      createElement(StatBlockWidget, {
        characterId: this.characterId,
        fields: this.fields,
        documentId: this.documentId,
        offsetInDocument: this.offsetInDocument,
      })
    )
    this.root = root
    return container
  }

  destroy(): void {
    if (this.root) {
      const root = this.root
      this.root = null
      queueMicrotask(() => root.unmount())
    }
  }

  ignoreEvent(): boolean {
    return false
  }

  get estimatedHeight(): number {
    return 140
  }
}

/** Notifies the plugin that activeDocumentId changed (so widgets can rebind). */
export const setStatblockActiveDocumentEffect = StateEffect.define<string>()

const activeDocumentField = StateField.define<string>({
  create: () => useDocumentStore.getState().activeDocumentId ?? '',
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setStatblockActiveDocumentEffect)) return e.value
    }
    return value
  },
})

export function dispatchStatblockActiveDocument(
  view: EditorView,
  documentId: string
): void {
  view.dispatch({
    effects: setStatblockActiveDocumentEffect.of(documentId),
  })
}

function buildDecorations(state: EditorState): DecorationSet {
  const documentId = state.field(activeDocumentField, false) ?? ''
  const fullText = state.doc.toString()
  const re = new RegExp(STATBLOCK_MARKER_REGEX.source, 'g')
  const matches: Array<{
    start: number
    end: number
    characterId: string
    fields: string[] | undefined
  }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(fullText)) !== null) {
    const start = m.index
    const end = start + m[0].length
    const characterId = m[1]
    const options = parseOptionsRaw(m[2])
    const fields = parseFields(options)
    matches.push({ start, end, characterId, fields })
  }
  matches.sort((a, b) => a.start - b.start)
  const builder = new RangeSetBuilder<Decoration>()
  for (const mm of matches) {
    builder.add(
      mm.start,
      mm.end,
      Decoration.replace({
        widget: new StatBlockWidgetType(
          mm.characterId,
          mm.fields,
          mm.start,
          documentId
        ),
        block: true,
        side: 1,
      })
    )
  }
  return builder.finish()
}

const statblockDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state)
  },
  update(value, tr) {
    const docIdChanged = tr.effects.some((e) =>
      e.is(setStatblockActiveDocumentEffect)
    )
    if (tr.docChanged || docIdChanged) {
      return buildDecorations(tr.state)
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

const statblockBaseTheme = EditorView.baseTheme({
  '.cm-statblock-widget': {
    display: 'block',
    maxWidth: '800px',
    margin: '0.5rem auto',
  },
})

export function statblockMarkerExtension(): Extension {
  return [activeDocumentField, statblockDecorationField, statblockBaseTheme]
}
