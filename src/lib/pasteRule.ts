import type { Transaction } from '@codemirror/state'
import { countWords } from './words'

/** Pastes longer than this don't count toward quests, streaks or metrics. */
export const MAX_COUNTED_PASTE_WORDS = 50

/** Words inserted by paste transactions (HTML tags such as font spans ignored). */
export function pastedWords(transactions: readonly Transaction[]): number {
  let n = 0
  for (const tr of transactions) {
    if (!tr.docChanged || !tr.isUserEvent('input.paste')) continue
    tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      n += countWords(inserted.toString().replace(/<[^>]*>/g, ' '))
    })
  }
  return n
}

/** Whether an editor update pastes in more than MAX_COUNTED_PASTE_WORDS words. */
export function isLargePaste(transactions: readonly Transaction[]): boolean {
  return pastedWords(transactions) > MAX_COUNTED_PASTE_WORDS
}
