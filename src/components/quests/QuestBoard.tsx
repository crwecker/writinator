import { useEffect, useRef, useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import {
  PERMANENT_QUESTS,
  getDailyQuestTitle,
  getMilestoneReward,
  createBoardQuest,
} from '../../lib/writeathon'
import type { BoardQuest } from '../../types'
import { ParchmentCard } from './ParchmentCard'
import { WriteathonSetup } from './WriteathonSetup'

interface QuestBoardProps {
  open: boolean
  onClose: () => void
}

export function QuestBoard({ open, onClose }: QuestBoardProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [setupOpen, setSetupOpen] = useState(false)

  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const villagerQuests = useWriteathonStore((s) => s.villagerQuests)
  const activeBoardQuests = useWriteathonStore((s) => s.activeBoardQuests)
  const dailyQuestAccepted = useWriteathonStore((s) => s.dailyQuestAccepted)

  const currentBlock = useWriteathonStore((s) => s.getCurrentBlock())
  const dailyTarget = useWriteathonStore((s) => s.getDailyTarget())

  // Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Click outside
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open, onClose])

  if (!open) return null

  function handleAccept(quest: BoardQuest) {
    const sessionId = useImageRevealStore.getState().startSession(
      '',
      800,
      600,
      quest.wordGoal,
      undefined,
      undefined,
      undefined,
      quest.timeMinutes,
    )
    if (sessionId === '') return // capacity reached
    useWriteathonStore.getState().acceptBoardQuest(quest, sessionId)
  }

  function handleAcceptPermanent(pq: { wordGoal: number; title: string; coinReward: number }) {
    const quest = createBoardQuest('permanent', pq.wordGoal, {
      title: pq.title,
      coinReward: pq.coinReward,
    })
    handleAccept(quest)
  }

  const dailyCompleted = milestones[currentBlock - 1]?.completed ?? false

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div
        ref={panelRef}
        className="border-4 border-amber-950 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-8 relative"
        style={{
          background: 'linear-gradient(180deg, #3d2817 0%, #2a1a0d 100%)',
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(0,0,0,0.1) 0px, transparent 2px, transparent 80px, rgba(0,0,0,0.1) 82px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-amber-50 hover:text-amber-300 transition-colors text-xl font-bold w-8 h-8 flex items-center justify-center"
          title="Close"
        >
          &#x2715;
        </button>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-amber-50">Quest Board</h1>
          <p className="text-amber-300 text-sm mt-1">Adventurer's Guild</p>
          {!config?.active && (
            <button
              onClick={() => setSetupOpen(true)}
              className="mt-4 font-serif font-semibold px-6 py-2 rounded-lg border-2 border-amber-700 text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 hover:text-amber-200 hover:border-amber-600 transition-all text-sm tracking-wide shadow-md"
            >
              &#x2694; Start Writeathon
            </button>
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
                    onAccept={!isAccepted && !isCompleted ? () => handleAccept(quest) : undefined}
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
      </div>

      <WriteathonSetup open={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  )
}
