import React, { useEffect, useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'

const CONFETTI_COLORS = [
  'bg-amber-400',
  'bg-yellow-400',
  'bg-orange-400',
  'bg-red-400',
  'bg-emerald-400',
  'bg-blue-400',
  'bg-purple-400',
  'bg-pink-400',
]

interface ConfettiParticle {
  id: number
  color: string
  left: number
  delay: number
  duration: number
  size: number
  rotate: number
}

function generateParticles(): ConfettiParticle[] {
  return Array.from({ length: 24 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: Math.round(Math.random() * 95 + 2),
    delay: Math.round(Math.random() * 800),
    duration: Math.round(Math.random() * 1500 + 1500),
    size: Math.round(Math.random() * 8 + 6),
    rotate: Math.round(Math.random() * 360),
  }))
}

export function WriteathonCompleteCelebration(): React.JSX.Element | null {
  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const [visible, setVisible] = useState(false)
  const [particles] = useState<ConfettiParticle[]>(generateParticles)

  useEffect(() => {
    if (config?.completedAt && !visible) {
      const allDone = milestones.every((m) => m.completed)
      if (allDone) {
        setVisible(true)
      }
    }
  // only trigger on completedAt appearing — not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.completedAt])

  if (!visible || !config?.completedAt) return null

  const start = new Date(config.startDate)
  const end = new Date(config.completedAt)
  const daysTaken = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))

  const totalCoins = milestones.reduce((sum, m) => sum + (m.completed ? m.coinsAwarded : 0), 0)
  const wordsWritten = config.targetWordCount - config.startingWordCount

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center"
      onClick={() => setVisible(false)}
    >
      {/* Confetti particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className={`absolute ${p.color} confetti-particle`}
            style={{
              left: `${p.left}%`,
              top: '-20px',
              width: `${p.size}px`,
              height: `${p.size}px`,
              transform: `rotate(${p.rotate}deg)`,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
            }}
          />
        ))}
      </div>

      <div
        className="border-4 border-amber-700 rounded-xl shadow-2xl max-w-lg w-full p-10 relative animate-fade-in text-center"
        style={{
          background: 'linear-gradient(180deg, #3d2817 0%, #1a0f05 100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="mb-8">
          <p className="text-amber-600 text-sm font-medium tracking-widest uppercase mb-3">
            Quest Complete
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-amber-300 leading-tight">
            &#x2694; WRITEATHON COMPLETE! &#x2694;
          </h1>
          <p className="text-amber-500 mt-3 text-sm">
            The chronicle is written. Your legend endures.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-amber-950/40 border border-amber-900/50 rounded-lg px-3 py-4">
            <p className="text-amber-600 text-xs font-medium mb-1">Days taken</p>
            <p className="font-mono font-bold text-amber-200 text-xl tabular-nums">
              {daysTaken}
            </p>
          </div>
          <div className="bg-amber-950/40 border border-amber-900/50 rounded-lg px-3 py-4">
            <p className="text-amber-600 text-xs font-medium mb-1">Coins earned</p>
            <p className="font-mono font-bold text-amber-300 text-xl tabular-nums">
              {totalCoins.toLocaleString()}
            </p>
          </div>
          <div className="bg-amber-950/40 border border-amber-900/50 rounded-lg px-3 py-4">
            <p className="text-amber-600 text-xs font-medium mb-1">Words written</p>
            <p className="font-mono font-bold text-amber-200 text-xl tabular-nums">
              {wordsWritten.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={() => setVisible(false)}
          className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-amber-950 font-bold py-3 rounded-lg text-base shadow-lg transition-all hover:scale-[1.02]"
        >
          Claim Your Glory
        </button>

        <p className="text-amber-800 text-xs mt-4">Click anywhere to dismiss</p>
      </div>
    </div>
  )
}
