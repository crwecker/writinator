import { useMemo } from 'react'
import { Flag, Pause, Trophy } from 'lucide-react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { countWords } from '../../lib/words'
import { getDailyQuestTitle, getMilestoneReward } from '../../lib/writeathon'
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

/** Top-of-board banner: pitch a writeathon, or show today's block and the journey so far. */
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
              Pick a finishing word count and how many writing days you have. Each day you reach
              your target pays out, with bigger rewards and bonuses as you climb from Apprentice
              to Legendary.
            </p>
          </div>
          <GuildButton onClick={onManage} className="shrink-0 px-5 py-2">
            Plan a writeathon
          </GuildButton>
        </div>
      </section>
    )
  }

  const completed = milestones.filter((m) => m.completed)
  const finished = !!config.completedAt
  const current = milestones.find((m) => !m.completed)
  const blockNumber = current?.blockNumber ?? config.totalBlocks
  const base = completed.at(-1)?.targetWordCount ?? config.startingWordCount
  const blockTarget = current ? current.targetWordCount - base : 0
  const writtenToday = Math.max(0, bookWords - base)
  const overallPct = Math.round((completed.length / config.totalBlocks) * 100)

  return (
    <section className={shell}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400/80">
            {finished ? <Trophy size={13} /> : <Flag size={13} />}
            Writeathon · Day {Math.min(blockNumber, config.totalBlocks)} of {config.totalBlocks}
            {config.paused && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-stone-800 px-2 py-0.5 text-stone-300">
                <Pause size={10} /> Paused
              </span>
            )}
          </div>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-amber-100">
            {finished ? 'Writeathon complete!' : getDailyQuestTitle(blockNumber)}
          </h2>

          {!finished && current && (
            <div className="mt-4 max-w-xl">
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-stone-300">
                  <span className="font-semibold tabular-nums text-amber-100">
                    {Math.min(writtenToday, blockTarget).toLocaleString()}
                  </span>{' '}
                  / {blockTarget.toLocaleString()} words today
                </span>
                <CoinAmount amount={getMilestoneReward(blockNumber).toLocaleString()} className="text-sm font-semibold" />
              </div>
              <QuestProgress value={writtenToday} max={blockTarget} />
            </div>
          )}

          {/* Journey: one dot per writing day, coloured by tier */}
          <div className="mt-4 flex flex-wrap items-center gap-1" aria-label={`${overallPct}% of the writeathon complete`}>
            {milestones.map((m) => {
              const isCurrent = !m.completed && m.blockNumber === blockNumber
              return (
                <span
                  key={m.blockNumber}
                  title={`Day ${m.blockNumber}: ${m.targetWordCount.toLocaleString()} words · ${m.coinsAwarded} coins`}
                  className={`h-2.5 w-2.5 rounded-full transition-all ${
                    m.completed
                      ? TIER_DOT[m.tier]
                      : isCurrent
                        ? `${TIER_DOT[m.tier]} animate-pulse ring-2 ring-amber-200/60`
                        : 'bg-stone-700'
                  }`}
                />
              )
            })}
            <span className="ml-2 text-xs tabular-nums text-stone-400">{overallPct}%</span>
          </div>
          {!finished && !config.paused && (
            <p className="mt-2 text-xs text-stone-500">Rewards pay out automatically when your book reaches each day's target.</p>
          )}
        </div>

        <div className="flex shrink-0 flex-row gap-2 lg:flex-col lg:items-stretch">
          <GuildButton variant="secondary" onClick={onManage}>
            {finished ? 'Start another' : 'Manage'}
          </GuildButton>
        </div>
      </div>
    </section>
  )
}
