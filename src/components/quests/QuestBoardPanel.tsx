import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { PERMANENT_QUESTS, createBoardQuest } from '../../lib/writeathon'
import { getWeaponMultiplier } from '../../lib/items'
import { calculateDifficulty, estimateQuestCoins } from '../../lib/questRewards'
import type { BoardQuest } from '../../types'
import { QuestCard } from './QuestCard'
import { PinRequestDialog } from './PinRequestDialog'
import { SectionHeading } from './QuestUi'
import { WriteathonBanner } from './WriteathonBanner'
import { WriteathonSetup } from './WriteathonSetup'
import { useAcceptQuest } from './useAcceptQuest'

const TIMER_CHOICES: Array<number | undefined> = [undefined, 10, 20, 30]

function TimerPicker({ value, onChange }: { value: number | undefined; onChange: (m: number | undefined) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Time limit">
      {TIMER_CHOICES.map((m) => {
        const active = m === value
        return (
          <button
            key={m ?? 'none'}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
              active ? 'bg-stone-800 text-amber-100' : 'bg-amber-900/10 text-stone-700 hover:bg-amber-900/20'
            }`}
          >
            {m === undefined ? 'No timer' : `${m}m`}
          </button>
        )
      })}
    </div>
  )
}

export function QuestBoardPanel() {
  const [setupOpen, setSetupOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [timers, setTimers] = useState<Record<number, number | undefined>>({})
  const { accept, acceptingId, error, clearError } = useAcceptQuest()

  const villagerQuests = useWriteathonStore((s) => s.villagerQuests)
  const activeBoardQuests = useWriteathonStore((s) => s.activeBoardQuests)
  const weaponMultiplier = usePlayerStore((s) => getWeaponMultiplier(s.equippedWeapon))
  const defaultTimer = useGameSettingsStore((s) => s.defaultTimerMinutes ?? undefined)

  const isActive = (q: BoardQuest) => activeBoardQuests.some((a) => a.id === q.id && a.accepted && !a.completedAt)

  return (
    <div className="relative space-y-8 p-6">
      <WriteathonBanner onManage={() => setSetupOpen(true)} />

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-2 text-sm text-red-200">
          {error}
          <button type="button" onClick={clearError} className="text-xs text-red-300 hover:text-red-100">Dismiss</button>
        </div>
      )}

      <section>
        <SectionHeading
          title="Guild contracts"
          subtitle="Always on offer. Add a timer to raise the stakes and the reward."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {PERMANENT_QUESTS.map((pq) => {
            // A card the writer hasn't touched uses the default timer.
            const minutes = pq.wordGoal in timers ? timers[pq.wordGoal] : defaultTimer
            const accepted = activeBoardQuests.some(
              (q) => q.type === 'permanent' && q.wordGoal === pq.wordGoal && !q.completedAt,
            )
            const cardId = `permanent-${pq.wordGoal}`
            return (
              <QuestCard
                key={pq.wordGoal}
                kind="permanent"
                title={pq.title}
                description={`Write ${pq.wordGoal.toLocaleString()} words in one sitting.`}
                wordGoal={pq.wordGoal}
                timeMinutes={minutes}
                difficulty={minutes ? calculateDifficulty(pq.wordGoal, minutes) : undefined}
                coins={estimateQuestCoins({ wordGoal: pq.wordGoal, questCoins: pq.coinReward, weaponMultiplier, timeMinutes: minutes })}
                status={accepted ? 'accepted' : 'available'}
                accepting={acceptingId === cardId}
                timerPicker={
                  <TimerPicker value={minutes} onChange={(m) => setTimers((t) => ({ ...t, [pq.wordGoal]: m }))} />
                }
                onAccept={() => {
                  const quest = createBoardQuest('permanent', pq.wordGoal, {
                    title: pq.title,
                    coinReward: pq.coinReward,
                    timeMinutes: minutes,
                  })
                  void accept(quest, cardId)
                }}
              />
            )
          })}
        </div>
      </section>

      <section>
        <SectionHeading title="Villager requests" subtitle="Quests you've pinned for yourself." />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {villagerQuests
            .filter((q) => !q.completedAt)
            .map((quest) => {
              const active = isActive(quest)
              return (
                <QuestCard
                  key={quest.id}
                  kind="villager"
                  title={quest.title}
                  description={quest.description}
                  wordGoal={quest.wordGoal}
                  timeMinutes={quest.timeMinutes}
                  difficulty={quest.timeMinutes ? calculateDifficulty(quest.wordGoal, quest.timeMinutes) : undefined}
                  coins={estimateQuestCoins({
                    wordGoal: quest.wordGoal,
                    questCoins: quest.coinReward,
                    bonusCoins: quest.bonusCoins,
                    weaponMultiplier,
                    timeMinutes: quest.timeMinutes,
                  })}
                  status={active ? 'accepted' : 'available'}
                  accepting={acceptingId === quest.id}
                  tiltSeed={quest.id}
                  onAccept={() => void accept(quest)}
                  footerExtra={
                    !active && (
                      <button
                        type="button"
                        onClick={() => useWriteathonStore.getState().removeVillagerQuest(quest.id)}
                        className="text-xs font-medium text-stone-600 underline-offset-2 hover:text-red-800 hover:underline"
                      >
                        Retract
                      </button>
                    )
                  }
                />
              )
            })}
          <button
            type="button"
            onClick={() => setPinOpen(true)}
            className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-amber-800/50 bg-stone-950/30 text-amber-200/80 transition-colors hover:border-amber-500 hover:bg-stone-950/50 hover:text-amber-100"
          >
            <Plus size={24} />
            <span className="font-serif text-lg">Pin a request</span>
            <span className="text-xs text-stone-400">Your own goal, your own reward</span>
          </button>
        </div>
      </section>

      <WriteathonSetup open={setupOpen} onClose={() => setSetupOpen(false)} />
      <PinRequestDialog open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  )
}
