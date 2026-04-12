import { useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import {
  PERMANENT_QUESTS,
  getDailyQuestTitle,
  getMilestoneReward,
  createBoardQuest,
} from '../../lib/writeathon'
import { fetchRandomImage } from '../../lib/unsplash'
import type { BoardQuest } from '../../types'
import { ParchmentCard } from './ParchmentCard'
import { WriteathonSetup } from './WriteathonSetup'

export function QuestBoardPanel() {
  const [setupOpen, setSetupOpen] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const villagerQuests = useWriteathonStore((s) => s.villagerQuests)
  const activeBoardQuests = useWriteathonStore((s) => s.activeBoardQuests)
  const dailyQuestAccepted = useWriteathonStore((s) => s.dailyQuestAccepted)

  const currentBlock = useWriteathonStore((s) => s.getCurrentBlock())
  const dailyTarget = useWriteathonStore((s) => s.getDailyTarget())

  async function handleAccept(quest: BoardQuest) {
    if (acceptingId) return
    setAcceptingId(quest.id)
    setAcceptError(null)
    try {
      const img = await fetchRandomImage()
      const sessionId = useImageRevealStore.getState().startSession(
        img.url,
        img.width,
        img.height,
        quest.wordGoal,
        img.photographer,
        img.photographerUrl,
        img.id,
        quest.timeMinutes,
      )
      if (sessionId === '') {
        setAcceptError('Quest capacity reached (25 active). Complete or abandon one first.')
        return
      }
      useWriteathonStore.getState().acceptBoardQuest(quest, sessionId)
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to fetch quest image.')
    } finally {
      setAcceptingId(null)
    }
  }

  function handleAcceptPermanent(pq: { wordGoal: number; title: string; coinReward: number }) {
    const quest = createBoardQuest('permanent', pq.wordGoal, {
      title: pq.title,
      coinReward: pq.coinReward,
    })
    void handleAccept(quest)
  }

  const dailyCompleted = milestones[currentBlock - 1]?.completed ?? false

  return (
    <div className="p-6">
        {/* Start Writeathon + errors */}
        <div className="text-center mb-6">
          {!config?.active && (
            <button
              onClick={() => setSetupOpen(true)}
              className="font-serif font-semibold px-6 py-2 rounded-lg border-2 border-amber-700 text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 hover:text-amber-200 hover:border-amber-600 transition-all text-sm tracking-wide shadow-md"
            >
              &#x2694; Start Writeathon
            </button>
          )}
          {acceptingId && (
            <p className="mt-3 text-amber-200 text-xs italic">Fetching quest image…</p>
          )}
          {acceptError && (
            <p className="mt-3 text-red-300 text-xs">{acceptError}</p>
          )}
        </div>

        {/* Daily Writeathon Quest */}
        <section className="mb-8">
          <h2 className="font-serif text-xl text-amber-200 mb-4">Today's Writeathon Quest</h2>
          {config?.active && !config?.completedAt ? (
            <ParchmentCard
              variant="daily"
              title={getDailyQuestTitle(currentBlock)}
              description={`Block ${currentBlock} of ${config.totalBlocks} — the journey continues...`}
              wordGoal={dailyTarget}
              coinReward={getMilestoneReward(currentBlock)}
              accepted={dailyQuestAccepted}
              completed={dailyCompleted}
              onAccept={
                !dailyQuestAccepted && !dailyCompleted
                  ? () => useWriteathonStore.getState().acceptDailyQuest()
                  : undefined
              }
            />
          ) : (
            <p className="italic text-amber-200 text-sm">
              No active writeathon. Start one from the Writeathon menu.
            </p>
          )}
        </section>

        {/* Permanent Quests */}
        <section className="mb-8">
          <h2 className="font-serif text-xl text-amber-200 mb-4">Apprentice Quests</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PERMANENT_QUESTS.map((pq) => {
              const isAccepted = activeBoardQuests.some(
                (q) => q.wordGoal === pq.wordGoal && q.type === 'permanent',
              )
              return (
                <ParchmentCard
                  key={pq.wordGoal}
                  variant="permanent"
                  title={pq.title}
                  description={`Complete a writing session of ${pq.wordGoal.toLocaleString()} words`}
                  wordGoal={pq.wordGoal}
                  coinReward={pq.coinReward}
                  accepted={isAccepted}
                  completed={false}
                  onAccept={!isAccepted ? () => handleAcceptPermanent(pq) : undefined}
                />
              )
            })}
          </div>
        </section>

        {/* Villager Requests */}
        <section className="mb-8">
          <h2 className="font-serif text-xl text-amber-200 mb-4">Villager Requests</h2>
          {villagerQuests.length === 0 ? (
            <p className="italic text-amber-200 text-sm">No villager requests pending.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {villagerQuests.map((quest) => {
                const isAccepted = activeBoardQuests.some((q) => q.id === quest.id && q.accepted)
                const isCompleted = !!quest.completedAt
                return (
                  <ParchmentCard
                    key={quest.id}
                    variant="villager"
                    title={quest.title}
                    description={quest.description}
                    wordGoal={quest.wordGoal}
                    timeMinutes={quest.timeMinutes}
                    coinReward={quest.coinReward}
                    bonusCoins={quest.bonusCoins}
                    accepted={isAccepted}
                    completed={isCompleted}
                    onAccept={
                      !isAccepted && !isCompleted
                        ? () => { void handleAccept(quest) }
                        : undefined
                    }
                  />
                )
              })}
            </div>
          )}
        </section>

        {/* Active Quests */}
        {activeBoardQuests.length > 0 && (
          <section>
            <h2 className="font-serif text-xl text-amber-200 mb-4">Active Quests</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBoardQuests
                .filter((q) => q.accepted && !q.completedAt)
                .map((quest) => (
                  <ParchmentCard
                    key={quest.id}
                    variant={quest.type}
                    title={quest.title}
                    description={quest.description}
                    wordGoal={quest.wordGoal}
                    timeMinutes={quest.timeMinutes}
                    coinReward={quest.coinReward}
                    bonusCoins={quest.bonusCoins}
                    accepted={true}
                    completed={false}
                  />
                ))}
            </div>
          </section>
        )}

      <WriteathonSetup open={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  )
}
