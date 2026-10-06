import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { render, type Rendered } from '../../test/render'
import { selectValue } from '../../test/domEvents'
import { MechanicsDisplaySettings } from './MechanicsDisplaySettings'
import { useStoryletStore } from '../../stores/storyletStore'
import { useMechanicsPrefsStore } from '../editor/mechanicsPrefsStore'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'

let r: Rendered | null = null
afterEach(() => { r?.unmount(); r = null })

describe('MechanicsDisplaySettings', () => {
  it('sets the book’s status-window theme', () => {
    seedStore(makeBook([makeStorylet('c1', '')]))
    r = render(<MechanicsDisplaySettings />)
    selectValue(r.container.querySelector('select')!, 'system')
    expect(useStoryletStore.getState().globalSettings.statblockTheme).toBe('system')
  })

  it('toggles the chapter summary strip', () => {
    useMechanicsPrefsStore.setState({ showChapterSummary: false })
    r = render(<MechanicsDisplaySettings />)
    const box = r.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(box.checked).toBe(false)
    act(() => { box.click() })
    expect(useMechanicsPrefsStore.getState().showChapterSummary).toBe(true)
  })
})
