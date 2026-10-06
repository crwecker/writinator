import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { render, type Rendered } from '../../test/render'
import { NewCharacterMenu } from './NewCharacterMenu'
import { BuildFromTextModal } from './BuildFromTextModal'
import { useCharacterStore } from '../../stores/characterStore'
import { seedCharacters } from '../../test/fixtures'
import { makeHero } from '../../test/characterFixtures'

let r: Rendered | null = null
let created: string[] = []
beforeEach(() => {
  created = []
  seedCharacters([], {})
})
afterEach(() => {
  r?.unmount()
  r = null
  document.body.innerHTML = ''
})

function click(el: Element | null | undefined) {
  if (!el) throw new Error('missing element')
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

function byText(root: ParentNode, text: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>('button')).find((b) => b.textContent?.includes(text))
}

function setTextarea(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('NewCharacterMenu', () => {
  it('creates a character from a preset', () => {
    r = render(<NewCharacterMenu selected={null} onCreated={(id) => created.push(id)} />)
    click(r.container.querySelector('[data-testid="new-character"]'))
    click(byText(r.container, 'LitRPG Mage'))
    const chars = useCharacterStore.getState().characters
    expect(chars).toHaveLength(1)
    expect(chars[0].baseValues.mp).toEqual({ kind: 'numberWithMax', value: 60, max: 60 })
    expect(created).toEqual([chars[0].id])
  })

  it('copies the selected character', () => {
    const kael = makeHero('kael')
    seedCharacters([kael], {})
    r = render(<NewCharacterMenu selected={kael} onCreated={(id) => created.push(id)} />)
    click(r.container.querySelector('[data-testid="new-character"]'))
    click(byText(r.container, 'Copy Kael'))
    const chars = useCharacterStore.getState().characters
    expect(chars.map((c) => c.name)).toEqual(['Kael', 'Kael (copy)'])
    expect(chars[1].stats).toEqual(kael.stats)
  })
})

describe('BuildFromTextModal', () => {
  it('creates a new character from a pasted status window', () => {
    r = render(<BuildFromTextModal open onClose={() => {}} target={null} onApplied={(id) => created.push(id)} />)
    setTextarea(r.container.querySelector('textarea')!, 'Name: Lira\nHP: 40/50, Level 3, Inventory: Rope')
    expect(r.container.textContent).toContain('HP')
    click(byText(r.container, 'Create character'))
    const chars = useCharacterStore.getState().characters
    expect(chars).toHaveLength(1)
    expect(chars[0].name).toBe('Lira')
    expect(chars[0].baseValues.hp).toEqual({ kind: 'numberWithMax', value: 40, max: 50 })
    expect(created).toEqual([chars[0].id])
  })

  it('updates an existing character', () => {
    const kael = makeHero('kael')
    seedCharacters([kael], {})
    r = render(<BuildFromTextModal open onClose={() => {}} target={kael} />)
    setTextarea(r.container.querySelector('textarea')!, 'Health 5/60')
    click(byText(r.container, 'Update Kael'))
    expect(useCharacterStore.getState().characters[0].baseValues.hp).toEqual({ kind: 'numberWithMax', value: 5, max: 60 })
  })
})
