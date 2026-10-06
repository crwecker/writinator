import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HallPanel } from './HallPanel'
import { AuthorLevelBadge } from './AuthorLevel'
import { useProgressionStore } from '../../stores/progressionStore'
import { resetStreakStore } from '../../test/habitFixtures'
import { useStreakStore } from '../../stores/streakStore'
import { render, type Rendered } from '../../test/render'

let view: Rendered | null = null

beforeEach(() => {
  resetStreakStore()
  useProgressionStore.setState({ ...useProgressionStore.getInitialState(), _hasHydrated: true }, true)
})

afterEach(() => {
  view?.unmount()
  view = null
})

describe('Hall', () => {
  it('shows the author level and title from lifetime words', () => {
    useStreakStore.setState({ dailyWords: { '2026-10-01': 11_300 } })
    view = render(<AuthorLevelBadge />)
    expect(view.container.textContent).toContain('10')
    expect(view.container.textContent).toContain('Chronicler')
  })

  it('shows unlocked and locked achievements with progress', () => {
    useStreakStore.setState({ dailyWords: { '2026-10-01': 4000 } })
    useProgressionStore.setState({ unlocked: { 'words-1k': '2026-10-01T00:00:00.000Z' } })
    view = render(<HallPanel />)
    const unlocked = view.container.querySelector('[data-testid="achievement-words-1k"]')
    const locked = view.container.querySelector('[data-testid="achievement-words-10k"]')
    expect(unlocked?.getAttribute('data-unlocked')).toBe('true')
    expect(locked?.getAttribute('data-unlocked')).toBe('false')
    expect(locked?.textContent).toContain('4,000/10,000')
  })
})
