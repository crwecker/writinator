export interface TimerState {
  remainingSeconds: number
  elapsedSeconds: number
  isExpired: boolean
  percentRemaining: number
}

export function getTimerState(
  startedAt: number,
  totalSeconds: number,
  pausedDuration: number,
  currentPauseStart?: number,
): TimerState {
  const now = Date.now()
  const activePauseDuration = currentPauseStart ? now - currentPauseStart : 0
  const elapsedSeconds = (now - startedAt - pausedDuration - activePauseDuration) / 1000
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)
  const isExpired = remainingSeconds <= 0
  const percentRemaining = (remainingSeconds / totalSeconds) * 100

  return {
    remainingSeconds,
    elapsedSeconds,
    isExpired,
    percentRemaining,
  }
}
