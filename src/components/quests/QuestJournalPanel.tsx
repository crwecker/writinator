import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookOpen, ExternalLink, Image as ImageIcon, X } from 'lucide-react'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useProgressionStore } from '../../stores/progressionStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { GALLERY_SET_SIZE, GALLERY_SETS, gallerySetMeta, inferPictureSource, type PictureSource } from '../../lib/gallerySets'
import { getWeaponMultiplier } from '../../lib/items'
import { estimateSessionCoins, sessionDifficulty } from '../../lib/questRewards'
import type { ImageRevealSession } from '../../types'
import { CollapsedThumbnail } from './ImageRevealCanvases'
import { SessionTimer } from './ImageRevealWidgets'
import { CoinAmount, DifficultyBadge, EmptyState, GuildButton, QuestProgress, SectionHeading } from './QuestUi'
import { formatCoinRange } from './questStyles'
import { useSessionImages } from './useSessionImages'
import { useGalleryFrameClass } from '../../stores/cosmeticsStore'

function boardCoinsFor(quest: { coinReward: number; bonusCoins?: number } | undefined): number {
  return quest ? quest.coinReward + (quest.bonusCoins ?? 0) : 0
}

function sessionTitle(session: ImageRevealSession): string {
  return session.title ?? `${session.wordGoal.toLocaleString()}-word quest`
}

function ActiveQuestCard({
  session,
  image,
  questCoins,
}: {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
  questCoins: number
}) {
  const [confirming, setConfirming] = useState(false)
  const isPaused = useImageRevealStore((s) => s.isPaused)
  const pauseStartedAt = useImageRevealStore((s) => s.pauseStartedAt)
  const weaponMultiplier = usePlayerStore((s) => getWeaponMultiplier(s.equippedWeapon))
  const remaining = Math.max(session.wordGoal - session.wordsWritten, 0)
  const pct = Math.round(Math.min(session.wordsWritten / session.wordGoal, 1) * 100)
  const coins = estimateSessionCoins(session, weaponMultiplier, questCoins)

  return (
    <article className="flex gap-4 rounded-xl border border-stone-700/70 bg-stone-900/85 p-3 shadow-lg">
      <div className="relative shrink-0 overflow-hidden rounded-lg ring-1 ring-black/50">
        {image ? (
          <CollapsedThumbnail session={session} image={image} size={104} className="" />
        ) : (
          <div className="h-[104px] w-[104px] animate-pulse bg-stone-800" />
        )}
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold tabular-nums text-amber-100">
          {pct}%
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-serif text-lg font-semibold text-amber-50">{sessionTitle(session)}</h3>
          {session.timeMinutes !== undefined && (
            <DifficultyBadge difficulty={sessionDifficulty({ ...session, timeMinutes: session.timeMinutes })} />
          )}
        </div>
        <TrackedHint session={session} />
        <div className="mt-2">
          <QuestProgress value={session.wordsWritten} max={session.wordGoal} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400">
          <span className="tabular-nums">
            <span className="text-stone-200">{session.wordsWritten.toLocaleString()}</span> / {session.wordGoal.toLocaleString()} words
          </span>
          <span className="tabular-nums">{remaining.toLocaleString()} to go</span>
          {session.timeMinutes !== undefined && (
            <SessionTimer session={session} isPaused={isPaused} pauseStartedAt={pauseStartedAt} compact />
          )}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <CoinAmount amount={formatCoinRange(coins)} className="text-sm font-semibold" />
          {confirming ? (
            <span className="flex items-center gap-2 text-xs text-stone-300">
              Give up this quest?
              <GuildButton variant="danger" className="px-2 py-0.5 text-xs" onClick={() => useImageRevealStore.getState().abandonSession(session.id)}>
                Abandon
              </GuildButton>
              <GuildButton variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setConfirming(false)}>
                Keep going
              </GuildButton>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="text-xs text-stone-500 hover:text-red-300">
              Abandon
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/** What a chapter or revision quest measures (they don't progress on general typing). */
function TrackedHint({ session }: { session: ImageRevealSession }) {
  const tracking = useProgressionStore((s) => s.tracked[session.id])
  const storyletName = useStoryletStore((s) =>
    tracking?.kind === 'storylet' ? s.book?.storylets.find((st) => st.id === tracking.storyletId)?.name : undefined,
  )
  if (session.progressSource === 'revision') {
    return <p className="mt-0.5 text-[11px] text-sky-300/80">Counts words you revise in existing text</p>
  }
  if (session.progressSource === 'storylet') {
    return (
      <p className="mt-0.5 truncate text-[11px] text-emerald-300/80">
        Counts words in {storyletName ? `“${storyletName}”` : 'its storylet'}
      </p>
    )
  }
  return null
}

const RESULT_BADGE: Record<NonNullable<ImageRevealSession['result']>, { label: string; className: string }> = {
  success: { label: 'Revealed', className: 'bg-emerald-900/80 text-emerald-200' },
  failure: { label: "Time's up", className: 'bg-orange-950/80 text-orange-200' },
  abandoned: { label: 'Abandoned', className: 'bg-stone-800/90 text-stone-300' },
}

function GalleryItem({
  session,
  onOpen,
  frameClass,
  defaultFrameClass,
}: {
  session: ImageRevealSession
  onOpen: () => void
  /** A completed set's frame (border colour + glow); wins over the bought frame. */
  frameClass?: string
  /** The frame chosen in the Armory (full border classes). */
  defaultFrameClass: string
}) {
  const result = session.result ?? 'success'
  const badge = RESULT_BADGE[result]
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative aspect-[4/3] overflow-hidden rounded-lg ${frameClass ? `border-4 ${frameClass}` : `${defaultFrameClass} shadow-[0_6px_16px_-6px_rgba(0,0,0,0.9)]`} bg-stone-900 outline-none ring-amber-400 transition-transform hover:-translate-y-0.5 focus-visible:ring-2`}
    >
      <img
        src={session.imageUrl}
        alt={sessionTitle(session)}
        crossOrigin="anonymous"
        loading="lazy"
        className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${result === 'success' ? '' : 'blur-[2px] grayscale'}`}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-left">
        <p className="truncate font-serif text-sm text-amber-50">{sessionTitle(session)}</p>
        <div className="flex items-center justify-between text-[10px]">
          <span className={`rounded px-1 py-px font-semibold ${badge.className}`}>{badge.label}</span>
          {session.coinsEarned ? <CoinAmount amount={`+${session.coinsEarned}`} /> : null}
        </div>
      </div>
    </button>
  )
}

function Lightbox({ session, onClose }: { session: ImageRevealSession; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6" onMouseDown={onClose}>
      <figure
        className="max-h-full max-w-3xl overflow-hidden rounded-xl border border-stone-700 bg-stone-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img src={session.imageUrl} alt={sessionTitle(session)} crossOrigin="anonymous" className="max-h-[60vh] w-full object-contain bg-black" />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-stone-200 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <figcaption className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-serif text-lg text-amber-50">{sessionTitle(session)}</p>
            <p className="text-xs text-stone-400">
              {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()} words
              {session.completedAt && <> · {new Date(session.completedAt).toLocaleDateString()}</>}
              {session.photographer ? (
                <>
                  {' · Photo by '}
                  <a href={session.photographerUrl} target="_blank" rel="noopener noreferrer" className="text-stone-300 underline hover:text-white">
                    {session.photographer}
                  </a>
                  {' on Unsplash'}
                </>
              ) : session.imageUrl.startsWith('data:image/svg') ? (
                ' · Generated scene'
              ) : (
                ' · Your picture'
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {session.coinsEarned ? <CoinAmount amount={`+${session.coinsEarned.toLocaleString()}`} className="font-semibold" /> : null}
            {session.unsplashId && (
              <a
                href={`https://unsplash.com/photos/${session.unsplashId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-200"
              >
                Unsplash <ExternalLink size={11} />
              </a>
            )}
          </div>
        </figcaption>
      </figure>
    </div>
  )
}

function SetChip({ active, done = false, onClick, children }: { active: boolean; done?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        active
          ? 'border-amber-500 bg-amber-500/15 text-amber-100'
          : done
            ? 'border-amber-700/60 text-amber-200/90 hover:border-amber-500'
            : 'border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200'
      }`}
    >
      {done && <span aria-hidden="true">✦ </span>}
      {children}
    </button>
  )
}

/** Journal tab: quests in progress and the gallery of revealed images. */
export function QuestJournalPanel({ onFindQuests }: { onFindQuests: () => void }) {
  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const completedSessions = useImageRevealStore((s) => s.completedSessions)
  const activeBoardQuests = useWriteathonStore((s) => s.activeBoardQuests)
  const boughtFrameClass = useGalleryFrameClass()
  const images = useSessionImages(activeSessions)
  const [viewing, setViewing] = useState<string | null>(null)
  const [setFilter, setSetFilter] = useState<PictureSource | null>(null)
  const reveals = useProgressionStore((s) => s.reveals)
  const sourceByUrl = useProgressionStore((s) => s.sourceByUrl)
  const completedSets = useProgressionStore((s) => s.completedSets)
  const sourceOf = useMemo(() => {
    const byId = new Map(reveals.map((r) => [r.id, r.source]))
    return (session: ImageRevealSession): PictureSource =>
      byId.get(session.id) ?? inferPictureSource(session.imageUrl, sourceByUrl[session.imageUrl])
  }, [reveals, sourceByUrl])
  const setCounts = useMemo(() => {
    const counts = new Map<PictureSource, number>()
    for (const r of reveals) counts.set(r.source, (counts.get(r.source) ?? 0) + 1)
    return counts
  }, [reveals])

  // Newest first, whatever order the store keeps them in.
  const gallery = useMemo(
    () =>
      [...completedSessions].sort(
        (a, b) => Date.parse(b.completedAt ?? b.startedAt) - Date.parse(a.completedAt ?? a.startedAt),
      ),
    [completedSessions],
  )
  const revealedCount = completedSessions.filter((s) => (s.result ?? 'success') === 'success').length
  const viewingSession = viewing ? completedSessions.find((s) => s.id === viewing) : undefined

  return (
    <div className="relative space-y-8 p-6">
      <section>
        <SectionHeading
          title="In progress"
          subtitle={
            activeSessions.length === 0
              ? undefined
              : activeSessions.some((s) => s.progressSource)
                ? 'Your writing counts toward these at once. Chapter and revision quests count only their own words.'
                : 'Every word you write counts toward all of these at once.'
          }
        />
        {activeSessions.length === 0 ? (
          <EmptyState icon={<BookOpen size={28} />} title="No quests underway">
            <p>Accept a quest and its picture will sharpen as you write.</p>
            <GuildButton className="mt-4" onClick={onFindQuests}>Find a quest</GuildButton>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {activeSessions.map((session) => (
              <ActiveQuestCard
                key={session.id}
                session={session}
                image={images[session.id]}
                questCoins={session.boardCoins ?? boardCoinsFor(activeBoardQuests.find((q) => q.imageRevealSessionId === session.id))}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading
          title="Gallery"
          subtitle={
            completedSessions.length > 0
              ? `${revealedCount} picture${revealedCount === 1 ? '' : 's'} revealed`
              : undefined
          }
        />
        {gallery.length === 0 ? (
          <EmptyState icon={<ImageIcon size={28} />} title="Your gallery is empty">
            Finished quests hang here.
          </EmptyState>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Gallery sets">
              <SetChip active={setFilter === null} onClick={() => setSetFilter(null)}>All</SetChip>
              {GALLERY_SETS.filter((g) => (setCounts.get(g.source) ?? 0) > 0 || completedSets[g.source]).map((g) => (
                <SetChip key={g.source} active={setFilter === g.source} done={!!completedSets[g.source]} onClick={() => setSetFilter(g.source)}>
                  {g.label}{' '}
                  <span className="tabular-nums opacity-70">
                    {Math.min(setCounts.get(g.source) ?? 0, GALLERY_SET_SIZE)}/{GALLERY_SET_SIZE}
                  </span>
                </SetChip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {gallery
                .filter((session) => setFilter === null || sourceOf(session) === setFilter)
                .map((session) => {
                  const source = sourceOf(session)
                  const framed = completedSets[source] && (session.result ?? 'success') === 'success'
                  return (
                    <GalleryItem
                      key={session.id}
                      session={session}
                      frameClass={framed ? gallerySetMeta(source).frameClass : undefined}
                      defaultFrameClass={boughtFrameClass}
                      onOpen={() => setViewing(session.id)}
                    />
                  )
                })}
            </div>
          </>
        )}
      </section>

      {viewingSession && <Lightbox session={viewingSession} onClose={() => setViewing(null)} />}
    </div>
  )
}
