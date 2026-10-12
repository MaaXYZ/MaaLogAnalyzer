import { computed, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { TaskInfo } from '../../types'
import { buildTaskDateGroups } from '../../utils/taskListFormat'
import { useTaskGroupCollapse } from '../useTaskGroupCollapse'

const makeTask = (startTime: string): TaskInfo =>
  ({
    task_id: 1,
    entry: 'Task',
    start_time: startTime,
    status: 'succeeded',
    nodes: [],
  }) as unknown as TaskInfo

const setup = (startTimes: string[], activeIndex = -1) => {
  const tasks = ref(startTimes.map(makeTask))
  const groups = computed(() => buildTaskDateGroups(tasks.value))
  const active = ref(activeIndex)
  const { isCollapsed, toggleGroup } = useTaskGroupCollapse({ groups, activeIndex: active })

  return { groups, active, isCollapsed, toggleGroup }
}

describe('useTaskGroupCollapse', () => {
  it('collapses a group on toggle and expands it back', () => {
    const { groups, isCollapsed, toggleGroup } = setup(['2026-03-04 01:00:00.000'])

    expect(isCollapsed(groups.value[0])).toBe(false)
    toggleGroup(groups.value[0])
    expect(isCollapsed(groups.value[0])).toBe(true)
    toggleGroup(groups.value[0])
    expect(isCollapsed(groups.value[0])).toBe(false)
  })

  it('keeps different dates independent', () => {
    const { groups, isCollapsed, toggleGroup } = setup([
      '2026-03-04 01:00:00.000',
      '2026-03-05 01:00:00.000',
    ])

    toggleGroup(groups.value[0])

    expect(isCollapsed(groups.value[0])).toBe(true)
    expect(isCollapsed(groups.value[1])).toBe(false)
  })

  it('treats separate unknown-date groups as their own groups', () => {
    const { groups, isCollapsed, toggleGroup } = setup([
      'invalid',
      '2026-03-04 01:00:00.000',
      'also bad',
    ])

    expect(groups.value.map((group) => group.label)).toEqual(['日期未知', '2026-03-04', '日期未知'])
    toggleGroup(groups.value[0])

    expect(isCollapsed(groups.value[0])).toBe(true)
    expect(isCollapsed(groups.value[2])).toBe(false)
  })

  it('expands the group that holds a newly selected task', async () => {
    const { groups, active, isCollapsed, toggleGroup } = setup([
      '2026-03-04 01:00:00.000',
      '2026-03-05 01:00:00.000',
    ])

    toggleGroup(groups.value[1])
    expect(isCollapsed(groups.value[1])).toBe(true)

    active.value = 1
    await nextTick()

    expect(isCollapsed(groups.value[1])).toBe(false)
  })

  it('stays collapsed when the selected task is already inside it', async () => {
    const { groups, isCollapsed, toggleGroup } = setup(['2026-03-04 01:00:00.000'], 0)

    toggleGroup(groups.value[0])
    await nextTick()

    expect(isCollapsed(groups.value[0])).toBe(true)
  })
})
