import { beforeEach, describe, expect, it } from 'vitest'
import { activeAmbient, keySoundsOn, playKeyClick, startAmbient, stopAmbient } from './sound'
import { useGameSettingsStore } from '../stores/gameSettingsStore'
import { useCosmeticsStore } from '../stores/cosmeticsStore'

beforeEach(() => {
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  useCosmeticsStore.setState(useCosmeticsStore.getInitialState(), true)
})

describe('sound settings', () => {
  it('sounds are off by default', () => {
    expect(useGameSettingsStore.getState().sound).toEqual({ keySounds: false, ambient: null, volume: 0.4 })
    expect(keySoundsOn()).toBe(false)
    expect(activeAmbient()).toBeNull()
  })

  it('clamps the volume to 0–1', () => {
    useGameSettingsStore.getState().setSound({ volume: 3 })
    expect(useGameSettingsStore.getState().sound.volume).toBe(1)
    useGameSettingsStore.getState().setSound({ volume: -1 })
    expect(useGameSettingsStore.getState().sound.volume).toBe(0)
  })

  it('key sounds need the toggle and the Typewriter Keys unlock', () => {
    useGameSettingsStore.getState().setSound({ keySounds: true })
    expect(keySoundsOn()).toBe(false)
    useCosmeticsStore.setState({ owned: ['sound-typewriter'] })
    expect(keySoundsOn()).toBe(true)
  })

  it('a soundscape plays only when owned and chosen, quiet mode or not', () => {
    useGameSettingsStore.getState().setSound({ ambient: 'rain' })
    expect(activeAmbient()).toBeNull()
    useCosmeticsStore.setState({ owned: ['sound-rain'] })
    expect(activeAmbient()).toBe('rain')
    useGameSettingsStore.getState().setQuietMode(true)
    expect(activeAmbient()).toBe('rain')
    useGameSettingsStore.getState().setSound({ volume: 0 })
    expect(activeAmbient()).toBeNull()
  })
})

describe('synth without Web Audio (jsdom)', () => {
  it('does nothing and never throws', () => {
    expect(playKeyClick(0.5)).toBe(false)
    expect(() => startAmbient('fire', 0.5)).not.toThrow()
    expect(() => stopAmbient()).not.toThrow()
  })
})
