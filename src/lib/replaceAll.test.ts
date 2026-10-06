import { beforeEach, describe, expect, it } from 'vitest'
import { replaceAllWithSnapshot } from './replaceAll'
import { useStoryletStore } from '../stores/storyletStore'
import { getSnapshots } from '../stores/snapshotStore'
import { makeBook, makeStorylet, seedStore, storyletContent } from '../test/fixtures'

const options = { query: 'cat', caseSensitive: false, wholeWord: false, regex: false }

beforeEach(() => {
  seedStore(makeBook([makeStorylet('a', 'the cat sat')]), 'a')
})

describe('Replace All', () => {
  it('files the latest typing in History before replacing', async () => {
    useStoryletStore.getState().updateStoryletContent('the cat sat on the mat, typed just now')
    await replaceAllWithSnapshot(options, 'dog', 'book')

    const history = await getSnapshots('a')
    expect(history[0]?.trigger).toBe('bulkReplace')
    expect(history[0]?.content).toBe('the cat sat on the mat, typed just now')
    expect(storyletContent('a')).toBe('the dog sat on the mat, typed just now')
  })

  it('replaces every match, however many there are', async () => {
    seedStore(makeBook([makeStorylet('a', 'cat '.repeat(800))]), 'a')
    const result = await replaceAllWithSnapshot(options, 'dog', 'book')

    expect(result.matchesReplaced).toBe(800)
    expect(storyletContent('a')).not.toContain('cat')
  })
})
