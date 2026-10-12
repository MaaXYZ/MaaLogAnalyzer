import { describe, expect, it } from 'vitest'
import type { TaskInfo } from '../../types'
import { buildTaskDateGroups, buildTaskMetaLine } from '../taskListFormat'

const makeTask = (startTime: string): TaskInfo =>
  ({
    task_id: 1,
    entry: 'Task',
    start_time: startTime,
    status: 'succeeded',
    nodes: [],
  }) as unknown as TaskInfo

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

describe('buildTaskDateGroups', () => {
  it('keeps consecutive tasks of one day together and preserves original indexes', () => {
    const groups = buildTaskDateGroups([
      makeTask('2026-03-04 03:39:25.477'),
      makeTask('2026-03-04 03:40:02.000'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('2026-03-04')
    expect(groups[0].id).toBe(0)
    expect(groups[0].items.map((item) => item.index)).toEqual([0, 1])
  })

  it('starts a new group when the date changes', () => {
    const groups = buildTaskDateGroups([
      makeTask('2026-03-04 23:59:59.000'),
      makeTask('2026-03-05 00:00:01.000'),
      makeTask('2026-03-05 00:00:02.000'),
    ])

    expect(groups.map((group) => group.label)).toEqual(['2026-03-04', '2026-03-05'])
    expect(groups.map((group) => group.items.length)).toEqual([1, 2])
    expect(groups[1].id).toBe(1)
    expect(groups[1].items.map((item) => item.index)).toEqual([1, 2])
  })

  it('treats the same day written with different separators as one group', () => {
    const groups = buildTaskDateGroups([
      makeTask('2026.07.27-01.00.00.000'),
      makeTask('2026-07-27 02:00:00.000'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('2026-07-27')
  })

  it('groups unparsable timestamps under an unknown-date label', () => {
    const groups = buildTaskDateGroups([makeTask('invalid'), makeTask('')])

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('日期未知')
    expect(groups[0].items).toHaveLength(2)
  })

  it('starts a new group when an earlier date comes back', () => {
    const groups = buildTaskDateGroups([
      makeTask('2026-03-04 01:00:00.000'),
      makeTask('2026-03-05 01:00:00.000'),
      makeTask('2026-03-04 02:00:00.000'),
    ])

    expect(groups.map((group) => group.label)).toEqual(['2026-03-04', '2026-03-05', '2026-03-04'])
    expect(groups.map((group) => group.id)).toEqual([0, 1, 2])
  })
})
