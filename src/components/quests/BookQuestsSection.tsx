import { useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useStoryletStore } from '../../stores/storyletStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useProgressionStore } from '../../stores/progressionStore'
import { REVISION_QUESTS, suggestChapterQuests } from '../../lib/chapterQuests'
import { getWeaponMultiplier } from '../../lib/items'
import { estimateQuestCoins } from '../../lib/questRewards'
import { QuestCard } from './QuestCard'
import { EmptyState, SectionHeading } from './QuestUi'
import { acceptChapterQuest, acceptRevisionQuest, activeChapterStoryletIds } from './bookQuests'

/** Quest Board section: chapter quests generated from the open book, and revision quests. */
export function BookQuestsSection() {
  const storylets = useStoryletStore((s) => s.book?.storylets)
  const activeBoardQuests = useWriteathonStore((s) => s.activeBoardQuests)
  const weaponMultiplier = usePlayerStore((s) => getWeaponMultiplier(s.equippedWeapon))
  const revisedWords = useProgressionStore((s) => s.revisedWords)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const suggestions = useMemo(() => (storylets ? suggestChapterQuests(storylets) : []), [storylets])
  const underway = useMemo(() => activeBoardQuests.filter((q) => q.type === 'chapter' && !q.completedAt), [activeBoardQuests])
  const busyStorylets = useMemo(() => activeChapterStoryletIds(activeBoardQuests), [activeBoardQuests])
  const offered = suggestions.filter((s) => !busyStorylets.has(s.storyletId))

  async function run(key: string, start: () => Promise<void>) {
    if (accepting) return
    setAccepting(key)
    setError(null)
    try {
      await start()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the quest.')
    } finally {
      setAccepting(null)
    }
  }

  const coins = (wordGoal: number, questCoins: number) => estimateQuestCoins({ wordGoal, questCoins, weaponMultiplier })

  return (
    <section data-testid="book-quests">
      <SectionHeading
        title="From your book"
        subtitle="Goals for particular storylets — only words in that storylet count. Revision quests count words you rework."
      />
      {error && <p className="mb-3 rounded-lg border border-red-900/60 bg-red-950/60 px-3 py-1.5 text-sm text-red-200">{error}</p>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {underway.map((q) => (
          <QuestCard
            key={q.id}
            kind="chapter"
            title={q.title}
            description={q.description}
            wordGoal={q.wordGoal}
            coins={coins(q.wordGoal, q.coinReward)}
            status="accepted"
            tiltSeed={q.id}
          />
        ))}
        {offered.map((s) => (
          <QuestCard
            key={s.id}
            kind="chapter"
            title={s.title}
            description={s.description}
            wordGoal={s.wordGoal}
            coins={coins(s.wordGoal, s.coinReward)}
            status="available"
            accepting={accepting === s.id}
            tiltSeed={s.id}
            onAccept={() => void run(s.id, () => acceptChapterQuest(s))}
          />
        ))}
        {REVISION_QUESTS.map((r) => {
          const key = `revision:${r.wordGoal}`
          const active = activeBoardQuests.some((q) => q.type === 'revision' && q.wordGoal === r.wordGoal && !q.completedAt)
          return (
            <QuestCard
              key={key}
              kind="revision"
              title={r.title}
              description="Rework sentences you've already written. Typing new text at the end doesn't count."
              wordGoal={r.wordGoal}
              coins={coins(r.wordGoal, r.coinReward)}
              status={active ? 'accepted' : 'available'}
              accepting={accepting === key}
              tiltSeed={key}
              onAccept={() => void run(key, () => acceptRevisionQuest(r))}
            />
          )
        })}
      </div>
      {!storylets && (
        <div className="mt-4">
          <EmptyState icon={<BookOpen size={24} />} title="No book open">
            Open a book to get quests for its chapters.
          </EmptyState>
        </div>
      )}
      <p className="mt-3 text-xs text-stone-300/70">
        Lifetime revised words: <span className="tabular-nums text-stone-200">{revisedWords.toLocaleString()}</span>
      </p>
    </section>
  )
}
