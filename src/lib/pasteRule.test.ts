import { describe, expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { isLargePaste, pastedWords } from './pasteRule'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

function tr(insert: string, userEvent?: string, doc = 'Existing text here'): Transaction {
  const state = EditorState.create({ doc })
  return state.update({ changes: { from: doc.length, insert }, ...(userEvent ? { userEvent } : {}) })
}

describe('paste rule', () => {
  it('counts the words a paste inserts', () => {
    expect(pastedWords([tr(` ${words(12)}`, 'input.paste')])).toBe(12)
  })

  it('a paste of more than 50 words is large', () => {
    expect(isLargePaste([tr(` ${words(51)}`, 'input.paste')])).toBe(true)
  })

  it('a paste of 50 words or fewer still counts as writing', () => {
    expect(isLargePaste([tr(` ${words(50)}`, 'input.paste')])).toBe(false)
  })

  it('typing is never a paste, however long', () => {
    expect(isLargePaste([tr(` ${words(200)}`, 'input.type')])).toBe(false)
  })

  it('ignores the font spans a rich paste wraps lines in', () => {
    const line = `<span style="font-family: 'Georgia'">${words(48)}</span>`
    expect(pastedWords([tr(line, 'input.paste')])).toBe(48)
    expect(isLargePaste([tr(line, 'input.paste')])).toBe(false)
  })

  it('replacing a selection with a paste counts only the pasted words', () => {
    const state = EditorState.create({ doc: words(100) })
    const t = state.update({ changes: { from: 0, to: state.doc.length, insert: words(10) }, userEvent: 'input.paste' })
    expect(pastedWords([t])).toBe(10)
  })
})
