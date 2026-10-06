import { describe, it, expect } from 'vitest'
import { migrateFile } from './migration'
import { makeBook, makeFile, makeStorylet } from '../test/fixtures'
import { useCharacterStore } from '../stores/characterStore'
import type { StatDelta } from '../types'

describe('marker anchors in the saved file', () => {
  it('survive a save → load round trip', () => {
    const anchored: StatDelta[] = [
      { id: 'd', characterId: 'k', op: { kind: 'adjust', statId: 'hp', delta: -5 }, anchor: { storyletId: 'c1', excerpt: 'He fell.' } },
    ]
    const saved = JSON.parse(JSON.stringify(makeFile(makeBook([makeStorylet('c1', 'He fell.')]), { markers: { lost: anchored } })))
    const file = migrateFile(saved)
    expect(file.markers.lost[0].anchor).toEqual({ storyletId: 'c1', excerpt: 'He fell.' })
    useCharacterStore.getState().loadFromFile(file.characters, file.markers)
    expect(useCharacterStore.getState().markers.lost[0].anchor?.excerpt).toBe('He fell.')
  })
})
