import type { ReactNode } from 'react'
import { BookOpen, Clock, Feather, Loader2, PenLine, Scissors, ScrollText, Sun } from 'lucide-react'
import type { QuestDifficulty } from '../../types'
import { DIFFICULTY_STYLES, formatCoinRange, formatMinutes } from './questStyles'

export type QuestCardKind = 'daily' | 'permanent' | 'villager' | 'chapter' | 'revision'
export type QuestCardStatus = 'available' | 'accepted' | 'done'

const KIND_META: Record<QuestCardKind, { label: string; icon: ReactNode }> = {
  daily: { label: 'Writeathon', icon: <Sun size={12} /> },
  permanent: { label: 'Guild contract', icon: <Feather size={12} /> },
  villager: { label: 'Villager request', icon: <ScrollText size={12} /> },
  chapter: { label: 'From your book', icon: <BookOpen size={12} /> },
  revision: { label: 'Revision', icon: <Scissors size={12} /> },
}

interface QuestCardProps {
  kind: QuestCardKind
  title: string
  description?: string
  wordGoal: number
  timeMinutes?: number
  difficulty?: QuestDifficulty
  coins: { min: number; max: number }
  status: QuestCardStatus
  accepting?: boolean
  /** Shown only while the quest is available. */
  timerPicker?: ReactNode
  onAccept?: () => void
  /** Extra controls in the footer (e.g. retract a request). */
  footerExtra?: ReactNode
  /** Small hash-based tilt so the board looks hand-pinned. */
  tiltSeed?: string
}

function tiltFor(seed: string | undefined): number {
  if (!seed) return 0
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return ((Math.abs(h) % 21) - 10) / 10 // -1.0° … +1.0°
}

/** A quest pinned to the guild board: parchment card with goal, timer and reward. */
export function QuestCard({
  kind,
  title,
  description,
  wordGoal,
  timeMinutes,
  difficulty,
  coins,
  status,
  accepting = false,
  timerPicker,
  onAccept,
  footerExtra,
  tiltSeed,
}: QuestCardProps) {
  const meta = KIND_META[kind]
  const tilt = tiltFor(tiltSeed ?? title)

  return (
    <article
      className="group relative flex flex-col rounded-md px-4 pb-4 pt-5 text-stone-800 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.85)] transition-transform duration-200 hover:-translate-y-0.5 hover:rotate-0"
      style={{
        transform: `rotate(${tilt}deg)`,
        background:
          'radial-gradient(120% 90% at 20% 0%, #fbf3dc 0%, #f1e2bd 55%, #e3cc98 100%)',
        boxShadow:
          'inset 0 0 0 1px rgba(120, 80, 30, 0.25), inset 0 0 28px rgba(140, 95, 40, 0.25), 0 10px 24px -10px rgba(0,0,0,0.85)',
      }}
    >
      {/* Pin */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1.5 h-3 w-3 -translate-x-1/2 rounded-full bg-gradient-to-b from-red-500 to-red-800 shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
      />

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900/70">
          {meta.icon}
          {meta.label}
        </span>
        {difficulty && (
          <span
            className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${DIFFICULTY_STYLES[difficulty].className}`}
          >
            {DIFFICULTY_STYLES[difficulty].label}
          </span>
        )}
      </div>

      <h3 className={`font-serif font-bold leading-snug text-stone-900 ${kind === 'daily' ? 'text-xl' : 'text-lg'}`}>
        {title}
      </h3>
      {description && (
        <p className={`mt-1 text-[13px] leading-snug text-stone-700 ${kind === 'villager' ? 'italic' : ''}`}>
          {description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-stone-700">
        <span className="inline-flex items-center gap-1">
          <PenLine size={12} />
          {wordGoal.toLocaleString()} {kind === 'revision' ? 'revised words' : kind === 'chapter' ? 'words in this storylet' : 'words'}
        </span>
        {timeMinutes !== undefined && (
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {formatMinutes(timeMinutes)}
          </span>
        )}
      </div>

      {status === 'available' && timerPicker && <div className="mt-3">{timerPicker}</div>}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="inline-flex items-baseline gap-1 font-serif text-base font-bold text-amber-800" title="Coins paid on completion">
          {formatCoinRange(coins)}
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wide text-amber-800/70">coins</span>
        </span>
        <div className="flex items-center gap-2">
          {footerExtra}
          {status === 'available' && onAccept && (
            <button
              type="button"
              onClick={onAccept}
              disabled={accepting}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-red-700 to-red-900 px-3.5 py-1.5 text-sm font-semibold text-amber-50 shadow-[0_2px_0_rgba(60,10,10,0.8)] transition-colors hover:from-red-600 hover:to-red-800 disabled:opacity-60"
            >
              {accepting && <Loader2 size={13} className="animate-spin" />}
              {accepting ? 'Preparing…' : 'Accept'}
            </button>
          )}
          {status === 'accepted' && (
            <span className="rounded-md border border-emerald-800/40 bg-emerald-900/10 px-2.5 py-1 text-xs font-semibold text-emerald-900">
              In progress
            </span>
          )}
        </div>
      </div>

      {status === 'done' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="wax-seal-stamp flex h-20 w-20 -rotate-12 items-center justify-center rounded-full border-4 border-red-900 bg-red-700 font-serif text-sm font-bold uppercase tracking-wider text-red-50 shadow-xl">
            Done
          </div>
        </div>
      )}
    </article>
  )
}
