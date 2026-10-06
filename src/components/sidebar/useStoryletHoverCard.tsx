import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useCharacterStore } from '../../stores/characterStore'
import { StoryletStateCard } from './StoryletStateCard'

const HOVER_DELAY_MS = 450

/**
 * Hover handlers for a sidebar row plus the card to render. Waits a beat
 * before showing; `disabled` (dragging, menus, renaming) hides it.
 */
export function useStoryletHoverCard(
  storyletId: string,
  disabled: boolean,
): { onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void; onMouseLeave: () => void; card: ReactNode } {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCharacters = useCharacterStore((s) => s.characters.length > 0)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPos(null)
  }, [])

  useEffect(() => clear, [clear])

  const onMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (disabled || !hasCharacters) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const top = Math.max(8, Math.min(rect.top, window.innerHeight - 260))
        setPos({ top, left: rect.right + 8 })
      }, HOVER_DELAY_MS)
    },
    [disabled, hasCharacters],
  )

  const card = pos && !disabled ? <StoryletStateCard storyletId={storyletId} top={pos.top} left={pos.left} /> : null
  return { onMouseEnter, onMouseLeave: clear, card }
}
