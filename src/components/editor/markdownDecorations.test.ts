import { describe, expect, it } from 'vitest'
import { EditorState, type Text } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { buildMarkdownDecorations, findGroups } from './markdownDecorations'
import { renderModeField, setRenderModeEffect, type RenderMode } from './renderMode'

function makeState(doc: string, mode: RenderMode = 'rendered', cursor = 0): EditorState {
  const state = EditorState.create({ doc, extensions: [renderModeField], selection: { anchor: cursor } })
  return state.update({ effects: setRenderModeEffect.of(mode) }).state
}

function describeSet(set: DecorationSet): string[] {
  const out: string[] = []
  set.between(0, Number.MAX_SAFE_INTEGER, (from, to, deco) => {
    out.push(`${from}-${to} ${JSON.stringify(deco.spec)}`)
  })
  return out
}

/** The original whole-document group pass, kept as a reference. */
function referenceGroupRoles(doc: Text): (string | null)[] {
  const roles: (string | null)[] = new Array(doc.lines + 1).fill(null)
  const openRe = /^\{group(?::(center|right|left))?\}\s*$/
  const closeRe = /^\{\/group\}\s*$/
  let inGroup = false
  let align: string | null = null
  for (let i = 1; i <= doc.lines; i++) {
    const t = doc.line(i).text
    if (!inGroup) {
      const m = t.match(openRe)
      if (m) {
        inGroup = true
        align = m[1] ?? null
        roles[i] = `open:${align}`
      }
      continue
    }
    if (closeRe.test(t)) {
      roles[i] = `close:${align}`
      inGroup = false
      align = null
      continue
    }
    roles[i] = `inner:${align}`
  }
  return roles
}

function rolesFromGroups(doc: Text): (string | null)[] {
  const roles: (string | null)[] = new Array(doc.lines + 1).fill(null)
  for (const g of findGroups(doc)) {
    const openLine = doc.lineAt(g.openFrom).number
    const closeLine = g.closeFrom === null ? null : doc.lineAt(g.closeFrom).number
    roles[openLine] = `open:${g.align}`
    for (let i = openLine + 1; i <= (closeLine ?? doc.lines + 1) - 1; i++) roles[i] = `inner:${g.align}`
    if (closeLine !== null) roles[closeLine] = `close:${g.align}`
  }
  return roles
}

// Small deterministic PRNG so failures reproduce.
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const LINE_POOL = [
  '{group}', '{group:center}', '{group:right}', '{/group}', '{/group}  ', '{groupx}',
  '# Heading', '## Sub', 'plain words here', '**bold** and *it*', '~~gone~~ `code`',
  '{align:center} centered', '<span style="color: red">red <span class="Big">big</span></span>',
  '', '***both***',
]

function randomDoc(seed: number, lines: number): string {
  const r = rng(seed)
  return Array.from({ length: lines }, () => LINE_POOL[Math.floor(r() * LINE_POOL.length)]).join('\n')
}

describe('markdown decorations', () => {
  it('group roles match the original line-by-line pass (nested opens, stray closes, unclosed)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = makeState(randomDoc(seed, 120))
      expect(rolesFromGroups(state.doc)).toEqual(referenceGroupRoles(state.doc))
    }
  })

  it('decorating only a window gives exactly the full-document decorations for those lines', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const mode of ['source', 'rendered', 'preview'] as const) {
        const docText = randomDoc(seed, 200)
        const state = makeState(docText, mode, Math.floor(docText.length / 2))
        const full = buildMarkdownDecorations(state, [{ from: 0, to: state.doc.length }], undefined)
        // Two windows starting/ending mid-line, plus an overlapping one.
        const w1 = { from: state.doc.line(50).from + 2, to: state.doc.line(80).from + 1 }
        const w2 = { from: state.doc.line(80).from + 3, to: state.doc.line(120).to }
        const part = buildMarkdownDecorations(state, [w1, w2], undefined)
        const lo = state.doc.line(50).from
        const hi = state.doc.line(120).to
        const inWindow = (d: string) => {
          const [from, to] = d.split(' ')[0].split('-').map(Number)
          return from >= lo && to <= hi
        }
        expect(describeSet(part.decorations)).toEqual(describeSet(full.decorations).filter(inWindow))
        expect(describeSet(part.atomicRanges)).toEqual(describeSet(full.atomicRanges).filter(inWindow))
      }
    }
  })

  it('lines outside the visible ranges are not decorated', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `**line ${i}**`)
    const state = makeState(lines.join('\n'), 'source')
    const window = { from: state.doc.line(500).from, to: state.doc.line(510).to }
    const result = buildMarkdownDecorations(state, [window], undefined)
    const decos = describeSet(result.decorations)
    expect(decos).toHaveLength(11)
  })

  it('an inner line in the window inherits alignment from a group opened above it', () => {
    const lines = ['{group:center}', ...Array.from({ length: 300 }, (_, i) => `inner ${i}`), '{/group}', 'after']
    const state = makeState(lines.join('\n'), 'source')
    const target = state.doc.line(250)
    const result = buildMarkdownDecorations(state, [{ from: target.from, to: target.to }], undefined)
    const decos = describeSet(result.decorations)
    expect(decos).toEqual([
      `${target.from}-${target.from} {"class":"cm-group-inner"}`,
      `${target.from}-${target.from} {"attributes":{"style":"text-align: center;"}}`,
    ])
  })
})
