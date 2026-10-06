import type { ReactNode } from 'react'
import { Clock, Coins, Feather, ScrollText, Trophy, X } from 'lucide-react'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import type { RecordBreak } from '../../stores/recordsStore'
import { formatDuration } from '../../lib/records'
import { useSessionRecapStore } from './sessionRecap'
import { GuildButton } from './QuestUi'

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-serif text-xl font-semibold tabular-nums text-amber-50">{value}</div>
    </div>
  )
}

function recordText(r: RecordBreak): string {
  const words = `${r.value.toLocaleString()} words`
  switch (r.kind) {
    case 'day': return `Best day: ${words}`
    case 'week': return `Best week: ${words}`
    case 'session': return `Biggest session: ${words}`
    case 'streak': return `Longest streak: ${r.value.toLocaleString()} days`
    case 'fastest500': return `Fastest 500 words: ${formatDuration(r.value)}`
  }
}

/**
 * End-of-session card: shown after 10 idle minutes of writing or when the book
 * is closed. Quiet mode keeps only the writing numbers.
 */
export function SessionRecapCard() {
  const recap = useSessionRecapStore((s) => s.recap)
  const quiet = useGameSettingsStore((s) => s.quietMode)
  if (!recap) return null

  const dismiss = () => useSessionRecapStore.getState().dismiss()

  return (
    <div
      role="dialog"
      aria-label="Session recap"
      className="fixed bottom-12 left-4 z-40 w-72 animate-fade-in overflow-hidden rounded-xl border border-amber-900/60 bg-stone-950 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2 border-b border-stone-800 bg-gradient-to-b from-stone-900 to-stone-950 px-4 pb-2 pt-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-amber-100">Session recap</h3>
          <p className="text-xs text-stone-400">
            {recap.reason === 'close' ? 'Book closed. Here is how it went.' : 'You stepped away. Here is how it went.'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-200"
          aria-label="Close recap"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <Stat icon={<Feather size={11} />} label="Words" value={recap.words.toLocaleString()} />
        <Stat icon={<Clock size={11} />} label="Minutes active" value={recap.minutesActive.toLocaleString()} />
        {!quiet && (
          <>
            <Stat icon={<ScrollText size={11} />} label="Quests done" value={recap.questsFinished.toLocaleString()} />
            <Stat icon={<Coins size={11} />} label="Coins earned" value={recap.coinsEarned.toLocaleString()} />
          </>
        )}
      </div>
      {recap.records.length > 0 && (
        <div className="mx-3 mb-3 rounded-lg border border-amber-700/50 bg-amber-500/10 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
            <Trophy size={11} />
            Personal best
          </div>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-50">
            {recap.records.map((r) => (
              <li key={`${r.kind}-${r.periodKey}`}>{recordText(r)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="px-3 pb-3">
        <GuildButton variant="secondary" className="w-full" onClick={dismiss}>
          Done
        </GuildButton>
      </div>
    </div>
  )
}
