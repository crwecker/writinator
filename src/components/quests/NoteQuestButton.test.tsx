import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NoteQuestButton } from './NoteQuestButton'
import { noteQuestTitle } from '../../lib/noteQuest'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { render, type Rendered } from '../../test/render'

let view: Rendered | null = null

beforeEach(() => {
  useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
})

afterEach(() => {
  view?.unmount()
  view = null
})

describe('notes → quests', () => {
  it('titles the quest from the first line of the note, trimmed of markdown', () => {
    expect(noteQuestTitle('# Fix the tavern scene\nmore detail')).toBe('Fix the tavern scene')
    expect(noteQuestTitle('   ')).toBe('A note to self')
    expect(noteQuestTitle('x'.repeat(100)).length).toBeLessThanOrEqual(60)
  })

  it('pins a villager request with the chosen word goal', () => {
    view = render(<NoteQuestButton body={'Rewrite the duel\nIt drags.'} />)
    const toggle = view.container.querySelector('[data-testid="note-make-quest"]') as HTMLButtonElement
    act(() => toggle.click())
    const goal = document.body.querySelector('[data-testid="note-quest-goal-1000"]') as HTMLButtonElement
    act(() => goal.click())
    const quests = useWriteathonStore.getState().villagerQuests
    expect(quests).toHaveLength(1)
    expect(quests[0]).toMatchObject({ type: 'villager', title: 'Rewrite the duel', wordGoal: 1000 })
    expect(quests[0].description).toContain('It drags.')
  })
})
