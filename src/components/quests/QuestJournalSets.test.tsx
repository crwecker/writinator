import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestJournalPanel } from './QuestJournalPanel'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useProgressionStore } from '../../stores/progressionStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { gallerySetMeta } from '../../lib/gallerySets'
import { makeSession } from '../../test/questFixtures'
import { render, type Rendered } from '../../test/render'

vi.mock('../../lib/pixelate', () => ({ drawPixelated: vi.fn(), animateReveal: vi.fn(() => () => {}) }))
vi.mock('../../lib/unsplash', () => ({ loadImage: vi.fn(() => new Promise(() => {})), fetchRandomImage: vi.fn() }))

let view: Rendered | null = null

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
  useProgressionStore.setState({ ...useProgressionStore.getInitialState(), _hasHydrated: true }, true)
})

afterEach(() => {
  view?.unmount()
  view = null
})

const done = (id: string) => makeSession(id, { completed: true, result: 'success', title: `Quest ${id}`, completedAt: '2026-10-01T00:00:00.000Z' })

describe('journal gallery sets', () => {
  it('frames pictures from a completed set and filters by set', () => {
    useImageRevealStore.setState({ completedSessions: [done('o1'), done('c1')] })
    useProgressionStore.setState({
      reveals: [
        { id: 'o1', source: 'ocean', completedAt: '2026-10-01' },
        { id: 'c1', source: 'cities', completedAt: '2026-10-01' },
      ],
      completedSets: { ocean: '2026-10-01' },
    })
    view = render(<QuestJournalPanel onFindQuests={() => {}} />)
    const item = (title: string) => view!.container.querySelector(`img[alt="${title}"]`)?.closest('button')
    const frame = gallerySetMeta('ocean').frameClass.split(' ')[0]
    expect(item('Quest o1')?.className).toContain(frame)
    expect(item('Quest c1')?.className).not.toContain(frame)

    const chip = [...view.container.querySelectorAll('[aria-label="Gallery sets"] button')].find((b) => b.textContent?.includes('Ocean'))
    expect(chip).toBeDefined()
    act(() => (chip as HTMLButtonElement).click())
    expect(item('Quest o1')).toBeTruthy()
    expect(item('Quest c1')).toBeFalsy()
  })

  it('explains that chapter and revision quests have their own measure', () => {
    useImageRevealStore.setState({ activeSessions: [makeSession('a'), makeSession('b', { progressSource: 'revision' })] })
    view = render(<QuestJournalPanel onFindQuests={() => {}} />)
    expect(view.container.textContent).not.toContain('Every word you write counts toward all of these at once')
    expect(view.container.textContent).toContain('Counts words you revise')
  })
})
