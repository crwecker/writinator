/**
 * Procedurally generated landscape art for image-reveal quests. Used when an
 * Unsplash photo can't be fetched (no API key, offline, rate-limited) so a
 * quest can always start. Deterministic for a given seed.
 */

interface Palette {
  name: string
  sky: [string, string]
  orb: string
  ridges: [string, string, string]
  stars: boolean
}

const PALETTES: Palette[] = [
  { name: 'Dawn over the Vale', sky: ['#fde68a', '#f472b6'], orb: '#fff7ed', ridges: ['#a78bfa', '#7c3aed', '#3b0764'], stars: false },
  { name: 'Emberfall Dusk', sky: ['#7c2d12', '#f59e0b'], orb: '#fef3c7', ridges: ['#9a3412', '#431407', '#1c0a03'], stars: false },
  { name: 'Moonlit Peaks', sky: ['#0f172a', '#1e3a8a'], orb: '#e2e8f0', ridges: ['#334155', '#1e293b', '#020617'], stars: true },
  { name: 'Verdant Highlands', sky: ['#bae6fd', '#38bdf8'], orb: '#fefce8', ridges: ['#4ade80', '#15803d', '#052e16'], stars: false },
  { name: 'Dune Sea', sky: ['#fef3c7', '#fb923c'], orb: '#fffbeb', ridges: ['#fdba74', '#c2410c', '#7c2d12'], stars: false },
  { name: 'Aurora Reach', sky: ['#022c22', '#0e7490'], orb: '#ccfbf1', ridges: ['#115e59', '#134e4a', '#042f2e'], stars: true },
]

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ridgePath(rand: () => number, width: number, height: number, baseY: number, roughness: number): string {
  const steps = 9
  const points: string[] = [`M0 ${height}`, `L0 ${baseY}`]
  for (let i = 1; i <= steps; i++) {
    const x = Math.round((width / steps) * i)
    const y = Math.round(baseY + (rand() - 0.5) * roughness)
    points.push(`L${x} ${y}`)
  }
  points.push(`L${width} ${height}`, 'Z')
  return points.join(' ')
}

export const QUEST_ART_WIDTH = 800
export const QUEST_ART_HEIGHT = 600

/** An image a quest can reveal: an Unsplash photo or generated art. */
export interface QuestImage {
  url: string
  width: number
  height: number
  /** Unsplash photo id — absent for generated art. */
  unsplashId?: string
  photographer?: string
  photographerUrl?: string
  /** Name of a generated scene. */
  artTitle?: string
}

export function generateQuestArt(seed: number): QuestImage {
  const rand = rng(seed)
  const palette = PALETTES[Math.floor(rand() * PALETTES.length)]
  const w = QUEST_ART_WIDTH
  const h = QUEST_ART_HEIGHT
  const orbX = Math.round(w * (0.2 + rand() * 0.6))
  const orbY = Math.round(h * (0.15 + rand() * 0.2))
  const orbR = Math.round(36 + rand() * 30)

  const stars = palette.stars
    ? Array.from({ length: 40 }, () => {
        const x = Math.round(rand() * w)
        const y = Math.round(rand() * h * 0.5)
        const r = (rand() * 1.6 + 0.4).toFixed(1)
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`
      }).join('')
    : ''

  const [far, mid, near] = palette.ridges
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">',
    `<stop offset="0" stop-color="${palette.sky[0]}"/><stop offset="1" stop-color="${palette.sky[1]}"/>`,
    '</linearGradient></defs>',
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>`,
    stars,
    `<circle cx="${orbX}" cy="${orbY}" r="${orbR}" fill="${palette.orb}" opacity="0.92"/>`,
    `<path d="${ridgePath(rand, w, h, h * 0.55, 140)}" fill="${far}"/>`,
    `<path d="${ridgePath(rand, w, h, h * 0.68, 110)}" fill="${mid}"/>`,
    `<path d="${ridgePath(rand, w, h, h * 0.82, 70)}" fill="${near}"/>`,
    '</svg>',
  ].join('')

  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width: w,
    height: h,
    artTitle: palette.name,
  }
}

/**
 * Pick an image for a new quest: a random Unsplash photo when one can be
 * fetched, otherwise generated art, so starting a quest never fails.
 */
export async function getQuestImage(
  fetchPhoto: () => Promise<{ id: string; url: string; width: number; height: number; photographer: string; photographerUrl: string }>,
  seed: number = Math.floor(Math.random() * 2 ** 31),
): Promise<QuestImage> {
  try {
    const photo = await fetchPhoto()
    return {
      url: photo.url,
      width: photo.width,
      height: photo.height,
      unsplashId: photo.id,
      photographer: photo.photographer,
      photographerUrl: photo.photographerUrl,
    }
  } catch (err) {
    console.warn('[quests] using generated art:', err instanceof Error ? err.message : err)
    return generateQuestArt(seed)
  }
}
