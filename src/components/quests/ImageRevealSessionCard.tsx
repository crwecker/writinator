import { useImageRevealStore } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { getItemById, getWeaponMultiplier, getArmorTimeBonus } from '../../lib/items'
import {
  estimateSessionCoins,
  getDifficultyColor,
  getDifficultyLabel,
  sessionDifficulty,
} from '../../lib/questRewards'
import { formatCoinRange } from './questStyles'
import type { ImageRevealSession } from '../../types'
import { DetailCanvas } from './ImageRevealCanvases'
import { ConsumableButtons, ProgressBar, SessionTimer } from './ImageRevealWidgets'

interface ImageRevealSessionCardProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
  onMinimize: () => void
}

const textShadow = '[text-shadow:0_1px_2px_rgba(0,0,0,0.95)]'

/** One session at full size in the expanded panel. */
export function ImageRevealSessionCard({ session, image, onMinimize }: ImageRevealSessionCardProps) {
  const isPaused = useImageRevealStore((s) => s.isPaused)
  const pauseStartedAt = useImageRevealStore((s) => s.pauseStartedAt)
  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)
  const consumableInventory = usePlayerStore((s) => s.consumableInventory)

  const remaining = Math.max(session.wordGoal - session.wordsWritten, 0)
  const isTimed = session.timeMinutes !== undefined

  // For timed sessions, calculate difficulty and reward preview
  const difficulty = session.timeMinutes !== undefined
    ? sessionDifficulty({ ...session, timeMinutes: session.timeMinutes })
    : null
  const difficultyColorClass = difficulty ? getDifficultyColor(difficulty) : ''

  const weaponItem = getItemById(equippedWeapon)
  const weaponMultiplier = getWeaponMultiplier(equippedWeapon)
  const coinEstimate = formatCoinRange(estimateSessionCoins(session, weaponMultiplier))

  const armorBonus = getArmorTimeBonus(equippedArmor)
  const armorItem = getItemById(equippedArmor)

  const handlePauseResume = () => {
    if (isPaused) {
      useImageRevealStore.getState().resumeTimer()
    } else {
      useImageRevealStore.getState().pauseTimer()
    }
  }

  const handleUseConsumable = (itemId: string) => {
    useImageRevealStore.getState().useConsumable(itemId)
  }

  return (
    <div className="shrink-0 w-[280px] border-r border-gray-800 last:border-r-0">
      {/* Image with overlaid text — click to minimize */}
      <div
        className="relative cursor-pointer"
        onClick={onMinimize}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onMinimize()
          }
        }}
        title="Minimize image quests"
      >
        <DetailCanvas session={session} image={image} />

        {/* Top-left: difficulty + timer (timed only) */}
        {isTimed && (
          <div className="absolute top-1 left-2 flex flex-col items-start gap-0.5">
            {difficulty && (
              <span className={`text-[10px] font-medium ${difficultyColorClass} ${textShadow}`}>
                {getDifficultyLabel(difficulty)}
              </span>
            )}
            <span className={textShadow}>
              <SessionTimer
                session={session}
                isPaused={isPaused}
                pauseStartedAt={pauseStartedAt}
                compact
              />
            </span>
          </div>
        )}

        {/* Bottom gradient with progress + word counts + RPG info */}
        <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 space-y-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent">
          <ProgressBar session={session} showText={false} />
          <div className={`flex items-center justify-between text-[10px] text-gray-100 tabular-nums ${textShadow}`}>
            <span>
              {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()}
            </span>
            <span>
              {remaining.toLocaleString()} left
            </span>
          </div>
          <div className={`flex items-center justify-between text-[10px] ${textShadow}`}>
            {weaponItem ? (
              <span className="text-gray-200" title="Raises coin rewards">{weaponItem.icon} {weaponItem.name} (×{weaponMultiplier} coins)</span>
            ) : (
              <span />
            )}
            <span className="text-amber-300">{coinEstimate} coins</span>
          </div>
        </div>
      </div>

      {/* Controls — only for timed sessions */}
      {isTimed && (
        <div className="px-2 py-2 space-y-2">
          {/* Armor time bonus info if equipped */}
          {armorBonus > 0 && armorItem && (
            <p className="text-[10px] text-gray-600">
              {armorItem.icon} {armorItem.name} (+{Math.round(armorBonus * 100)}% time)
            </p>
          )}

          {/* Consumables */}
          <ConsumableButtons
            inventory={consumableInventory}
            onUse={handleUseConsumable}
          />

          {/* Pause/Resume */}
          <button
            onClick={handlePauseResume}
            className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1.5 transition-colors"
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      )}
    </div>
  )
}
