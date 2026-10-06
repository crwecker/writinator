import { todayKey } from './metrics'
import { STREAK_THRESHOLD } from './streak'

export interface NudgeCheck {
  enabled: boolean
  /** Local "HH:MM". */
  time: string
  todayWords: number
  lastNudgedDay: string | null
}

/** Whether to remind the writer now: enabled, past the chosen time, under 100 words today, not yet reminded today. */
export function shouldNudge(check: NudgeCheck, now: number = Date.now()): boolean {
  if (!check.enabled) return false
  if (check.todayWords >= STREAK_THRESHOLD) return false
  if (check.lastNudgedDay === todayKey(now)) return false
  const [h, m] = check.time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false
  const d = new Date(now)
  return d.getHours() * 60 + d.getMinutes() >= h * 60 + m
}
