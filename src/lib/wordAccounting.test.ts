import { beforeEach, describe, expect, it } from 'vitest'
import { countedQuestWords, netDayIncrement, questCredit, resetQuestLedger, type QuestLedger } from './wordAccounting'
import { useGameSettingsStore } from '../stores/gameSettingsStore'

beforeEach(() => {
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  resetQuestLedger()
})

function runDay(deltas: number[]): number[] {
  let ledger = null as ReturnType<typeof netDayIncrement>['ledger'] | null
  return deltas.map((d) => {
    const r = netDayIncrement(ledger, '2026-10-06', d)
    ledger = r.ledger
    return r.increment
  })
}

describe('netDayIncrement (streak words in net mode)', () => {
  it('a day counts its net growth: +100 −50 +30 = 80', () => {
    expect(runDay([100, -50, 30]).reduce((a, b) => a + b, 0)).toBe(80)
  })

  it('floors the day at 0 — deleting more than you add never goes negative', () => {
    const inc = runDay([100, -300])
    expect(inc).toEqual([100, -100])
  })

  it('deleted words must be rewritten before the day counts again: −300 +100 = 0, then +250 = 50', () => {
    expect(runDay([-300, 100, 250])).toEqual([0, 0, 50])
  })

  it('a new day starts fresh', () => {
    const first = netDayIncrement(null, '2026-10-05', -500)
    const next = netDayIncrement(first.ledger, '2026-10-06', 40)
    expect(next.increment).toBe(40)
  })
})

describe('questCredit', () => {
  it('gross mode credits every positive flush, ignores deletions', () => {
    let ledger: QuestLedger | null = null
    const credits = [100, -50, 30].map((d) => {
      const r = questCredit('gross', d, '2026-10-06', ledger)
      ledger = r.ledger
      return r.credit
    })
    expect(credits).toEqual([100, 0, 30])
  })

  it('net mode: deleted words have to be rewritten before quests move again', () => {
    let ledger: QuestLedger | null = null
    const credits = [100, -50, 30, 40].map((d) => {
      const r = questCredit('net', d, '2026-10-06', ledger)
      ledger = r.ledger
      return r.credit
    })
    expect(credits).toEqual([100, 0, 0, 20])
  })

  it('net mode: the debt resets on a new day', () => {
    const a = questCredit('net', -200, '2026-10-05', null)
    expect(questCredit('net', 30, '2026-10-06', a.ledger).credit).toBe(30)
  })
})

describe('countedQuestWords (uses the setting)', () => {
  it('follows the "count words as" setting', () => {
    const t = new Date(2026, 9, 6, 12).getTime()
    expect(countedQuestWords(50, t)).toBe(50)
    expect(countedQuestWords(-20, t)).toBe(0)
    expect(countedQuestWords(20, t)).toBe(20)

    useGameSettingsStore.getState().setWordCountMode('net')
    resetQuestLedger()
    expect(countedQuestWords(50, t)).toBe(50)
    expect(countedQuestWords(-20, t)).toBe(0)
    expect(countedQuestWords(20, t)).toBe(0)
    expect(countedQuestWords(5, t)).toBe(5)
  })
})
