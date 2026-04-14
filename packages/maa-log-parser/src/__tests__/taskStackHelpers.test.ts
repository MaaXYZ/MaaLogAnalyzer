import { describe, expect, it } from 'vitest'
import { createTaskStackTracker } from '../task/stackHelpers'

describe('TaskStackHelpers', () => {
  it('push keeps latest task on top and deduplicates existing task id', () => {
    const tracker = createTaskStackTracker(1)
    tracker.push(2)
    tracker.push(3)
    expect(tracker.peek()).toBe(3)

    tracker.push(2)
    expect(tracker.peek()).toBe(2)
  })

  it('pop removes task and falls back to root task when stack becomes empty', () => {
    const tracker = createTaskStackTracker(10)
    tracker.push(11)
    tracker.pop(11)
    expect(tracker.peek()).toBe(10)

    tracker.pop(10)
    expect(tracker.peek()).toBe(10)
  })

  it('reset restores root task as active', () => {
    const tracker = createTaskStackTracker(100)
    tracker.push(101)
    tracker.push(102)
    expect(tracker.peek()).toBe(102)

    tracker.reset()
    expect(tracker.peek()).toBe(100)
  })
})
