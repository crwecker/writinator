import { afterEach, describe, expect, it } from 'vitest'
import { getTabConflict, startTabPresence, type PresenceChannel } from './tabPresence'
import { makeBook, makeStorylet, seedStore } from '../test/fixtures'

type Sent = Parameters<PresenceChannel['postMessage']>[0]

function fakeChannel() {
  const sent: Sent[] = []
  const channel: PresenceChannel = {
    postMessage: (m) => {
      sent.push(m)
    },
    onmessage: null,
    close: () => {},
  }
  const receive = (m: Sent) => channel.onmessage?.(new MessageEvent('message', { data: m }))
  return { channel, sent, receive }
}

let stop: () => void = () => {}
afterEach(() => stop())

describe('another tab with the same book', () => {
  it('is noticed, and cleared when that tab closes the book', () => {
    seedStore(makeBook([makeStorylet('a', 'text')], 'book-1'))
    const { channel, sent, receive } = fakeChannel()
    stop = startTabPresence(channel)
    expect(sent[0]).toMatchObject({ type: 'hello', bookId: 'book-1' })

    receive({ type: 'hello', tabId: 'other-tab', bookId: 'book-1' })
    expect(getTabConflict()).toBe(true)
    expect(sent.at(-1)).toMatchObject({ type: 'here', bookId: 'book-1' })

    receive({ type: 'bye', tabId: 'other-tab', bookId: 'book-1' })
    expect(getTabConflict()).toBe(false)
  })

  it('ignores tabs with a different book', () => {
    seedStore(makeBook([makeStorylet('a', 'text')], 'book-1'))
    const { channel, receive } = fakeChannel()
    stop = startTabPresence(channel)

    receive({ type: 'hello', tabId: 'other-tab', bookId: 'book-2' })
    expect(getTabConflict()).toBe(false)
  })

  it('stays off in tests unless a channel is given', () => {
    expect(startTabPresence()).toBeTypeOf('function')
    expect(getTabConflict()).toBe(false)
  })
})
