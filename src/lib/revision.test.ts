import { describe, expect, it } from 'vitest'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import { charsToWords, revisedCharsForTransactions } from './revision'

function tr(doc: string, spec: TransactionSpec) {
  return EditorState.create({ doc }).update(spec)
}

describe('revised words', () => {
  const doc = 'The old house stood alone.\n\nNew paragraph'

  it('counts typing inside an existing paragraph', () => {
    const t = tr(doc, { changes: { from: 4, insert: 'very ' }, userEvent: 'input.type' })
    expect(revisedCharsForTransactions([t])).toBe(5)
  })

  it('counts deleting inside an existing paragraph', () => {
    const t = tr(doc, { changes: { from: 4, to: 8 }, userEvent: 'delete.backward' })
    expect(revisedCharsForTransactions([t])).toBe(4)
  })

  it('counts a replaced selection as deleted plus inserted', () => {
    const t = tr(doc, { changes: { from: 4, to: 7, insert: 'new' }, userEvent: 'input.type' })
    expect(revisedCharsForTransactions([t])).toBe(6)
  })

  it('does not count new writing at the end of a paragraph', () => {
    const end = doc.indexOf('.') + 1
    const t = tr(doc, { changes: { from: end, insert: ' It was cold.' }, userEvent: 'input.type' })
    expect(revisedCharsForTransactions([t])).toBe(0)
  })

  it('does not count typing on a blank line', () => {
    const blank = doc.indexOf('\n') + 1
    const t = tr(doc, { changes: { from: blank, insert: 'Hello' }, userEvent: 'input.type' })
    expect(revisedCharsForTransactions([t])).toBe(0)
  })

  it('ignores pastes, undo and programmatic changes', () => {
    expect(revisedCharsForTransactions([tr(doc, { changes: { from: 4, insert: 'pasted ' }, userEvent: 'input.paste' })])).toBe(0)
    expect(revisedCharsForTransactions([tr(doc, { changes: { from: 4, insert: 'undone ' }, userEvent: 'undo' })])).toBe(0)
    expect(revisedCharsForTransactions([tr(doc, { changes: { from: 4, insert: 'code ' } })])).toBe(0)
  })

  it('turns characters into words, carrying the remainder', () => {
    expect(charsToWords(0, 13)).toEqual({ words: 2, carry: 1 })
    expect(charsToWords(1, 5)).toEqual({ words: 1, carry: 0 })
  })
})
