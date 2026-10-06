import { describe, it, expect } from 'vitest'
import {
  anchorOf,
  applyAnchorUpdates,
  computeAnchorUpdates,
  excerptBefore,
  findExcerptOffset,
  suggestOrphanLinks,
  suggestReattach,
} from './relink'
import { makeBook, makeStorylet } from '../test/fixtures'
import { m, one } from '../test/mechanicsFixtures'
import type { StatDelta } from '../types'

const hpDown = { kind: 'adjust', statId: 'hp', delta: -5 } as const

describe('excerptBefore', () => {
  it('strips markers, collapses whitespace and cuts at a word', () => {
    const content = `The wolf ${m('x')} bit\n\nhard. ${m('a')}`
    expect(excerptBefore(content, content.indexOf(m('a')))).toBe('The wolf bit hard.')
    expect(excerptBefore('one two three four', 18, 10)).toBe('four')
  })

  it('ignores a comment cut in half by the window', () => {
    const content = `${m('x')}word ${m('a')}`
    expect(excerptBefore(content, content.indexOf(m('a')), 6)).toBe('word')
  })
})

describe('findExcerptOffset', () => {
  it('finds the excerpt end in raw text despite markers and spacing', () => {
    const content = `Intro. The wolf ${m('x')} bit\nhard. Then more.`
    const at = findExcerptOffset(content, 'The wolf bit hard.')
    expect(content.slice(0, at!)).toBe(`Intro. The wolf ${m('x')} bit\nhard.`)
  })

  it('falls back to the tail of the excerpt when the start was edited', () => {
    const content = 'A dog bit him hard on the leg. Next.'
    const at = findExcerptOffset(content, 'The wolf bit him hard on the leg.')
    expect(content.slice(0, at!)).toBe('A dog bit him hard on the leg.')
  })

  it('returns null when nothing matches or the match is ambiguous', () => {
    expect(findExcerptOffset('nothing here', 'The wolf bit')).toBeNull()
    expect(findExcerptOffset('he ran. he ran.', 'he ran.')).toBeNull()
  })
})

describe('anchors', () => {
  it('records anchors for markers missing one and leaves fresh ones alone', () => {
    const content = `He fell. ${m('a')} Later. ${m('b')}`
    const markers: Record<string, StatDelta[]> = {
      a: one('kael', hpDown),
      b: [{ id: 'd', characterId: 'kael', op: hpDown, anchor: { storyletId: 'c1', excerpt: 'Later.' } }],
    }
    const updates = computeAnchorUpdates('c1', content, markers)
    expect(updates).toEqual({ a: { storyletId: 'c1', excerpt: 'He fell.' } })
    const next = applyAnchorUpdates(markers, updates)
    expect(anchorOf(next.a)).toEqual({ storyletId: 'c1', excerpt: 'He fell.' })
    expect(next.b).toBe(markers.b)
  })

  it('refreshes an anchor when the marker moved chapter or its excerpt went stale', () => {
    const content = `New words. ${m('a')}`
    const markers = {
      a: [{ id: 'd', characterId: 'k', op: hpDown, anchor: { storyletId: 'c0', excerpt: 'New words.' } }],
    }
    expect(computeAnchorUpdates('c1', content, markers)).toEqual({ a: { storyletId: 'c1', excerpt: 'New words.' } })
    const stale = { a: [{ ...markers.a[0], anchor: { storyletId: 'c1', excerpt: 'Old words gone.' } }] }
    expect(computeAnchorUpdates('c1', content, stale)).toEqual({ a: { storyletId: 'c1', excerpt: 'New words.' } })
  })

  it('returns the same markers object when nothing changes', () => {
    const markers = { a: one('k', hpDown) }
    expect(applyAnchorUpdates(markers, {})).toBe(markers)
  })
})

describe('suggestReattach', () => {
  it('puts the change back after its excerpt', () => {
    const book = makeBook([makeStorylet('c1', 'He fell. Then he rose.')])
    const deltas = [{ id: 'd', characterId: 'k', op: hpDown, anchor: { storyletId: 'c1', excerpt: 'He fell.' } }]
    expect(suggestReattach(book, deltas)).toEqual({ storyletId: 'c1', offset: 8, reason: 'excerpt' })
  })

  it('falls back to the end of the storylet it was last seen in', () => {
    const book = makeBook([makeStorylet('c1', 'Rewritten entirely.')])
    const deltas = [{ id: 'd', characterId: 'k', op: hpDown, anchor: { storyletId: 'c1', excerpt: 'He fell.' } }]
    expect(suggestReattach(book, deltas)).toEqual({ storyletId: 'c1', offset: 19, reason: 'end' })
  })

  it('has nothing to suggest without an anchor or when the storylet is gone', () => {
    const book = makeBook([makeStorylet('c1', 'x')])
    expect(suggestReattach(book, one('k', hpDown))).toBeNull()
    const lost = [{ id: 'd', characterId: 'k', op: hpDown, anchor: { storyletId: 'gone', excerpt: 'x' } }]
    expect(suggestReattach(book, lost)).toBeNull()
  })
})

describe('suggestOrphanLinks', () => {
  it('pairs a text marker without an entry with a lost entry from the same storylet', () => {
    const book = makeBook([
      makeStorylet('c1', `He fell. ${m('new-id')} More ${m('fine')}`),
      makeStorylet('c2', `Other ${m('other-new')}`),
    ])
    const markers: Record<string, StatDelta[]> = {
      fine: one('k', hpDown),
      'old-id': [{ id: 'd', characterId: 'k', op: hpDown, anchor: { storyletId: 'c1', excerpt: 'He fell.' } }],
      'old-2': [{ id: 'e', characterId: 'k', op: hpDown, anchor: { storyletId: 'c9', excerpt: 'gone' } }],
    }
    expect(suggestOrphanLinks(book, markers)).toEqual([
      { textMarkerId: 'new-id', storeMarkerId: 'old-id', storyletId: 'c1' },
    ])
  })
})
