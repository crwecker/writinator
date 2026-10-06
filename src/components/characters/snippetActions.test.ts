import { describe, expect, it } from 'vitest'
import { renameSnippet } from './snippetActions'
import { useStoryletStore } from '../../stores/storyletStore'
import { makeBook, makeStorylet, seedStore, storyletContent } from '../../test/fixtures'

function seed(snippets: Record<string, string>) {
  seedStore(
    makeBook([
      makeStorylet('c1', 'Hello {Greet}, and { greet } again. Not {Greeting} or {Bob.Greet}.'),
      makeStorylet('c2', 'Nothing here.'),
    ]),
    'c1',
  )
  useStoryletStore.setState({ globalSettings: { snippets } })
}

const snippets = () => useStoryletStore.getState().globalSettings.snippets

describe('renaming a snippet', () => {
  it('rejects a name that differs only in case from another snippet', () => {
    seed({ Greet: 'hi', Other: 'x' })
    expect(renameSnippet('Greet', 'other')).toBe(false)
    expect(snippets()).toEqual({ Greet: 'hi', Other: 'x' })
  })

  it('allows a case-only rename of the same snippet', () => {
    seed({ Greet: 'hi' })
    expect(renameSnippet('Greet', 'GREET')).toBe(true)
    expect(snippets()).toEqual({ GREET: 'hi' })
  })

  it('updates refs in the prose and in other snippets', () => {
    seed({ Greet: 'hi', Wrapper: '<b>{greet}</b>' })
    useStoryletStore.getState().updateStoryletContent('Hello {Greet}, and { greet } again. Not {Greeting} or {Bob.Greet}. typed', 'c1')
    expect(renameSnippet('Greet', 'Salute')).toBe(true)
    expect(snippets()).toEqual({ Salute: 'hi', Wrapper: '<b>{Salute}</b>' })
    expect(storyletContent('c1')).toBe('Hello {Salute}, and {Salute} again. Not {Greeting} or {Bob.Greet}. typed')
    expect(storyletContent('c2')).toBe('Nothing here.')
  })
})
