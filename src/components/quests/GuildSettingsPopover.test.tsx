import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuildSettingsPopover } from './GuildSettingsPopover'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { useCosmeticsStore } from '../../stores/cosmeticsStore'
import { render, type Rendered } from '../../test/render'

let view: Rendered | null = null
const settings = () => useGameSettingsStore.getState()

beforeEach(() => {
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  useCosmeticsStore.setState(useCosmeticsStore.getInitialState(), true)
})

afterEach(() => {
  view?.unmount()
  view = null
})

function byLabel<T extends HTMLElement>(label: string): T {
  const el = view!.container.querySelector(`[aria-label="${label}"]`)
  if (!el) throw new Error(`no element labelled ${label}`)
  return el as T
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

describe('GuildSettingsPopover', () => {
  it('renders nothing when closed', () => {
    view = render(<GuildSettingsPopover open={false} onClose={() => {}} />)
    expect(view.container.innerHTML).toBe('')
  })

  it('edits the quest defaults', () => {
    view = render(<GuildSettingsPopover open onClose={() => {}} />)
    act(() => byLabel<HTMLInputElement>('Auto session quest').click())
    expect(settings().autoQuest.enabled).toBe(false)
    act(() => setValue(byLabel<HTMLInputElement>('Session quest goal'), '750'))
    expect(settings().autoQuest.wordGoal).toBe(750)
    act(() => byLabel<HTMLButtonElement>('Default timer 20 minutes').click())
    expect(settings().defaultTimerMinutes).toBe(20)
    act(() => byLabel<HTMLButtonElement>('Default timer none').click())
    expect(settings().defaultTimerMinutes).toBeNull()
    act(() => byLabel<HTMLInputElement>('Quiet mode').click())
    expect(settings().quietMode).toBe(true)
    act(() => setValue(byLabel<HTMLSelectElement>('Picture theme'), 'ocean'))
    expect(settings().imageTheme).toBe('ocean')
  })

  it('sets difficulty, word counting and sounds', () => {
    useCosmeticsStore.setState({ owned: ['sound-typewriter', 'sound-rain'] })
    view = render(<GuildSettingsPopover open onClose={() => {}} />)
    act(() => byLabel<HTMLButtonElement>('Difficulty Hardcore').click())
    expect(settings().difficulty).toBe('hardcore')
    expect(settings().autoQuest.wordGoal).toBe(1000)
    expect(byLabel<HTMLButtonElement>('Default timer 20 minutes').getAttribute('aria-checked')).toBe('true')
    act(() => byLabel<HTMLButtonElement>('Count words as Net growth').click())
    expect(settings().wordCountMode).toBe('net')
    act(() => byLabel<HTMLInputElement>('Typewriter key sounds').click())
    expect(settings().sound.keySounds).toBe(true)
    act(() => setValue(byLabel<HTMLSelectElement>('Soundscape'), 'rain'))
    expect(settings().sound.ambient).toBe('rain')
    act(() => setValue(byLabel<HTMLInputElement>('Sound volume'), '80'))
    expect(settings().sound.volume).toBe(0.8)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    view = render(<GuildSettingsPopover open onClose={onClose} />)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalled()
  })
})
