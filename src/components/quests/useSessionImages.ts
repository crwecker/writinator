import { useEffect, useRef, useState } from 'react'
import { loadImage } from '../../lib/unsplash'
import type { ImageRevealSession } from '../../types'

/**
 * Loads (once per session id) the image for each given session. Returns the
 * images loaded so far, keyed by session id.
 */
export function useSessionImages(sessions: ImageRevealSession[]): Record<string, HTMLImageElement> {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})
  // Ids that are loading or loaded — avoids duplicate requests across renders.
  const requestedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const { id, imageUrl } of sessions) {
      if (requestedRef.current.has(id)) continue
      requestedRef.current.add(id)
      loadImage(imageUrl)
        .then((img) => {
          setImages((prev) => ({ ...prev, [id]: img }))
        })
        .catch((err) => {
          // Allow a retry the next time the session list changes.
          requestedRef.current.delete(id)
          console.warn('[ImageRevealPanel] Failed to load image for session', id, err)
        })
    }
  }, [sessions])

  return images
}
