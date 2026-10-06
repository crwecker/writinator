import { useMemo } from 'react'
import { Lock } from 'lucide-react'
import { useProgressionStore, achievementContextFrom } from '../../stores/progressionStore'
import { useStreakStore } from '../../stores/streakStore'
import { achievementStatuses, type AchievementStatus } from '../../lib/achievements'
import { AUTHOR_TITLES } from '../../lib/progression'
import { countBySource, GALLERY_SET_BONUS, GALLERY_SET_SIZE, GALLERY_SETS } from '../../lib/gallerySets'
import { todayKey } from '../../lib/metrics'
import { CoinAmount, QuestProgress, SectionHeading } from './QuestUi'
import { useAuthorLevel } from './useAuthorLevel'

function LevelCard() {
  const info = useAuthorLevel()
  const into = info.xp - info.levelStartXp
  const span = info.nextLevelXp - info.levelStartXp
  return (
    <section className="rounded-2xl border border-amber-800/50 bg-gradient-to-br from-stone-900 to-stone-950 p-5 shadow-lg">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-700 font-serif text-3xl font-bold text-stone-950 shadow-[0_0_30px_-6px_rgba(251,191,36,0.7)]">
          {info.level}
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-500/80">Author level {info.level}</p>
          <h2 className="font-serif text-3xl font-bold text-amber-50">{info.title}</h2>
          <div className="mt-3">
            <QuestProgress value={into} max={span} />
          </div>
          <p className="mt-1.5 text-xs text-stone-400">
            <span className="tabular-nums text-stone-200">{info.xp.toLocaleString()}</span> lifetime words ·{' '}
            <span className="tabular-nums">{(info.nextLevelXp - info.xp).toLocaleString()}</span> to level {info.level + 1}
            {info.nextTitle && (
              <>
                {' '}· <span className="text-amber-200/80">{info.nextTitle.title}</span> at level {info.nextTitle.level}
              </>
            )}
          </p>
        </div>
      </div>
      <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Titles">
        {AUTHOR_TITLES.map((t) => {
          const reached = info.level >= t.level
          return (
            <li
              key={t.level}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                reached ? 'border-amber-600/60 bg-amber-500/10 text-amber-200' : 'border-stone-700 text-stone-500'
              }`}
            >
              {t.title} <span className="tabular-nums opacity-70">· {t.level}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function AchievementTile({ status }: { status: AchievementStatus }) {
  const { def, value, unlocked, unlockedAt } = status
  return (
    <article
      data-testid={`achievement-${def.id}`}
      data-unlocked={unlocked ? 'true' : 'false'}
      className={`flex gap-3 rounded-xl border p-3 ${
        unlocked
          ? 'border-amber-700/60 bg-gradient-to-br from-amber-950/50 to-stone-900/90 shadow-[0_0_18px_-8px_rgba(251,191,36,0.6)]'
          : 'border-stone-800 bg-stone-900/70'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl ${unlocked ? 'bg-amber-500/15' : 'bg-stone-800 grayscale opacity-50'}`}
      >
        {unlocked ? def.icon : <Lock size={16} className="text-stone-500" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`font-serif text-sm font-semibold leading-tight ${unlocked ? 'text-amber-100' : 'text-stone-300'}`}>{def.name}</h3>
          <CoinAmount amount={def.coins} className={`text-[11px] ${unlocked ? '' : 'opacity-60'}`} />
        </div>
        <p className="mt-0.5 text-xs leading-snug text-stone-400">{def.description}</p>
        {unlocked ? (
          <p className="mt-1.5 text-[11px] text-emerald-300/80">
            Unlocked{unlockedAt ? ` ${new Date(unlockedAt).toLocaleDateString()}` : ''}
          </p>
        ) : def.target > 1 ? (
          <div className="mt-2 flex items-center gap-2">
            <QuestProgress value={value} max={def.target} size="sm" tone="emerald" />
            <span className="shrink-0 text-[10px] tabular-nums text-stone-500">
              {Math.min(value, def.target).toLocaleString()}/{def.target.toLocaleString()}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function GallerySets() {
  const reveals = useProgressionStore((s) => s.reveals)
  const completedSets = useProgressionStore((s) => s.completedSets)
  const counts = useMemo(() => countBySource(reveals.map((r) => r.source)), [reveals])
  return (
    <section>
      <SectionHeading
        title="Gallery sets"
        subtitle={`Reveal ${GALLERY_SET_SIZE} pictures from one source for a ${GALLERY_SET_BONUS}-coin bonus and a new frame.`}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GALLERY_SETS.map((set) => {
          const done = completedSets[set.source] !== undefined
          return (
            <div key={set.source} data-testid={`gallery-set-${set.source}`} className="rounded-xl border border-stone-800 bg-stone-900/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-sm font-semibold text-amber-100">{set.label}</span>
                <span className="text-[11px] tabular-nums text-stone-400">
                  {Math.min(counts[set.source], GALLERY_SET_SIZE)}/{GALLERY_SET_SIZE}
                </span>
              </div>
              <div className="mt-2">
                <QuestProgress value={counts[set.source]} max={GALLERY_SET_SIZE} size="sm" />
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className={`inline-block h-4 w-5 rounded-sm border-2 bg-stone-800 ${done ? set.frameClass : 'border-stone-700'}`} />
                <span className={done ? 'text-amber-200' : 'text-stone-500'}>
                  {set.frameName} frame{done ? '' : ' (locked)'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Hall tab: author level, achievements and gallery sets. */
export function HallPanel() {
  const progression = useProgressionStore()
  const dailyWords = useStreakStore((s) => s.dailyWords)
  const longestStreak = useStreakStore((s) => s.longestStreak)
  const statuses = useMemo(
    () => achievementStatuses(achievementContextFrom(progression, { dailyWords, longestStreak }), progression.unlocked),
    [progression, dailyWords, longestStreak],
  )
  const unlockedCount = statuses.filter((s) => s.unlocked).length
  const revisedToday = progression.revisedByDay[todayKey()] ?? 0

  return (
    <div className="relative space-y-8 p-6">
      <LevelCard />

      <section>
        <SectionHeading
          title="Achievements"
          subtitle={`${unlockedCount} of ${statuses.length} unlocked`}
          action={
            <span className="text-xs text-stone-400">
              Revised: <span className="tabular-nums text-stone-200">{progression.revisedWords.toLocaleString()}</span> words
              {revisedToday > 0 && <> (<span className="tabular-nums">{revisedToday.toLocaleString()}</span> today)</>}
            </span>
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {statuses.map((s) => (
            <AchievementTile key={s.def.id} status={s} />
          ))}
        </div>
      </section>

      <GallerySets />
    </div>
  )
}
