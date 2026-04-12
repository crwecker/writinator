import { useEffect, useRef, useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useEditorStore } from '../../stores/editorStore'
import type { WriteathonMilestone } from '../../types'

interface JourneyBarProps {
  bookWordCount: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function computeFillPercent(
  bookWordCount: number,
  startingWordCount: number,
  targetWordCount: number,
): number {
  if (targetWordCount === startingWordCount) return 0
  const raw = ((bookWordCount - startingWordCount) / (targetWordCount - startingWordCount)) * 100
  return clamp(raw, 0, 100)
}

function computeMilestonePosition(
  milestone: WriteathonMilestone,
  startingWordCount: number,
  targetWordCount: number,
): number {
  if (targetWordCount === startingWordCount) return 0
  const raw =
    ((milestone.targetWordCount - startingWordCount) / (targetWordCount - startingWordCount)) * 100
  return clamp(raw, 0, 100)
}

function getTierColorClass(blockNumber: number): string {
  if (blockNumber <= 8) return 'bg-blue-400'
  if (blockNumber <= 16) return 'bg-emerald-400'
  return 'bg-amber-400'
}

function getTierOutlineClass(blockNumber: number): string {
  if (blockNumber <= 8) return 'border-blue-400'
  if (blockNumber <= 16) return 'border-emerald-400'
  return 'border-amber-400'
}

export function JourneyBar({ bookWordCount }: JourneyBarProps) {
  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const getCompletedBlocks = useWriteathonStore((s) => s.getCompletedBlocks)
  const distractionFree = useEditorStore((s) => s.distractionFree)

  // Track recently-animated (just-completed) milestone block numbers
  const [justCompleted, setJustCompleted] = useState<Set<number>>(new Set())
  const prevCompletedRef = useRef<number>(0)
  const timeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const currentCompleted = getCompletedBlocks()
    if (currentCompleted > prevCompletedRef.current) {
      // Find which milestones were newly completed
      const newlyCompleted: number[] = []
      milestones.forEach((m) => {
        if (m.completed && m.blockNumber > prevCompletedRef.current) {
          newlyCompleted.push(m.blockNumber)
        }
      })

      if (newlyCompleted.length > 0) {
        // Defer the state update to avoid synchronous setState within an effect
        const addTimer = setTimeout(() => {
          setJustCompleted((prev) => {
            const next = new Set(prev)
            newlyCompleted.forEach((n) => next.add(n))
            return next
          })
        }, 0)
        timeoutRefs.current.set(-1, addTimer)

        newlyCompleted.forEach((blockNumber) => {
          // Clear any existing timeout for this block
          const existing = timeoutRefs.current.get(blockNumber)
          if (existing) clearTimeout(existing)

          const timer = setTimeout(() => {
            setJustCompleted((prev) => {
              const next = new Set(prev)
              next.delete(blockNumber)
              return next
            })
            timeoutRefs.current.delete(blockNumber)
          }, 700)
          timeoutRefs.current.set(blockNumber, timer)
        })
      }

      prevCompletedRef.current = currentCompleted
    }
  }, [getCompletedBlocks, milestones])

  // Cleanup all timeouts on unmount
  useEffect(() => {
    const timers = timeoutRefs.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  if (!config?.active) return null

  const { startingWordCount, targetWordCount } = config
  const fillPercent = computeFillPercent(bookWordCount, startingWordCount, targetWordCount)
  const completedBlockCount = getCompletedBlocks()

  return (
    <div
      className={`relative w-full bg-bg-dark border-t border-gray-700 px-3 py-2 shrink-0${
        distractionFree ? ' opacity-20 hover:opacity-60 transition-opacity' : ''
      }`}
    >
      {/* Track */}
      <div className="relative h-1 w-full rounded-full bg-gray-800">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-500 transition-[width] duration-500 ease-out"
          style={{ width: `${fillPercent}%` }}
        />

        {/* Diamond markers */}
        {milestones.map((milestone, index) => {
          const posPercent = computeMilestonePosition(milestone, startingWordCount, targetWordCount)
          const isCompleted = milestone.completed
          const isJustCompleted = justCompleted.has(milestone.blockNumber)
          // "Current" = the first non-completed milestone
          const isCurrent =
            !isCompleted && index === completedBlockCount

          const colorClass = getTierColorClass(milestone.blockNumber)
          const outlineClass = getTierOutlineClass(milestone.blockNumber)

          let sizeClass: string
          let fillClass: string
          let animClass: string

          if (isCompleted) {
            sizeClass = 'w-2 h-2'
            fillClass = colorClass
            animClass = isJustCompleted ? 'milestone-just-completed' : ''
          } else if (isCurrent) {
            sizeClass = 'w-2 h-2'
            fillClass = `bg-gray-900 border ${outlineClass} animate-pulse`
            animClass = ''
          } else {
            sizeClass = 'w-1.5 h-1.5'
            fillClass = 'bg-gray-900 border border-gray-500'
            animClass = ''
          }

          return (
            <div
              key={milestone.blockNumber}
              className="group absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
              style={{ left: `${posPercent}%` }}
            >
              {/* Diamond shape */}
              <div
                className={`rotate-45 ${sizeClass} ${fillClass} ${animClass}`}
              />

              {/* Hover tooltip */}
              <div
                className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              >
                <div className="bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 whitespace-nowrap border border-gray-700 shadow-lg">
                  <span className="font-medium">Block {milestone.blockNumber} of 24</span>
                  <span className="mx-1 text-gray-500">—</span>
                  <span>{milestone.targetWordCount.toLocaleString()} words</span>
                  <span className="ml-1.5 text-gray-400 capitalize">({milestone.tier})</span>
                  {isCompleted && (
                    <span className="ml-1.5 text-emerald-400">✓</span>
                  )}
                </div>
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-700" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
