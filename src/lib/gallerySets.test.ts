import { describe, expect, it } from 'vitest'
import { countBySource, GALLERY_SET_SIZE, inferPictureSource, newlyCompletedSets } from './gallerySets'

describe('gallery sets', () => {
  it('uses the recorded theme when known', () => {
    expect(inferPictureSource('https://images.unsplash.com/x', 'space')).toBe('space')
  })

  it('infers generated art and uploaded pictures from data URLs', () => {
    expect(inferPictureSource('data:image/svg+xml;charset=utf-8,<svg/>')).toBe('generated')
    expect(inferPictureSource('data:image/jpeg;base64,AAAA')).toBe('custom')
  })

  it('treats older untagged photos as the original nature theme', () => {
    expect(inferPictureSource('https://images.unsplash.com/photo-1')).toBe('nature')
  })

  it('counts pictures per set', () => {
    const counts = countBySource(['ocean', 'ocean', 'custom'])
    expect(counts.ocean).toBe(2)
    expect(counts.custom).toBe(1)
    expect(counts.nature).toBe(0)
  })

  it('completes a set at the set size, once', () => {
    const counts = countBySource(Array.from({ length: GALLERY_SET_SIZE }, () => 'cities' as const))
    expect(newlyCompletedSets(counts, {})).toEqual(['cities'])
    expect(newlyCompletedSets(counts, { cities: '2026-01-01' })).toEqual([])
    const short = countBySource(Array.from({ length: GALLERY_SET_SIZE - 1 }, () => 'cities' as const))
    expect(newlyCompletedSets(short, {})).toEqual([])
  })
})
