import { describe, expect, it } from 'vitest'
import { migrateFile } from './migration'
import { makeBook, makeFile, makeStorylet } from '../test/fixtures'

describe('file versions', () => {
  it('refuses a file saved by a newer version of the app', () => {
    const newer = { ...makeFile(makeBook([makeStorylet('a', 'text')])), version: 9, futureField: { kept: true } }
    expect(() => migrateFile(newer)).toThrow(/newer version of Writinator/)
  })

  it('still opens a current file', () => {
    const file = migrateFile(makeFile(makeBook([makeStorylet('a', 'text')])))
    expect(file.book.storylets[0].content).toBe('text')
  })
})
