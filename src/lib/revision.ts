import type { Text, Transaction } from '@codemirror/state'

/**
 * Revised words: characters changed inside text that already existed —
 * insertions and deletions in the middle of a non-blank line. Writing new
 * text at the end of a paragraph, on a blank line, pastes, undo and
 * programmatic edits don't count. Characters become words at six per word
 * (an average word plus its space), keeping the remainder.
 */

export const CHARS_PER_REVISED_WORD = 6

const NON_SPACE = /\S/

/** Changed characters for one change against the document before it. */
export function revisedCharsInChange(doc: Text, fromA: number, toA: number, inserted: number): number {
  const line = doc.lineAt(fromA)
  if (!NON_SPACE.test(line.text)) return 0
  // Existing text must follow the change on the line where it ends.
  const endLine = toA <= line.to ? line : doc.lineAt(toA)
  const after = endLine.text.slice(toA - endLine.from)
  if (!NON_SPACE.test(after)) return 0
  return toA - fromA + inserted
}

function isRevisionEdit(tr: Transaction): boolean {
  if (!tr.docChanged) return false
  if (tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop')) return false
  return tr.isUserEvent('input') || tr.isUserEvent('delete')
}

/** Revised characters across an update's transactions. Cheap: one lineAt per change. */
export function revisedCharsForTransactions(trs: readonly Transaction[]): number {
  let chars = 0
  for (const tr of trs) {
    if (!isRevisionEdit(tr)) continue
    const doc = tr.startState.doc
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      chars += revisedCharsInChange(doc, fromA, toA, inserted.length)
    })
  }
  return chars
}

export function charsToWords(carry: number, chars: number): { words: number; carry: number } {
  const total = carry + Math.max(0, chars)
  return { words: Math.floor(total / CHARS_PER_REVISED_WORD), carry: total % CHARS_PER_REVISED_WORD }
}
