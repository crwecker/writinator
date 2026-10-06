import { beforeEach, describe, expect, it } from 'vitest'
import { computeReplacePreview, searchStorylet } from './bookSearch'
import { useStoryletStore } from '../stores/storyletStore'
import type { SearchOptions } from '../types'
import { makeBook, makeStorylet, seedStore, storyletContent } from '../test/fixtures'

function opts(query: string, extra: Partial<SearchOptions> = {}): SearchOptions {
  return { query, caseSensitive: false, wholeWord: false, regex: false, ...extra }
}

const STAT = '<!-- stat:ada0f00d-face-4bad-8eed-0123456789ab -->'
const NOTE = '<!-- note:4c7e1d2a-note-4a1b-9c3d-2f6e8a0b1c2d -->'

describe('replace all', () => {
  beforeEach(() => {
    seedStore(makeBook([makeStorylet('a', 'Ann Smith met Bob Smith.')]), 'a')
  })

  it('fills in $1 capture groups like the preview does', () => {
    useStoryletStore.getState().replaceAllInBook(opts('(\\w+) Smith', { regex: true }), '$1 Jones', 'book')
    expect(storyletContent('a')).toBe('Ann Jones met Bob Jones.')
  })

  it('fills in $& with the whole match', () => {
    useStoryletStore.getState().replaceAllInBook(opts('Smith', { regex: true }), '[$&]', 'book')
    expect(storyletContent('a')).toBe('Ann [Smith] met Bob [Smith].')
  })

  it('preview and applied result agree', () => {
    const book = useStoryletStore.getState().book!
    const preview = computeReplacePreview(book, opts('(\\w+) Smith', { regex: true }), '$1 Jones', 'book')
    useStoryletStore.getState().replaceAllInBook(opts('(\\w+) Smith', { regex: true }), '$1 Jones', 'book')

    const previewed = preview[0].matches.map((m) => m.afterSnippet.slice(...m.afterReplacementRange))
    expect(previewed).toEqual(['Ann Jones', 'Bob Jones'])
    for (const text of previewed) expect(storyletContent('a')).toContain(text)
  })

  it('literal mode inserts $1 literally', () => {
    useStoryletStore.getState().replaceAllInBook(opts('Smith'), '$1', 'book')
    expect(storyletContent('a')).toBe('Ann $1 met Bob $1.')
  })
})

describe('hidden markers are never matched', () => {
  const content = `Ada looked at her face. ${STAT} A note about her. ${NOTE} The end.`

  beforeEach(() => {
    seedStore(makeBook([makeStorylet('a', content)]), 'a')
  })

  it('search skips text inside stat and note markers', () => {
    const storylet = useStoryletStore.getState().book!.storylets[0]
    expect(searchStorylet(storylet, opts('ada'))).toHaveLength(1)
    expect(searchStorylet(storylet, opts('face'))).toHaveLength(1)
    expect(searchStorylet(storylet, opts('note'))).toHaveLength(1)
    expect(searchStorylet(storylet, opts('stat'))).toHaveLength(0)
  })

  it('a regex that would span into a marker is skipped', () => {
    const storylet = useStoryletStore.getState().book!.storylets[0]
    expect(searchStorylet(storylet, opts('face\\..*?ada', { regex: true }))).toHaveLength(0)
  })

  it('replace leaves markers untouched', () => {
    for (const q of ['ada', 'face', 'note', 'stat']) {
      useStoryletStore.getState().replaceAllInBook(opts(q), 'X', 'book')
    }
    const after = storyletContent('a') ?? ''
    expect(after).toContain(STAT)
    expect(after).toContain(NOTE)
    expect(after).toBe(`X looked at her X. ${STAT} A X about her. ${NOTE} The end.`)
  })

  it('preview counts match what replace changes', () => {
    const book = useStoryletStore.getState().book!
    const preview = computeReplacePreview(book, opts('note'), 'X', 'book')
    const result = useStoryletStore.getState().replaceAllInBook(opts('note'), 'X', 'book')
    expect(preview[0].matches).toHaveLength(1)
    expect(result.matchesReplaced).toBe(1)
  })
})
