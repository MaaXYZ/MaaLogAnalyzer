import { describe, expect, it } from 'vitest'

import {
  captureScrollPosition,
  createScrollPositionMemory,
  restoreScrollPosition,
} from './keepAliveScrollPosition'

const createScroller = (scrollTop: number, scrollHeight = 1200, clientHeight = 300) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
})

describe('keep-alive scroll position', () => {
  it('restores the saved offset for the same context', () => {
    const snapshot = captureScrollPosition(createScroller(420), 'task:1')
    const restoredScroller = createScroller(0)

    expect(restoreScrollPosition(restoredScroller, snapshot, 'task:1')).toBe(true)
    expect(restoredScroller.scrollTop).toBe(420)
  })

  it('does not apply a position from another context', () => {
    const snapshot = captureScrollPosition(createScroller(420), 'task:1')
    const restoredScroller = createScroller(75)

    expect(restoreScrollPosition(restoredScroller, snapshot, 'task:2')).toBe(false)
    expect(restoredScroller.scrollTop).toBe(75)
  })

  it('clamps the offset when the visible list becomes shorter', () => {
    const snapshot = captureScrollPosition(createScroller(900), 'task:1')
    const restoredScroller = createScroller(0, 700, 300)

    expect(restoreScrollPosition(restoredScroller, snapshot, 'task:1')).toBe(true)
    expect(restoredScroller.scrollTop).toBe(400)
  })

  it('keeps the last position captured while the scroller was visible', () => {
    const memory = createScrollPositionMemory()
    const scroller = createScroller(420)
    memory.capture(scroller, 'task:1')

    // KeepAlive moves the DOM into a zero-sized storage container before deactivation hooks run.
    scroller.scrollTop = 0

    expect(memory.restore(scroller, 'task:1')).toBe(true)
    expect(scroller.scrollTop).toBe(420)
  })

  it('discards the previous offset before an explicit navigation', () => {
    const memory = createScrollPositionMemory()
    const scroller = createScroller(420)
    memory.capture(scroller, 'task:1')
    memory.clear()
    scroller.scrollTop = 75

    expect(memory.restore(scroller, 'task:1')).toBe(false)
    expect(scroller.scrollTop).toBe(75)
  })
})
