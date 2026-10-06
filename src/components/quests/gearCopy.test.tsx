import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ArmoryPanel } from './ArmoryPanel'
import { AdventurersGuild } from './AdventurersGuild'
import { usePlayerStore } from '../../stores/playerStore'
import { getItemById, WEAPONS } from '../../lib/items'
import { render, type Rendered } from '../../test/render'

let view: Rendered | null = null

beforeEach(() => {
  usePlayerStore.setState({ ...usePlayerStore.getInitialState(), ownedItems: ['wooden-pencil', 'cloth-tunic', 'enchanted-quill'], equippedWeapon: 'enchanted-quill' }, true)
})

afterEach(() => {
  view?.unmount()
  view = null
})

describe('gear copy: weapons raise coin rewards, not word progress', () => {
  it('armory never claims words count extra', () => {
    view = render(<ArmoryPanel />)
    const text = view.container.textContent ?? ''
    expect(text).not.toMatch(/counts? ×|count double|toward quests/i)
    expect(text).toMatch(/×1\.15 coin rewards/)
  })

  it('weapon and Word Burst descriptions talk about coins', () => {
    for (const w of WEAPONS) expect(w.description).not.toMatch(/word power|words (come|flow)/i)
    expect(getItemById('word-burst')?.description).toBe('Your next 50 words earn double coins.')
  })

  it('guild header tooltip says the weapon raises coin rewards', () => {
    view = render(<AdventurersGuild open activeTab="armory" onTabChange={() => {}} onClose={() => {}} />)
    const tip = view.container.querySelector('[title^="Enchanted Quill"]')?.getAttribute('title')
    expect(tip).toBe('Enchanted Quill: ×1.15 coin rewards')
  })
})
