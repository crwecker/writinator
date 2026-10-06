import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { render, type Rendered } from '../../test/render'
import { useStoryletHoverCard } from './useStoryletHoverCard'
import { makeBook, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import { makeHero } from '../../test/characterFixtures'

function Row({ disabled = false }: { disabled?: boolean }) {
  const h = useStoryletHoverCard('c1', disabled)
  return (
    <div data-testid="row" onMouseEnter={h.onMouseEnter} onMouseLeave={h.onMouseLeave}>
      row{h.card}
    </div>
  )
}

let r: Rendered | null = null
beforeEach(() => {
  vi.useFakeTimers()
  seedStore(makeBook([makeStorylet('c1', 'text')]), 'c1')
  seedCharacters([makeHero('kael', { hp: [12, 40] })], {})
})
afterEach(() => {
  r?.unmount()
  r = null
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function hover(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
  })
}

describe('storylet hover card', () => {
  it('shows start-of-chapter stats after a short hover', () => {
    r = render(<Row />)
    hover(r.container.querySelector('[data-testid="row"]')!)
    expect(document.querySelector('[data-testid="storylet-state-card"]')).toBeNull()
    act(() => { vi.advanceTimersByTime(500) })
    const card = document.querySelector('[data-testid="storylet-state-card"]')
    expect(card?.textContent).toContain('Kael')
    expect(card?.textContent).toContain('12/40')
  })

  it('stays hidden while disabled (dragging, renaming, menus)', () => {
    r = render(<Row disabled />)
    hover(r.container.querySelector('[data-testid="row"]')!)
    act(() => { vi.advanceTimersByTime(500) })
    expect(document.querySelector('[data-testid="storylet-state-card"]')).toBeNull()
  })
})
