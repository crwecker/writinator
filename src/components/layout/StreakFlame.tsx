import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import { useStreakStore } from '../../stores/streakStore'
// Imported for its side effect: records listen to the word feed from startup.
import '../../stores/recordsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { showToast } from '../../stores/genericToastStore'
import { todayKey } from '../../lib/metrics'
import { formatDayLabel } from '../../lib/days'
import { graceAvailableOn, nextGraceDay, STREAK_FREEZE_ID, STREAK_THRESHOLD } from '../../lib/streak'
import { shouldNudge } from '../../lib/nudge'

const CLOCK_MS = 60_000

/** Re-evaluate the streak when the local day changes, and send the daily reminder. */
function useHabitClock(): void {
  useEffect(() => {
    let lastDay = todayKey()
    function tick() {
      const now = Date.now()
      const day = todayKey(now)
      const streak = useStreakStore.getState()
      if (!streak._hasHydrated) return
      if (day !== lastDay) {
        lastDay = day
        streak.evaluate(now)
      }
      const check = {
        enabled: streak.nudge.enabled,
        time: streak.nudge.time,
        todayWords: streak.dailyWords[day] ?? 0,
        lastNudgedDay: streak.lastNudgedDay,
      }
      if (shouldNudge(check, now)) {
        streak.markNudged(day)
        sendNudge(check.todayWords, streak.currentStreak)
      }
    }
    tick()
    const id = setInterval(tick, CLOCK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}

function sendNudge(todayWords: number, streak: number): void {
  const left = Math.max(0, STREAK_THRESHOLD - todayWords)
  const body =
    streak > 0
      ? `${left} more words keeps your ${streak}-day streak going.`
      : `${left} words today starts a new streak.`
  const canNotify =
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    document.visibilityState !== 'visible'
  if (canNotify) {
    try {
      new Notification('Time to write', { body })
      return
    } catch {
      // fall through to the in-app toast
    }
  }
  showToast(`Time to write: ${body}`, 'info')
}

function tooltipText(): string {
  const s = useStreakStore.getState()
  const today = todayKey()
  const words = s.dailyWords[today] ?? 0
  const freezes = usePlayerStore.getState().consumableInventory[STREAK_FREEZE_ID] ?? 0
  const lines = [
    s.currentStreak > 0 ? `${s.currentStreak}-day writing streak` : 'No streak yet',
    s.todayQualified
      ? `Today: ${words.toLocaleString()} words ✓`
      : `Today: ${words.toLocaleString()} / ${STREAK_THRESHOLD} words`,
    graceAvailableOn(s.covered, today)
      ? 'Grace day: available this week'
      : `Grace day: used, back ${formatDayLabel(nextGraceDay(s.covered, today))}`,
    `Streak Freezes: ${freezes}`,
    `Longest: ${s.longestStreak} day${s.longestStreak === 1 ? '' : 's'}`,
  ]
  return lines.join('\n')
}

/** Status-bar flame showing the current writing streak. */
export function StreakFlame() {
  useHabitClock()
  const current = useStreakStore((s) => s.currentStreak)
  const todayQualified = useStreakStore((s) => s.todayQualified)
  const [title, setTitle] = useState('Writing streak')

  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums transition-colors ${
        todayQualified ? 'text-amber-400' : current > 0 ? 'text-amber-600/80' : 'text-gray-500'
      }`}
      title={title}
      onMouseEnter={() => setTitle(tooltipText())}
      aria-label={`${current}-day writing streak${todayQualified ? '' : ', not yet extended today'}`}
      data-testid="streak-flame"
    >
      <Flame size={13} className={todayQualified ? 'fill-amber-500/40' : ''} aria-hidden="true" />
      {current}
    </span>
  )
}
