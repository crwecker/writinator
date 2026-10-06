import { describe, expect, it } from 'vitest'
import { localforageMemory } from '../../test/setup'
import { applyRetroactiveGrant } from './shellActions'
import { usePlayerStore } from '../../stores/playerStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'

const T = '2026-01-01T00:00:00.000Z'

function successSession(id: string) {
  return {
    id, imageUrl: 'x', imageWidth: 1, imageHeight: 1, wordGoal: 10, wordsWritten: 10,
    currentLevel: 7, completed: true, startedAt: T, completedAt: T, result: 'success',
  }
}

describe('applyRetroactiveGrant', () => {
  it('waits for player + image-reveal hydration before granting', async () => {
    localforageMemory.set('writinator-player', JSON.stringify({
      state: {
        coins: 5, ownedItems: [], equippedWeapon: 'wooden-pencil', equippedArmor: 'cloth-tunic',
        consumableInventory: {}, questStats: { totalCompleted: 0, totalWords: 0, totalCoins: 0 },
        retroactiveGrantApplied: false,
      },
      version: 1,
    }))
    localforageMemory.set('writinator-image-reveal', JSON.stringify({
      state: {
        activeSessions: [], completedSessions: [successSession('a'), successSession('b')],
        isPaused: false, pauseStartedAt: null, activeEffects: [],
      },
      version: 2,
    }))

    // Simulate app start: hydration from storage is in flight when AppShell mounts.
    const hydrated = Promise.all([
      usePlayerStore.persist.rehydrate(),
      useImageRevealStore.persist.rehydrate(),
    ])
    const cleanup = applyRetroactiveGrant()
    await hydrated
    await new Promise((r) => setTimeout(r, 0))
    cleanup()

    expect(usePlayerStore.getState().coins).toBe(5 + 200)
    expect(usePlayerStore.getState().retroactiveGrantApplied).toBe(true)
  })
})
