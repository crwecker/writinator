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
  const baseClass = 'relative rounded-lg shadow-md border-2 p-4'

  const variantClass =
    variant === 'daily'
      ? 'bg-amber-50 text-amber-900 border-4 border-amber-500 shadow-amber-500/30 shadow-lg w-full'
      : variant === 'villager'
        ? 'bg-amber-100/70 text-amber-950 border-dashed border-amber-900/50 opacity-90 shadow-inner'
        : 'bg-amber-50 text-amber-900 border-amber-700'

  const hoverClass =
    !completed ? 'hover:shadow-lg hover:-translate-y-0.5 transition-all' : ''

  return (
    <div className={`${baseClass} ${variantClass} ${hoverClass}`}>
      {/* Completed seal overlay */}
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-24 h-24 rounded-full bg-red-700 text-red-50 flex items-center justify-center font-bold text-xl rotate-[-15deg] shadow-xl border-4 border-red-900">
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
