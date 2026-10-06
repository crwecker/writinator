import { describe, expect, it } from 'vitest'
import { EditorState, type ChangeSpec } from '@codemirror/state'
import { countWords } from '../../lib/words'
import { wordCountDelta } from './wordCount'

function referenceCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const PIECES = ['word', 'two words', ' ', '\n', '\n\n', ' ', ' ', '﻿', '\t', 'x', 'émoji 😀', '  ']

function randomText(r: () => number, n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += PIECES[Math.floor(r() * PIECES.length)]
  return s
}

describe('word counting', () => {
  it('countWords matches trim/split on unusual whitespace', () => {
    const r = rng(7)
    for (let i = 0; i < 500; i++) {
      const text = randomText(r, Math.floor(r() * 30))
      expect(countWords(text)).toBe(referenceCount(text))
    }
    expect(countWords(null)).toBe(0)
    expect(countWords('')).toBe(0)
  })

  it('incremental delta always equals a full recount', () => {
    const r = rng(42)
    let state = EditorState.create({ doc: randomText(r, 200) })
    for (let step = 0; step < 400; step++) {
      const len = state.doc.length
      // 1–3 non-overlapping changes, often on the same line.
      const points = Array.from({ length: 1 + Math.floor(r() * 3) }, () => Math.floor(r() * (len + 1)))
        .sort((a, b) => a - b)
      const changes: ChangeSpec[] = []
      let prevEnd = -1
      for (const from of points) {
        if (from <= prevEnd) continue
        const to = Math.min(len, from + Math.floor(r() * 6))
        changes.push({ from, to, insert: r() < 0.7 ? randomText(r, Math.floor(r() * 3)) : '' })
        prevEnd = to
      }
      const tr = state.update({ changes })
      const before = countWords(state.doc.toString())
      const after = countWords(tr.state.doc.toString())
      expect(wordCountDelta(tr.changes, state.doc, tr.state.doc)).toBe(after - before)
      state = tr.state
    }
  })
})
