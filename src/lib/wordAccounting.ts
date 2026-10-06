import { todayKey } from './metrics'
import { useGameSettingsStore } from '../stores/gameSettingsStore'

/**
 * "Count words as" — what quests, streaks and goals treat as words written.
 * - gross: every flush that grew the text counts; deletions are ignored (default).
 * - net: words added minus words deleted; a day's total is floored at 0.
 *
 * Each content flush yields a signed delta (its net change). Gross uses
 * max(0, delta); net uses the signed delta with the rules below.
 */
export type WordCountMode = 'gross' | 'net'

export interface DayNetLedger {
  day: string
  /** Signed sum of the day's deltas. */
  net: number
}

/**
 * How a signed delta changes the day's counted words in net mode: the day
 * counts max(0, sum of its deltas), so the increment is the change in that.
 * Can be negative (deleting words counted earlier today).
 */
export function netDayIncrement(
  ledger: DayNetLedger | null,
  day: string,
  delta: number,
): { ledger: DayNetLedger; increment: number } {
  const before = ledger && ledger.day === day ? ledger.net : 0
  const after = before + delta
  return { ledger: { day, net: after }, increment: Math.max(0, after) - Math.max(0, before) }
}

export interface QuestLedger extends DayNetLedger {
  /** Counted words deleted since; rewriting repays this before quests move again. */
  debt: number
}

/**
 * Words a flush credits to quests. Quest progress never goes backwards, so in
 * net mode deletions become a debt that new writing repays first (per day).
 */
export function questCredit(
  mode: WordCountMode,
  delta: number,
  day: string,
  ledger: QuestLedger | null,
): { ledger: QuestLedger; credit: number } {
  if (mode === 'gross') {
    return { ledger: ledger ?? { day, net: 0, debt: 0 }, credit: Math.max(0, delta) }
  }
  const sameDay = ledger !== null && ledger.day === day
  const { ledger: dayLedger, increment } = netDayIncrement(sameDay ? ledger : null, day, delta)
  let debt = sameDay ? ledger.debt : 0
  let credit = 0
  if (increment < 0) {
    debt += -increment
  } else {
    credit = Math.max(0, increment - debt)
    debt = Math.max(0, debt - increment)
  }
  return { ledger: { ...dayLedger, debt }, credit }
}

// The quest ledger lives for the app session; a reload starts the day's net afresh.
let questLedger: QuestLedger | null = null

export function resetQuestLedger(): void {
  questLedger = null
}

/** Words a content flush with this signed delta credits to quests, per the setting. */
export function countedQuestWords(delta: number, timestamp: number): number {
  const mode = useGameSettingsStore.getState().wordCountMode
  const result = questCredit(mode, delta, todayKey(timestamp), questLedger)
  questLedger = result.ledger
  return result.credit
}
