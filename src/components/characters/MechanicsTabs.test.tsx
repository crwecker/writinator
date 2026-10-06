import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { render, type Rendered } from '../../test/render'
import { ChangesTab } from './ChangesTab'
import { IssuesTab } from './IssuesTab'
import { makeBook, makeStorylet } from '../../test/fixtures'
import { makeHero } from '../../test/characterFixtures'
import { m, one } from '../../test/mechanicsFixtures'
import * as downloadFile from '../../lib/downloadFile'
import type { ConsistencyIssue, StatDelta } from '../../types'

vi.mock('../../lib/downloadFile', () => ({ downloadTextFile: vi.fn() }))

let r: Rendered | null = null
afterEach(() => {
  r?.unmount()
  r = null
  vi.mocked(downloadFile.downloadTextFile).mockClear()
})

function button(text: string): HTMLButtonElement {
  const b = Array.from(r!.container.querySelectorAll('button')).find((el) => el.textContent?.includes(text))
  if (!b) throw new Error(`no button "${text}"`)
  return b
}
function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

const kael = makeHero('kael')
const noop = () => {}

describe('ChangesTab timeline export', () => {
  it('downloads every change as CSV', () => {
    const book = makeBook([makeStorylet('c1', `The wolf bit. ${m('a')}`, { name: 'Chapter 1' })])
    const markers = { a: one('kael', { kind: 'adjust', statId: 'hp', delta: -5 }) }
    r = render(<ChangesTab book={book} characters={[kael]} markers={markers} onJumpToMarker={noop} />)
    click(button('Export CSV'))
    const [csv, filename, mime] = vi.mocked(downloadFile.downloadTextFile).mock.calls[0]
    expect(csv).toContain('Chapter,Position,Excerpt,Character,Stat,Change,Value after')
    expect(csv).toContain('Chapter 1,14,The wolf bit.,Kael,HP,HP -5,35/40')
    expect(filename).toBe('Test Book - stat timeline.csv')
    expect(mime).toBe('text/csv')
  })
})

describe('IssuesTab re-linking', () => {
  const book = makeBook([makeStorylet('c1', 'He fell. Then rose.', { name: 'Chapter 1' })])
  const lost: StatDelta[] = [
    { id: 'd', characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -5 }, anchor: { storyletId: 'c1', excerpt: 'He fell.' } },
  ]

  function renderTab(issues: ConsistencyIssue[], extra: Partial<Parameters<typeof IssuesTab>[0]> = {}) {
    r = render(
      <IssuesTab
        issues={issues}
        characters={[kael]}
        book={book}
        editorView={null}
        onJumpToMarker={noop}
        onRemoveOrphanFromText={noop}
        onCreateEmptyDelta={noop}
        onDeleteInverseOrphan={noop}
        onAddSlot={noop}
        markers={{ old: lost }}
        {...extra}
      />,
    )
  }

  it('offers to re-attach a lost change where it likely belonged', () => {
    const onReattach = vi.fn()
    renderTab([{ kind: 'inverseOrphan', markerId: 'old' }], {
      reattachSuggestions: { old: { storyletId: 'c1', offset: 8, reason: 'excerpt' } },
      onReattach,
    })
    expect(r!.container.textContent).toContain('Kael · HP −5')
    click(button('Re-attach in Chapter 1'))
    expect(onReattach).toHaveBeenCalledWith('old', { storyletId: 'c1', offset: 8, reason: 'excerpt' })
  })

  it('offers to re-attach at the cursor', () => {
    const onReattachAtCursor = vi.fn()
    renderTab([{ kind: 'inverseOrphan', markerId: 'old' }], { onReattachAtCursor })
    click(button('Re-attach at cursor'))
    expect(onReattachAtCursor).toHaveBeenCalledWith('old')
  })

  it('links a marker that lost its change to the matching lost change', () => {
    const onLinkOrphan = vi.fn()
    const link = { textMarkerId: 'new', storeMarkerId: 'old', storyletId: 'c1' }
    renderTab(
      [
        { kind: 'orphanMarker', markerId: 'new', storyletId: 'c1', offset: 9 },
        { kind: 'inverseOrphan', markerId: 'old' },
      ],
      { orphanLinks: [link], onLinkOrphan },
    )
    click(button('Restore lost change'))
    expect(onLinkOrphan).toHaveBeenCalledWith(link)
  })
})
