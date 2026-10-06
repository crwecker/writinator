import { useEffect, useRef } from 'react'
import { PIXEL_LEVELS } from '../../stores/imageRevealStore'
import { drawPixelated, animateReveal } from '../../lib/pixelate'
import type { ImageRevealSession } from '../../types'

interface SessionCanvasProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
}

/** Full-size canvas that animates between pixel levels as words are written. */
export function DetailCanvas({ session, image }: SessionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cancelAnimRef = useRef<(() => void) | null>(null)
  const prevLevelRef = useRef<number>(-1)
  const prevSessionId = useRef<string>('')

  useEffect(() => {
    if (!image || !canvasRef.current) return

    const canvas = canvasRef.current
    const gridSize = PIXEL_LEVELS[session.currentLevel]

    if (prevSessionId.current !== session.id) {
      prevSessionId.current = session.id
      prevLevelRef.current = -1
    }

    const prevLevel = prevLevelRef.current

    cancelAnimRef.current?.()
    if (prevLevel !== -1 && prevLevel !== session.currentLevel) {
      const fromGrid = PIXEL_LEVELS[prevLevel]
      cancelAnimRef.current = animateReveal(canvas, image, fromGrid, gridSize)
    } else {
      drawPixelated(canvas, image, gridSize)
      cancelAnimRef.current = null
    }

    prevLevelRef.current = session.currentLevel

    return () => {
      cancelAnimRef.current?.()
    }
  }, [image, session.id, session.currentLevel])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={280}
      className="w-[280px] h-[280px] mx-auto rounded object-cover bg-gray-800"
    />
  )
}

/** Animates from the session's current pixel level to the fully clear image. */
export function CelebrationCanvas({ session, image }: SessionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cancelAnimRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!image || !canvasRef.current) return

    const fromGrid = PIXEL_LEVELS[session.currentLevel] ?? 2
    cancelAnimRef.current?.()
    cancelAnimRef.current = animateReveal(canvasRef.current, image, fromGrid, 0)

    return () => {
      cancelAnimRef.current?.()
    }
  }, [image, session.id, session.currentLevel])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={280}
      className="w-[280px] h-[280px] mx-auto rounded object-cover bg-gray-800"
    />
  )
}

interface CollapsedThumbnailProps {
  session: ImageRevealSession
  image: HTMLImageElement
  /** Rendered size in CSS pixels (square). */
  size?: number
  className?: string
}

export function CollapsedThumbnail({ session, image, size = 64, className = 'rounded' }: CollapsedThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    drawPixelated(canvasRef.current, image, PIXEL_LEVELS[session.currentLevel])
  }, [image, session.currentLevel])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`object-cover ${className}`}
    />
  )
}
