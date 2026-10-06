/**
 * The writer's own pictures for quests (cover art, a character portrait).
 * Uploads are downscaled and re-encoded as JPEG so they stay small: the data
 * URL ends up in the quest session, which is saved with the book.
 */

export const CUSTOM_PICTURE_MAX_EDGE = 1024
export const CUSTOM_PICTURE_MAX_BYTES = 300_000
/** Largest file accepted before downscaling. */
export const CUSTOM_PICTURE_MAX_UPLOAD_BYTES = 20_000_000

export function fitWithin(width: number, height: number, maxEdge = CUSTOM_PICTURE_MAX_EDGE): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) return { width, height }
  const scale = maxEdge / longEdge
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Decoded byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

export interface DownscaledPicture {
  dataUrl: string
  width: number
  height: number
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file is not a picture this app can read.'))
    img.src = src
  })
}

/** Downscale an uploaded image to a small JPEG data URL. Browser only (uses canvas). */
export async function downscalePicture(file: Blob): Promise<DownscaledPicture> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > CUSTOM_PICTURE_MAX_UPLOAD_BYTES) throw new Error('That picture is too large (20 MB max).')
  const img = await decode(await readAsDataUrl(file))
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the picture.')
  ctx.drawImage(img, 0, 0, width, height)
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(dataUrl) <= CUSTOM_PICTURE_MAX_BYTES) return { dataUrl, width, height }
  }
  throw new Error('Could not shrink that picture enough. Try a simpler image.')
}
