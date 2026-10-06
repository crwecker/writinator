import { afterEach, describe, expect, it } from 'vitest'
import { ConsumableButtons } from './ImageRevealWidgets'
import { render, type Rendered } from '../../test/render'

let view: Rendered | null = null
afterEach(() => {
  view?.unmount()
  view = null
})

describe('ConsumableButtons', () => {
  it('offers quest consumables but not passive ones like Streak Freeze', () => {
    view = render(<ConsumableButtons inventory={{ 'streak-freeze': 2, 'word-burst': 1 }} onUse={() => {}} />)
    const titles = [...view.container.querySelectorAll('button')].map((b) => b.getAttribute('title') ?? '')
    expect(titles.some((t) => t.startsWith('Word Burst'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Streak Freeze'))).toBe(false)
  })
})
