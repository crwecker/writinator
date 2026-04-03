/**
 * Canvas-based image pixelation utilities.
 * Used to progressively reveal images as users write words.
 */

/** Row stagger delay in milliseconds for reveal animation. */
const ROW_STAGGER_MS = 40;

/**
 * Draw a pixelated version of an image onto a canvas using the
 * sample-and-fillRect approach for a clean "big pixel" look.
 *
 * @param canvas  - Target canvas element
 * @param image   - Source image element (must be loaded)
 * @param gridSize - Pixel grid size. 0 or negative draws the original image.
 */
export function drawPixelated(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  gridSize: number,
): void {
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // gridSize <= 0 means full resolution
  if (gridSize <= 0) {
    ctx.drawImage(image, 0, 0, w, h);
    return;
  }

  // Draw the image at full size on a temporary canvas so we can sample pixels
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tmpCtx = tmp.getContext("2d");
  if (!tmpCtx) return;
  tmpCtx.drawImage(image, 0, 0, w, h);

  const imageData = tmpCtx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  // Walk the image in gridSize steps and fill each cell with its center color
  for (let y = 0; y < h; y += gridSize) {
    for (let x = 0; x < w; x += gridSize) {
      const cellW = Math.min(gridSize, w - x);
      const cellH = Math.min(gridSize, h - y);

      // Sample center pixel of this cell
      const sx = Math.min(x + Math.floor(cellW / 2), w - 1);
      const sy = Math.min(y + Math.floor(cellH / 2), h - 1);
      const idx = (sy * w + sx) * 4;

      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3] / 255;

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fillRect(x, y, cellW, cellH);
    }
  }
}

/**
 * Animate a pixelation reveal from one grid size to another.
 * Rows of the finer-resolution image are progressively drawn top-to-bottom.
 *
 * @param canvas       - Target canvas element
 * @param image        - Source image element (must be loaded)
 * @param fromGridSize - Starting pixelation grid size
 * @param toGridSize   - Target pixelation grid size (should be smaller / finer)
 * @param onComplete   - Optional callback when the animation finishes
 * @returns A cancel function that stops the animation
 */
export function animateReveal(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  fromGridSize: number,
  toGridSize: number,
  onComplete?: () => void,
): () => void {
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  // Draw the starting (coarser) pixelation as the base layer
  drawPixelated(canvas, image, fromGridSize);

  // Pre-render the target (finer) pixelation on a temporary canvas
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = w;
  targetCanvas.height = h;
  drawPixelated(targetCanvas, image, toGridSize);

  // Determine row height based on the target grid size.
  // If toGridSize <= 0 the row height is 1px (full resolution),
  // but we use a reasonable strip height to avoid thousands of rows.
  const stripHeight = toGridSize > 0 ? toGridSize : Math.max(1, Math.floor(h / 64));
  const totalRows = Math.ceil(h / stripHeight);

  let animFrameId = 0;
  let cancelled = false;
  let startTime: number | null = null;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    onComplete?.();
    return () => {};
  }

  // Local binding so TypeScript knows it's non-null inside the closure
  const drawCtx: CanvasRenderingContext2D = ctx;

  function frame(timestamp: number) {
    if (cancelled) return;

    if (startTime === null) {
      startTime = timestamp;
    }

    const elapsed = timestamp - (startTime as number);
    // How many rows should be revealed by now
    const rowsToReveal = Math.min(
      totalRows,
      Math.floor(elapsed / ROW_STAGGER_MS) + 1,
    );

    // Draw newly revealed rows from the target canvas
    for (let row = 0; row < rowsToReveal; row++) {
      const sy = row * stripHeight;
      const sh = Math.min(stripHeight, h - sy);
      if (sh <= 0) continue;
      drawCtx.drawImage(targetCanvas, 0, sy, w, sh, 0, sy, w, sh);
    }

    if (rowsToReveal >= totalRows) {
      onComplete?.();
      return;
    }

    animFrameId = requestAnimationFrame(frame);
  }

  animFrameId = requestAnimationFrame(frame);

  // Return cancel function
  return () => {
    cancelled = true;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
    }
  };
}
