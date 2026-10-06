/**
 * Gallery sets: revealed pictures grouped by where they came from (the
 * Unsplash theme, generated art or the writer's own uploads). Revealing a
 * full set pays a bonus and unlocks a frame for that set's pictures.
 */

export type PictureSource = 'nature' | 'cities' | 'ocean' | 'space' | 'fantasy art' | 'generated' | 'custom'

export const GALLERY_SET_SIZE = 6
export const GALLERY_SET_BONUS = 150

export interface GallerySetMeta {
  source: PictureSource
  label: string
  /** Name of the frame the set unlocks. */
  frameName: string
  /** Tailwind classes for the unlocked frame (border + glow). */
  frameClass: string
}

export const GALLERY_SETS: GallerySetMeta[] = [
  { source: 'nature', label: 'Nature', frameName: 'Living Oak', frameClass: 'border-emerald-700 shadow-[0_0_0_2px_rgba(16,185,129,0.45),0_6px_16px_-6px_rgba(0,0,0,0.9)]' },
  { source: 'cities', label: 'Cities', frameName: 'Gilded Brass', frameClass: 'border-amber-500 shadow-[0_0_0_2px_rgba(251,191,36,0.5),0_6px_16px_-6px_rgba(0,0,0,0.9)]' },
  { source: 'ocean', label: 'Ocean', frameName: 'Driftwood & Pearl', frameClass: 'border-cyan-700 shadow-[0_0_0_2px_rgba(34,211,238,0.45),0_6px_16px_-6px_rgba(0,0,0,0.9)]' },
  { source: 'space', label: 'Space', frameName: 'Starforged', frameClass: 'border-indigo-600 shadow-[0_0_14px_1px_rgba(129,140,248,0.55),0_6px_16px_-6px_rgba(0,0,0,0.9)]' },
  { source: 'fantasy art', label: 'Fantasy art', frameName: 'Dragonscale', frameClass: 'border-fuchsia-700 shadow-[0_0_14px_1px_rgba(232,121,249,0.5),0_6px_16px_-6px_rgba(0,0,0,0.9)]' },
  { source: 'generated', label: 'Guild scenes', frameName: 'Painter’s Gilt', frameClass: 'border-orange-500 shadow-[0_0_0_2px_rgba(249,115,22,0.45),0_6px_16px_-6px_rgba(0,0,0,0.9)]' },
  { source: 'custom', label: 'Your pictures', frameName: 'Author’s Seal', frameClass: 'border-red-700 shadow-[0_0_0_2px_rgba(220,38,38,0.45),0_6px_16px_-6px_rgba(0,0,0,0.9)]' },
]

export function gallerySetMeta(source: PictureSource): GallerySetMeta {
  return GALLERY_SETS.find((s) => s.source === source) ?? GALLERY_SETS[0]
}

/** Where a picture came from. `known` is the source recorded when the quest started. */
export function inferPictureSource(imageUrl: string, known?: PictureSource): PictureSource {
  if (known) return known
  if (imageUrl.startsWith('data:image/svg')) return 'generated'
  if (imageUrl.startsWith('data:')) return 'custom'
  // Photos from before themes existed were all "nature".
  return 'nature'
}

export function countBySource(sources: PictureSource[]): Record<PictureSource, number> {
  const counts: Record<PictureSource, number> = { nature: 0, cities: 0, ocean: 0, space: 0, 'fantasy art': 0, generated: 0, custom: 0 }
  for (const s of sources) counts[s] += 1
  return counts
}

/** Sets that just reached the set size and haven't been marked complete. */
export function newlyCompletedSets(
  counts: Record<PictureSource, number>,
  done: Partial<Record<PictureSource, string>>,
): PictureSource[] {
  return GALLERY_SETS.map((s) => s.source).filter((source) => counts[source] >= GALLERY_SET_SIZE && !done[source])
}
