/**
 * Unsplash image fetching and preloading utilities.
 * Provides random images for the image-reveal quest system.
 */

import type { UnsplashImage } from '../types'

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined

const API_BASE = 'https://api.unsplash.com'

const DEFAULT_TIMEOUT_MS = 10_000

interface UnsplashApiPhoto {
  urls: { regular: string; full: string }
  width: number
  height: number
  user: {
    name: string
    links: { html: string }
  }
}

/**
 * Fetch a random landscape photo from Unsplash.
 * Requires VITE_UNSPLASH_ACCESS_KEY env var to be set.
 */
export async function fetchRandomImage(query = 'nature'): Promise<UnsplashImage> {
  if (!UNSPLASH_ACCESS_KEY) {
    throw new Error(
      'Missing VITE_UNSPLASH_ACCESS_KEY. Add it to your .env file to fetch images from Unsplash.',
    )
  }

  const params = new URLSearchParams({
    query,
    orientation: 'landscape',
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE}/photos/random?${params}`, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Unsplash API error: ${res.status} ${res.statusText}`)
    }

    const data: UnsplashApiPhoto = await res.json()

    return {
      url: data.urls.regular,
      width: data.width,
      height: data.height,
      photographer: data.user.name,
      photographerUrl: data.user.links.html,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Unsplash request timed out')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Preload an image URL into an HTMLImageElement.
 * Sets crossOrigin="anonymous" so canvas pixel access works without tainting.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    const timeoutId = setTimeout(() => {
      img.src = ''
      reject(new Error('Image load timed out'))
    }, DEFAULT_TIMEOUT_MS)

    img.onload = () => {
      clearTimeout(timeoutId)
      resolve(img)
    }

    img.onerror = () => {
      clearTimeout(timeoutId)
      reject(new Error(`Failed to load image: ${url}`))
    }

    img.src = url
  })
}
