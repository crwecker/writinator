import React, { useEffect, useRef, useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'

export function MilestoneFlash(): React.JSX.Element | null {
  const milestones = useWriteathonStore((s) => s.milestones)
  const [flashing, setFlashing] = useState(false)
  const prevCompletedRef = useRef(0)

  useEffect(() => {
    const completed = milestones.filter((m) => m.completed).length
    if (completed > prevCompletedRef.current) {
      prevCompletedRef.current = completed
      const startTimer = setTimeout(() => {
        setFlashing(true)
      }, 0)
      const endTimer = setTimeout(() => setFlashing(false), 1000)
      return () => {
        clearTimeout(startTimer)
        clearTimeout(endTimer)
      }
    }
  }, [milestones])

  if (!flashing) return null

  return (
    <div className="fixed inset-x-0 bottom-0 h-32 pointer-events-none z-40 bg-gradient-to-t from-amber-400/60 to-transparent animate-fade-out" />
  )
}
