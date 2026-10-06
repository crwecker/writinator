import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageRevealResult } from './ImageRevealResult'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { makeSession } from '../../test/questFixtures'
import { render, type Rendered } from '../../test/render'

vi.mock('../../lib/pixelate', () => ({ drawPixelated: vi.fn(), animateReveal: vi.fn(() => () => {}) }))
vi.mock('../../lib/unsplash', () => ({
  fetchRandomImage: vi.fn(() => Promise.reject(new Error('offline'))),
  loadImage: vi.fn(() => new Promise(() => {})),
}))

let view: Rendered | null = null

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useWriteathonStore.setState({ activeBoardQuests: [] })
})

afterEach(() => {
  view?.unmount()
  view = null
})

function chainButton(container: HTMLElement): HTMLButtonElement | null {
  return [...container.querySelectorAll('button')].find((b) => /Another/.test(b.textContent ?? '')) ?? null
}

async function clickChain(container: HTMLElement) {
  const btn = chainButton(container)
  expect(btn).not.toBeNull()
  await act(async () => {
    btn!.click()
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

describe('ImageRevealResult quest chains', () => {
  it('offers "Another 500?" and starts the same quest in one click', async () => {
    const onDone = vi.fn()
    const done = makeSession('s', { wordGoal: 500, wordsWritten: 500, completed: true, result: 'success', title: 'Session quest' })
    view = render(<ImageRevealResult session={done} image={undefined} onDone={onDone} />)
    expect(chainButton(view.container)?.textContent).toContain('Another 500?')
    await clickChain(view.container)
    const [next] = useImageRevealStore.getState().activeSessions
    expect(next).toMatchObject({ wordGoal: 500, title: 'Session quest', wordsWritten: 0 })
    expect(next.timeMinutes).toBeUndefined()
    expect(onDone).toHaveBeenCalled()
  })

  it('keeps the timer the writer chose (armor is applied once, not twice)', async () => {
    usePlayerStore.setState({ ownedItems: ['time-shield'], equippedArmor: 'time-shield' })
    const done = makeSession('s', {
      wordGoal: 500, wordsWritten: 500, completed: true, result: 'success', title: 'Sprint',
      timeMinutes: 25, baseTimeMinutes: 20, pausedDuration: 0,
    })
    view = render(<ImageRevealResult session={done} image={undefined} onDone={() => {}} />)
    await clickChain(view.container)
    const [next] = useImageRevealStore.getState().activeSessions
    expect(next.baseTimeMinutes).toBe(20)
    expect(next.timeMinutes).toBeCloseTo(25)
  })

  it('re-accepts a guild contract so its board reward is paid again', async () => {
    const done = makeSession('s', { wordGoal: 500, wordsWritten: 500, completed: true, result: 'success', title: 'Steady March' })
    view = render(<ImageRevealResult session={done} image={undefined} onDone={() => {}} />)
    await clickChain(view.container)
    const [next] = useImageRevealStore.getState().activeSessions
    expect(next.boardCoins).toBe(50)
    expect(useWriteathonStore.getState().activeBoardQuests).toMatchObject([
      { type: 'permanent', wordGoal: 500, title: 'Steady March', imageRevealSessionId: next.id },
    ])
  })
})
