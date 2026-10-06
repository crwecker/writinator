import { describe, expect, it } from 'vitest'
import { useStoryletStore } from '../stores/storyletStore'

describe('test harness', () => {
  it('loads the storylet store with in-memory storage', () => {
    expect(useStoryletStore.getState().book).toBeNull()
  })
})
