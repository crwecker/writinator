import { useMemo } from 'react'
import { Flag, Pause, Trophy } from 'lucide-react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { countWords } from '../../lib/words'
import { dayStatusOf, getDailyQuestTitle, getWriteathonToday } from '../../lib/writeathon'
import { formatDayLabel } from '../../lib/days'
import type { MilestoneTier } from '../../types'
import { CoinAmount, GuildButton, QuestProgress } from './QuestUi'

const TIER_DOT: Record<MilestoneTier, string> = {
  apprentice: 'bg-emerald-400',
  journeyman: 'bg-sky-400',
  master: 'bg-fuchsia-400',
  legendary: 'bg-amber-300',
}

interface WriteathonBannerProps {
  onManage: () => void
}

/** Top-of-board banner: pitch a writeathon, or show today's date, its target and the journey so far. */
export function WriteathonBanner({ onManage }: WriteathonBannerProps) {
  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const book = useStoryletStore((s) => s.book)

  const bookWords = useMemo(
    () => book?.storylets.reduce((sum, s) => sum + countWords(s.content), 0) ?? 0,
    [book],
  )

  const shell =
    'relative overflow-hidden rounded-2xl border border-amber-800/50 bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950/70 p-5 shadow-xl'

  if (!config?.active) {
    return (
      <section className={shell}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
            <Flag size={26} />
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-2xl font-semibold text-amber-100">Start a Writeathon</h2>
            <p className="mt-1 max-w-xl text-sm text-stone-300">
              Pick a finishing word count and how many days you have, starting today. Each day
              you hit that day's target pays out, with bigger rewards as you climb from
              Apprentice to Legendary. Miss a day and the words just spread over the days left.
            </p>
          </div>
          <GuildButton onClick={onManage} className="shrink-0 px-5 py-2">
            Plan a writeathon
          </GuildButton>
        </div>
      </section>
    )
  }

  const today = getWriteathonToday(config, milestones, bookWords)
  const finished = today.phase === 'complete'
  const over = today.phase === 'over'
  const paidCount = milestones.filter((m) => m.completed).length
  const missedCount = milestones.filter((_, i) => dayStatusOf(milestones, i, today.index) === 'missed').length
  const dayNumber = Math.min(Math.max(today.index + 1, 1), config.totalBlocks)
  const todayDay = today.phase === 'active' ? milestones[today.index] : undefined
  const overallPct = config.targetWordCount > config.startingWordCount
    ? Math.round(Math.min(1, Math.max(0, (bookWords - config.startingWordCount) / (config.targetWordCount - config.startingWordCount))) * 100)
    : 0

  const heading = finished
    ? 'Writeathon complete!'
    : over
      ? 'The writeathon has ended'
      : getDailyQuestTitle(dayNumber)

  return (
    <section className={shell}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400/80">
            {finished ? <Trophy size={13} /> : <Flag size={13} />}
            {finished || over
              ? `Writeathon · ${paidCount} of ${config.totalBlocks} days hit`
              : `${formatDayLabel(today.date)} · Day ${dayNumber} of ${config.totalBlocks}`}
            {config.paused && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-stone-800 px-2 py-0.5 text-stone-300">
                <Pause size={10} /> Paused
              </span>
            )}
          </div>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-amber-100">{heading}</h2>

          {todayDay && !config.paused && (
            <div className="mt-4 max-w-xl">
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-stone-300">
                  {today.paid ? (
                    <span className="font-semibold text-emerald-300">Today's target met</span>
                  ) : (
                    <>
                      <span className="font-semibold tabular-nums text-amber-100">
                        {Math.min(today.written, today.target).toLocaleString()}
                      </span>{' '}
                      / {today.target.toLocaleString()} words today
                    </>
                  )}
                </span>
                <CoinAmount amount={todayDay.coinsAwarded.toLocaleString()} className="text-sm font-semibold" />
              </div>
              <QuestProgress value={today.paid ? 1 : today.written} max={today.paid ? 1 : today.target} tone={today.paid ? 'emerald' : 'amber'} />
            </div>
          )}

          {over && (
            <p className="mt-3 max-w-xl text-sm text-stone-300">
              Your book reached {bookWords.toLocaleString()} of {config.targetWordCount.toLocaleString()} words.
              Start another when you're ready.
            </p>
          )}

          {/* Journey: one dot per calendar date */}
          <div className="mt-4 flex flex-wrap items-center gap-1" aria-label={`${overallPct}% of the way to ${config.targetWordCount.toLocaleString()} words`}>
            {milestones.map((m, i) => {
              const status = dayStatusOf(milestones, i, today.index)
              const label = `${formatDayLabel(m.date)} · Day ${i + 1}: ${
                status === 'paid' ? `target met, ${m.coinsAwarded} coins` : status === 'missed' ? 'missed' : status === 'today' ? 'today' : `${m.coinsAwarded} coins`
              }`
              return (
                <span
                  key={m.blockNumber}
                  title={label}
                  className={`h-2.5 w-2.5 rounded-full transition-all ${
                    status === 'paid'
                      ? TIER_DOT[m.tier]
                      : status === 'today'
                        ? `${TIER_DOT[m.tier]} ${config.paused ? 'opacity-60' : 'animate-pulse'} ring-2 ring-amber-200/60`
                        : status === 'missed'
                          ? 'bg-stone-800 ring-1 ring-inset ring-stone-700/60'
                          : 'bg-stone-700'
                  }`}
                />
              )
            })}
            <span className="ml-2 text-xs tabular-nums text-stone-400">{overallPct}% of words</span>
          </div>
          {!finished && !over && !config.paused && (
            <p className="mt-2 text-xs text-stone-500">
              {paidCount} paid{missedCount > 0 ? ` · ${missedCount} missed (no penalty)` : ''} · today's target spreads the
              words left over the {today.remainingDays} day{today.remainingDays === 1 ? '' : 's'} remaining, and pays out as soon as you reach it.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-row gap-2 lg:flex-col lg:items-stretch">
          <GuildButton variant="secondary" onClick={onManage}>
            {finished || over ? 'Start another' : 'Manage'}
          </GuildButton>
        </div>
      </div>
    </section>
  )
}
