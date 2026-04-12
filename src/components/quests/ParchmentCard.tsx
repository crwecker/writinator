interface ParchmentCardProps {
  variant: 'permanent' | 'daily' | 'villager'
  title: string
  description: string
  wordGoal: number
  timeMinutes?: number
  coinReward: number
  bonusCoins?: number
  accepted?: boolean
  completed?: boolean
  onAccept?: () => void
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function ParchmentCard({
  variant,
  title,
  description,
  wordGoal,
  timeMinutes,
  coinReward,
  bonusCoins,
  accepted = false,
  completed = false,
  onAccept,
}: ParchmentCardProps) {
  const baseClass =
    'relative text-amber-900 w-full aspect-[3/4] pt-14 pb-12 px-10 bg-no-repeat'

  const variantFilter =
    variant === 'daily'
      ? 'drop-shadow(0 0 14px rgba(251, 191, 36, 0.45))'
      : variant === 'villager'
        ? 'saturate(0.8) brightness(0.95)'
        : undefined

  // Deterministic per-card jitter so each card looks hand-pinned but stable across renders.
  // Daily quest stays perfectly centered + full size as the "featured" card.
  const h = hashString(title)
  const isFeatured = variant === 'daily'
  const scale = isFeatured ? 1 : 0.85 + ((h % 100) / 100) * 0.15 // 0.85 – 1.00
  const rotate = isFeatured ? 0 : (((h >> 8) % 80) - 40) / 10 // -4.0 – +4.0 deg
  const offsetX = isFeatured ? 0 : ((h >> 16) % 18) - 9 // -9 – +8 px
  const offsetY = isFeatured ? 0 : ((h >> 12) % 14) - 7 // -7 – +6 px
  const transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotate}deg) scale(${scale})`

  return (
    <div
      className={baseClass}
      style={{
        backgroundImage: 'url(/parchmentCard.png)',
        backgroundSize: '100% 100%',
        filter: variantFilter,
        transform,
        transformOrigin: 'center center',
      }}
    >
      {/* Completed seal overlay */}
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-24 h-24 rounded-full bg-red-700 text-red-50 flex items-center justify-center font-bold text-xl shadow-xl border-4 border-red-900 wax-seal-stamp">
            DONE
          </div>
        </div>
      )}

      {/* Card content */}
      <div className={completed ? 'opacity-75' : ''}>
        <h3
          className={`font-serif font-bold mb-1 ${
            variant === 'daily' ? 'text-lg' : 'text-base'
          }`}
        >
          {title}
        </h3>
        <p
          className={`text-sm mb-3 leading-snug ${
            variant === 'villager' ? 'italic' : ''
          }`}
        >
          {description}
        </p>

        <div className="flex items-center gap-3 text-xs text-amber-700 mb-3">
          <span>{wordGoal.toLocaleString()} words</span>
          {timeMinutes !== undefined && (
            <span>{timeMinutes}m timer</span>
          )}
          <span className="ml-auto font-semibold">
            {coinReward} coins
            {bonusCoins !== undefined && bonusCoins > 0 && (
              <span className="text-amber-500"> +{bonusCoins} bonus</span>
            )}
          </span>
        </div>

        <div className="flex justify-end">
          {!accepted && !completed && onAccept && (
            <button
              onClick={onAccept}
              className="bg-amber-700 hover:bg-amber-800 text-amber-50 px-4 py-2 rounded font-semibold text-sm transition-colors"
            >
              Accept
            </button>
          )}
          {accepted && !completed && (
            <span className="text-xs italic text-amber-600">In Progress...</span>
          )}
        </div>
      </div>
    </div>
  )
}
