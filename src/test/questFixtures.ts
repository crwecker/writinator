import type { ImageRevealSession } from '../types'

const T = '2026-01-01T00:00:00.000Z'

export function makeSession(id: string, extra: Partial<ImageRevealSession> = {}): ImageRevealSession {
  return {
    id,
    imageUrl: `https://img/${id}`,
    imageWidth: 10,
    imageHeight: 10,
    wordGoal: 100,
    wordsWritten: 0,
    currentLevel: 0,
    completed: false,
    startedAt: T,
    ...extra,
  }
}
