import { describe, expect, it } from 'vitest'
import { buildTaskMetaLine } from '../taskMetaLine'

describe('buildTaskMetaLine', () => {
  it('merges node count, duration and time into one line', () => {
    expect(
      buildTaskMetaLine({
        nodeCount: 22,
        duration: 63000,
        startTime: '2026-03-04 03:39:25.477',
      }),
    ).toBe('22 节点 · 1m 3s · 03:39:25')
  })

  it('keeps only the node count when duration and time are missing', () => {
    expect(buildTaskMetaLine({ nodeCount: 3 })).toBe('3 节点')
  })

  it('keeps the time when there is no duration', () => {
    expect(buildTaskMetaLine({ nodeCount: 1, startTime: '2026-07-27 01:00:00.000' })).toBe(
      '1 节点 · 01:00:00',
    )
  })

  it('falls back to the raw timestamp when the format is unfamiliar', () => {
    expect(buildTaskMetaLine({ nodeCount: 2, startTime: '2026.07.27-01.00.00.000' })).toBe(
      '2 节点 · 2026.07.27-01.00.00.000',
    )
  })
})
