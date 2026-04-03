import { useState, useEffect, useRef, useCallback } from 'react'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { PIXEL_LEVELS } from '../../stores/questStore'
import { drawPixelated, animateReveal } from '../../lib/pixelate'
import { loadImage } from '../../lib/unsplash'
import type { ImageRevealSession } from '../../types'

export function ImageRevealPanel() {
  const activeSession = useImageRevealStore((s) => s.activeSession)
  const abandonSession = useImageRevealStore((s) => s.abandonSession)

  const [expanded, setExpanded] = useState(false)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationSession, setCelebrationSession] = useState<ImageRevealSession | null>(null)

  const thumbCanvasRef = useRef<HTMLCanvasElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const cancelAnimRef = useRef<(() => void) | null>(null)
  const prevLevelRef = useRef<number>(-1)
  const imageRef = useRef<HTMLImageElement | null>(null)

  // Detect completion via Zustand subscribe (callback-based, not sync in effect)
  useEffect(() => {
    let prevCount = useImageRevealStore.getState().completedSessions.length
    const unsub = useImageRevealStore.subscribe((state) => {
      if (state.completedSessions.length > prevCount) {
        const completed = state.completedSessions[state.completedSessions.length - 1]
        setCelebrationSession(completed)
        setShowCelebration(true)
        setExpanded(true)

        // Cache the current loaded image for celebration canvas
        imageRef.current = image
      }
      prevCount = state.completedSessions.length
    })
    return () => {
      unsub()
    }
  }, [image])

  // Load image when session starts or changes
  const sessionId = activeSession?.id
  const sessionUrl = activeSession?.imageUrl
  const loadingSessionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!sessionId || !sessionUrl) {
      prevLevelRef.current = -1
      loadingSessionRef.current = null
      return
    }

    loadingSessionRef.current = sessionId
    loadImage(sessionUrl).then((img) => {
      if (loadingSessionRef.current === sessionId) {
        setImage(img)
        imageRef.current = img
      }
    }).catch((err) => {
      console.warn('[ImageRevealPanel] Failed to load image:', err)
    })

    return () => { loadingSessionRef.current = null }
  }, [sessionId, sessionUrl])

  // Draw canvases when image loads or level changes
  const currentLevel = activeSession?.currentLevel ?? 0
  const hasSession = !!activeSession
  const drawCanvases = useCallback(() => {
    if (!image || !hasSession) return

    const gridSize = PIXEL_LEVELS[currentLevel]

    // Thumbnail canvas
    if (thumbCanvasRef.current) {
      drawPixelated(thumbCanvasRef.current, image, gridSize)
    }

    // Main canvas (only when expanded — canvas may not be mounted in collapsed state)
    if (expanded && mainCanvasRef.current) {
      const prevLevel = prevLevelRef.current
      if (prevLevel !== -1 && prevLevel !== currentLevel) {
        cancelAnimRef.current?.()
        const fromGrid = PIXEL_LEVELS[prevLevel]
        cancelAnimRef.current = animateReveal(
          mainCanvasRef.current,
          image,
          fromGrid,
          gridSize,
        )
      } else {
        drawPixelated(mainCanvasRef.current, image, gridSize)
      }
    }

    prevLevelRef.current = currentLevel
  }, [image, hasSession, currentLevel, expanded])

  useEffect(() => {
    drawCanvases()
  }, [drawCanvases])

  // Draw celebration image
  useEffect(() => {
    if (!celebrationSession || !showCelebration) return

    let cancelled = false
    const cachedImg = imageRef.current
    if (cachedImg) {
      // Use cached image — draw after DOM paints the celebration canvas
      requestAnimationFrame(() => {
        if (!cancelled && mainCanvasRef.current) {
          drawPixelated(mainCanvasRef.current, cachedImg, 0)
        }
      })
    } else {
      loadImage(celebrationSession.imageUrl).then((img) => {
        if (!cancelled && mainCanvasRef.current) {
          drawPixelated(mainCanvasRef.current, img, 0)
        }
      }).catch((err) => {
        console.warn('[ImageRevealPanel] Failed to load celebration image:', err)
      })
    }

    return () => { cancelled = true }
  }, [celebrationSession, showCelebration])

  // Cleanup animation frames on unmount
  useEffect(() => {
    return () => {
      cancelAnimRef.current?.()
    }
  }, [])

  // Self-hide when no session and no celebration
  if (!activeSession && !showCelebration) return null

  const progress = activeSession
    ? Math.min(activeSession.wordsWritten / activeSession.wordGoal, 1)
    : 1
  const remaining = activeSession
    ? Math.max(activeSession.wordGoal - activeSession.wordsWritten, 0)
    : 0
  const percentText = `${Math.round(progress * 100)}%`

  // Celebration state
  if (showCelebration && celebrationSession) {
    return (
      <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
        <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden">
          <div className="p-3">
            <div className="text-center mb-2">
              <h3 className="text-lg font-bold text-emerald-400">Image Revealed!</h3>
              <p className="text-gray-400 text-xs mt-0.5">
                {celebrationSession.wordGoal.toLocaleString()} words written
              </p>
            </div>
            <canvas
              ref={mainCanvasRef}
              width={280}
              height={280}
              className="w-[280px] h-[280px] mx-auto rounded object-cover"
            />
            {celebrationSession.photographer && (
              <p className="text-center text-gray-500 text-[10px] mt-2">
                Photo by{' '}
                {celebrationSession.photographerUrl ? (
                  <a
                    href={celebrationSession.photographerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-300 underline"
                  >
                    {celebrationSession.photographer}
                  </a>
                ) : (
                  celebrationSession.photographer
                )}
                {' '}on Unsplash
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCelebration(false)}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-300 border-t border-gray-700"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Collapsed state
  if (!expanded) {
    return (
      <div className="fixed bottom-12 right-4 z-40">
        <button
          onClick={() => setExpanded(true)}
          className="group flex items-center gap-2 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg p-1.5 hover:border-gray-600 transition-colors"
          title="Expand image reveal"
        >
          <canvas
            ref={thumbCanvasRef}
            width={64}
            height={64}
            className="w-16 h-16 rounded object-cover"
          />
          <span className="text-xs text-gray-400 tabular-nums pr-1.5 group-hover:text-gray-300">
            {percentText}
          </span>
        </button>
      </div>
    )
  }

  // Expanded state
  return (
    <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
      <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
          <span className="text-xs text-gray-300 font-medium">Image Reveal</span>
          <button
            onClick={() => setExpanded(false)}
            className="text-gray-500 hover:text-gray-400 text-xs"
            title="Minimize"
          >
            &#x2015;
          </button>
        </div>

        {/* Canvas */}
        <div className="p-3">
          <canvas
            ref={mainCanvasRef}
            width={280}
            height={280}
            className="w-[280px] h-[280px] mx-auto rounded object-cover"
          />
        </div>

        {/* Progress */}
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 tabular-nums">{percentText}</span>
            <span className="text-gray-500 tabular-nums">
              {remaining.toLocaleString()} words left
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-amber-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-gray-700">
          <button
            onClick={abandonSession}
            className="text-[10px] text-gray-600 hover:text-gray-400"
            title="Abandon session"
          >
            Abandon
          </button>
        </div>
      </div>
    </div>
  )
}
