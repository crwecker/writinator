import { describe, expect, it } from 'vitest'
import { dataUrlBytes, fitWithin } from './customPicture'

describe('custom picture sizing', () => {
  it('scales the long edge down to the cap, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 })
    expect(fitWithin(1500, 3000)).toEqual({ width: 512, height: 1024 })
  })

  it('leaves small pictures alone', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('measures the decoded size of a base64 data URL', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(3)
    expect(dataUrlBytes('data:image/jpeg;base64,AAA=')).toBe(2)
  })
})
