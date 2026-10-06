import { useStreakStore } from '../stores/streakStore'
import { useRecordsStore } from '../stores/recordsStore'

/** Reset the streak store to a fresh, already-hydrated state. */
export function resetStreakStore(): void {
  useStreakStore.setState({ ...useStreakStore.getInitialState(), _hasHydrated: true }, true)
}

/** Reset the records store to a fresh, already-hydrated state. */
export function resetRecordsStore(): void {
  useRecordsStore.setState({ ...useRecordsStore.getInitialState(), _hasHydrated: true }, true)
}
