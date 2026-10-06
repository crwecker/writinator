import { describe, expect, it } from 'vitest'
import { generateQuestArt, getQuestImage } from './questArt'

describe('quest art', () => {
  it('is deterministic per seed and produces an SVG data URL', () => {
    const a = generateQuestArt(42)
    expect(generateQuestArt(42)).toEqual(a)
    expect(a.url.startsWith('data:image/svg+xml;utf8,')).toBe(true)
    expect(decodeURIComponent(a.url)).toContain('<svg')
    expect(a.artTitle).toBeTruthy()
  })

  it('falls back to generated art when the photo fetch fails', async () => {
    const img = await getQuestImage(() => Promise.reject(new Error('Missing key')), 7)
    expect(img).toEqual(generateQuestArt(7))
  })

  it('uses the photo when the fetch succeeds', async () => {
    const img = await getQuestImage(() =>
      Promise.resolve({ id: 'p1', url: 'https://x/y.jpg', width: 10, height: 5, photographer: 'Ann', photographerUrl: 'https://x/ann' }),
    )
    expect(img).toMatchObject({ unsplashId: 'p1', photographer: 'Ann', url: 'https://x/y.jpg' })
  })
})
