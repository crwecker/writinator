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
import { useStoryletStore } from '../../stores/storyletStore'

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
  readonly offsetInStorylet: number
  readonly storyletId: string

  private root: Root | null = null

  constructor(
    characterId: string,
    fields: string[] | undefined,
    offsetInStorylet: number,
    storyletId: string
  ) {
    super()
    this.characterId = characterId
    this.fields = fields
    this.offsetInStorylet = offsetInStorylet
    this.storyletId = storyletId
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
      other.offsetInStorylet === this.offsetInStorylet &&
      other.storyletId === this.storyletId
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
        storyletId: this.storyletId,
        offsetInStorylet: this.offsetInStorylet,
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

/** Notifies the plugin that activeStoryletId changed (so widgets can rebind). */
export const setStatblockActiveStoryletEffect = StateEffect.define<string>()

const activeStoryletField = StateField.define<string>({
  create: () => useStoryletStore.getState().activeStoryletId ?? '',
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setStatblockActiveStoryletEffect)) return e.value
    }
    return value
  },
})

export function dispatchStatblockActiveStorylet(
  view: EditorView,
  storyletId: string
): void {
  view.dispatch({
    effects: setStatblockActiveStoryletEffect.of(storyletId),
  })
}

function buildDecorations(state: EditorState): DecorationSet {
  const storyletId = state.field(activeStoryletField, false) ?? ''
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
          storyletId
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
      e.is(setStatblockActiveStoryletEffect)
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
  return [activeStoryletField, statblockDecorationField, statblockBaseTheme]
}
