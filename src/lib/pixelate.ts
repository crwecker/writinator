/**
 * Canvas-based image pixelation utilities.
 * Used to progressively reveal images as users write words.
 */

/** Row stagger delay in milliseconds for reveal animation. */
const ROW_STAGGER_MS = 40

/**
 * Draw a pixelated version of an image onto a canvas using the
 * sample-and-fillRect approach for a clean "big pixel" look.
 */
export function drawPixelated(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  gridSize: number,
): void {
  const w = image.naturalWidth
  const h = image.naturalHeight

  if (w === 0 || h === 0) return

  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (gridSize <= 0) {
    ctx.drawImage(image, 0, 0, w, h)
    return
  }

  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tmpCtx = tmp.getContext('2d')
  if (!tmpCtx) return
  tmpCtx.drawImage(image, 0, 0, w, h)

  const imageData = tmpCtx.getImageData(0, 0, w, h)
  const pixels = imageData.data

  for (let y = 0; y < h; y += gridSize) {
    for (let x = 0; x < w; x += gridSize) {
      const cellW = Math.min(gridSize, w - x)
      const cellH = Math.min(gridSize, h - y)

      const sx = Math.min(x + Math.floor(cellW / 2), w - 1)
      const sy = Math.min(y + Math.floor(cellH / 2), h - 1)
      const idx = (sy * w + sx) * 4

      const r = pixels[idx]
      const g = pixels[idx + 1]
      const b = pixels[idx + 2]
      const a = pixels[idx + 3] / 255

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`
      ctx.fillRect(x, y, cellW, cellH)
    }
  }
}

/**
 * Animate a pixelation reveal from one grid size to another.
 * Rows of the finer-resolution image are progressively drawn top-to-bottom.
 * Returns a cancel function that stops the animation.
 */
export function animateReveal(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  fromGridSize: number,
  toGridSize: number,
  onComplete?: () => void,
): () => void {
  const w = image.naturalWidth
  const h = image.naturalHeight

  if (w === 0 || h === 0) {
    onComplete?.()
    return () => {}
  }

  drawPixelated(canvas, image, fromGridSize)

  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = w
  targetCanvas.height = h
  drawPixelated(targetCanvas, image, toGridSize)

  const stripHeight = toGridSize > 0 ? toGridSize : Math.max(1, Math.floor(h / 64))
  const totalRows = Math.ceil(h / stripHeight)

  let animFrameId = 0
  let cancelled = false
  let startTime: number | null = null
  let lastRevealedRow = -1

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    onComplete?.()
    return () => {}
  }

  const drawCtx: CanvasRenderingContext2D = ctx

  function frame(timestamp: number) {
    if (cancelled) return

    if (startTime === null) {
      startTime = timestamp
    }

    const elapsed = timestamp - (startTime as number)
    const rowsToReveal = Math.min(
      totalRows,
      Math.floor(elapsed / ROW_STAGGER_MS) + 1,
    )

    for (let row = lastRevealedRow + 1; row < rowsToReveal; row++) {
      const sy = row * stripHeight
      const sh = Math.min(stripHeight, h - sy)
      if (sh <= 0) continue
      drawCtx.drawImage(targetCanvas, 0, sy, w, sh, 0, sy, w, sh)
    }
    lastRevealedRow = rowsToReveal - 1

    if (rowsToReveal >= totalRows) {
      onComplete?.()
      return
    }

    animFrameId = requestAnimationFrame(frame)
  }

  animFrameId = requestAnimationFrame(frame)

  return () => {
    cancelled = true
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
    }
  }
}
