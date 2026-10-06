import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { DeltaEditorModal } from './DeltaEditorModal'
import { useCharacterStore } from '../../stores/characterStore'
import { delta, makeBook, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import { item, makeHero } from '../../test/characterFixtures'
import { selectValue, typeInto } from '../../test/domEvents'
import { render, type Rendered } from '../../test/render'
import type { StatDelta } from '../../types'

const kael = makeHero('kael', { hp: [40, 40], inventory: [item('Arrows', 5)] })
const M = '33333333-3333-3333-3333-333333333333'
const DOC = `Before.<!-- stat:${M} --> After.`

let rendered: Rendered | null = null
let view: EditorView | null = null
afterEach(() => {
  rendered?.unmount()
  view?.destroy()
  rendered = null
  view = null
})

function open(deltas: StatDelta[]) {
  seedStore(makeBook([makeStorylet('c1', DOC)]), 'c1')
  seedCharacters([kael], { [M]: deltas })
  view = new EditorView({ state: EditorState.create({ doc: DOC }) })
  rendered = render(
    createElement(DeltaEditorModal, { open: true, onClose: vi.fn(), markerId: M, mode: 'edit', editorView: view }),
  )
}

const all = <T extends HTMLElement>(testId: string) =>
  Array.from(rendered!.container.querySelectorAll<T>(`[data-testid="${testId}"]`))
function one<T extends HTMLElement>(testId: string, i = 0): T {
  const el = all<T>(testId)[i]
  expect(el, testId).toBeDefined()
  return el
}
const optionLabels = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.textContent)
const save = () => act(() => one('delta-save').click())

describe('delta editor — plain verbs', () => {
  it('offers only the verbs that fit the chosen stat', () => {
    open([delta('kael', { kind: 'adjust', statId: 'hp', delta: -5 })])
    expect(optionLabels(one('delta-verb'))).toEqual(['Damage', 'Heal', 'Set to', 'Raise max', 'Lower max', 'Refill'])
    selectValue(one('delta-target'), 'stat:gold')
    expect(optionLabels(one('delta-verb'))).toEqual(['Change', 'Set to'])
    selectValue(one('delta-target'), 'stat:spells')
    expect(optionLabels(one('delta-verb'))).toEqual(['Learn', 'Forget', 'Change level / cost', 'Set to'])
    selectValue(one('delta-target'), 'equipment')
    expect(optionLabels(one('delta-verb'))).toEqual(['Equip', 'Unequip'])
  })

  it('records Damage 15 as an adjust of -15', () => {
    open([delta('kael', { kind: 'adjust', statId: 'hp', delta: -5 }, 'd1')])
    expect(one<HTMLSelectElement>('delta-verb').value).toBe('damage')
    expect(one<HTMLInputElement>('delta-amount').value).toBe('5')
    typeInto(one('delta-amount'), '15')
    save()
    expect(useCharacterStore.getState().markers[M][0].op).toEqual({ kind: 'adjust', statId: 'hp', delta: -15 })
  })

  it('switching Damage to Heal keeps the amount and flips the sign', () => {
    open([delta('kael', { kind: 'adjust', statId: 'hp', delta: -5 })])
    selectValue(one('delta-verb'), 'heal')
    save()
    expect(useCharacterStore.getState().markers[M][0].op).toEqual({ kind: 'adjust', statId: 'hp', delta: 5 })
  })

  it('shows before → after per row, in order', () => {
    open([
      delta('kael', { kind: 'adjust', statId: 'hp', delta: -5 }),
      delta('kael', { kind: 'adjust', statId: 'hp', delta: -10 }),
      delta('kael', { kind: 'itemRemove', statId: 'inventory', name: 'Rope' }),
    ])
    expect(all('delta-preview').map((el) => el.textContent)).toEqual([
      'HP 40 → 35',
      'HP 35 → 25',
      '−Rope⚠ Kael doesn’t have Rope',
    ])
  })

  it('saves an untouched marker byte-for-byte', () => {
    const deltas: StatDelta[] = [
      delta('kael', { kind: 'adjust', statId: 'attributes', delta: 2, attributeKey: 'DEX' }),
      delta('kael', { kind: 'set', statId: 'rank', value: { kind: 'rank', tier: 'B' } }),
      delta('kael', { kind: 'itemFieldAdjust', statId: 'spells', name: 'Fireball', field: 'mana', delta: -1 }),
      delta('kael', { kind: 'listAdd', statId: 'status_effects', items: ['Poisoned', 'Tired x2'] }),
      {
        ...delta('kael', {
          kind: 'equip',
          slot: 'Weapon',
          itemId: 'sword-1',
          itemName: 'Iron Sword',
          modifiers: [{ statId: 'attributes', kind: 'flat', amount: 2, attributeKey: 'STR' }],
        }),
        note: 'from the smith',
      },
      delta('kael', { kind: 'buffApply', buffId: 'b1', buffName: 'Haste', modifiers: [], expiresAfter: 2 }),
      delta('kael', { kind: 'maxAdjust', statId: 'hp', delta: -3 }),
      delta('kael', { kind: 'rankChange', statId: 'rank', direction: 'down' }),
    ]
    open(deltas)
    save()
    expect(useCharacterStore.getState().markers[M]).toEqual(deltas)
  })
})
