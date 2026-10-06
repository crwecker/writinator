import type { ChangeSet, Text, Transaction } from '@codemirror/state'
import { countWords } from '../../lib/words'

/** Words on lines `fromLine..toLine` (inclusive) of `doc`. */
function countLines(doc: Text, fromLine: number, toLine: number): number {
  let n = 0
  for (let i = fromLine; i <= toLine; i++) n += countWords(doc.line(i).text)
  return n
}

/** Merge overlapping/adjacent `[from, to]` line spans (input sorted by `from`). */
function mergeSpans(spans: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const s of spans) {
    const last = out[out.length - 1]
    if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1])
    else out.push([s[0], s[1]])
  }
  return out
}

/**
 * Change in word count caused by `changes` (oldDoc → newDoc), re-counting only
 * the lines the changes touch. Exact: a line break is whitespace, so no word
 * spans two lines, and every untouched line is carried over unchanged.
 */
export function wordCountDelta(changes: ChangeSet, oldDoc: Text, newDoc: Text): number {
  const oldSpans: [number, number][] = []
  const newSpans: [number, number][] = []
  changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    oldSpans.push([oldDoc.lineAt(fromA).number, oldDoc.lineAt(toA).number])
    newSpans.push([newDoc.lineAt(fromB).number, newDoc.lineAt(toB).number])
  })
  let delta = 0
  for (const [a, b] of mergeSpans(newSpans)) delta += countLines(newDoc, a, b)
  for (const [a, b] of mergeSpans(oldSpans)) delta -= countLines(oldDoc, a, b)
  return delta
}

/**
 * Whether an editor update is the user writing: typing, deleting, pasting or
 * dropping text (VIM edits dispatch as input too). Undo/redo and programmatic
 * dispatches with no user event (snapshot restore, stat-marker insertion,
 * toolbar formatting) are not, so they don't feed WPM, metrics or quests.
 */
export function isWritingUpdate(transactions: readonly Transaction[]): boolean {
  return transactions.some(
    (tr) =>
      tr.docChanged &&
      (tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move.drop')),
  )
}
