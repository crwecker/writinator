import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '../../test/render'
import { WriteathonCompleteCelebration } from './WriteathonCompleteCelebration'
import { useWriteathonStore } from '../../stores/writeathonStore'

beforeEach(() => {
  useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
})

describe('WriteathonCompleteCelebration', () => {
  it('celebrates reaching the goal even with missed days', () => {
    useWriteathonStore.getState().startWriteathon(1000, 3000, 3, new Date(2026, 9, 1).getTime())
    const r = render(<WriteathonCompleteCelebration />)
    expect(r.container.textContent).toBe('')
    act(() => {
      const { config } = useWriteathonStore.getState()
      useWriteathonStore.setState({ config: { ...config!, completedAt: new Date().toISOString() } })
    })
    expect(r.container.textContent).toContain('WRITEATHON COMPLETE')
    r.unmount()
  })

  it('does not replay an old completion loaded from storage', () => {
    useWriteathonStore.getState().startWriteathon(1000, 3000, 3, new Date(2026, 0, 1).getTime())
    const r = render(<WriteathonCompleteCelebration />)
    act(() => {
      const { config } = useWriteathonStore.getState()
      useWriteathonStore.setState({ config: { ...config!, completedAt: '2026-01-05T00:00:00.000Z' } })
    })
    expect(r.container.textContent).toBe('')
    r.unmount()
  })
})
