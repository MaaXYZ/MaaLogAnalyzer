import { isReactive, reactive, toRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { reviveParsedTaskList } from '../parsedTaskRevival'
import type { TaskInfo } from '../../types'

const createTask = (overrides: Partial<TaskInfo> = {}): TaskInfo =>
  ({
    task_id: 1,
    entry: 'Entry',
    hash: 'hash',
    uuid: 'uuid',
    start_time: '2026.07.27-01.00.00.000',
    status: 'succeeded',
    nodes: [],
    events: [],
    ...overrides,
  }) as TaskInfo

describe('reviveParsedTaskList', () => {
  it('deep freezes the projected task tree', () => {
    const task = createTask({
      nodes: [
        {
          node_id: 1,
          name: 'Node',
          ts: '2026.07.27-01.00.00.000',
          status: 'success',
          task_id: 1,
          next_list: [{ name: 'Next', anchor: false, jump_back: false }],
        },
      ],
    } as Partial<TaskInfo>)

    reviveParsedTaskList([task])

    expect(Object.isFrozen(task)).toBe(true)
    expect(Object.isFrozen(task.nodes)).toBe(true)
    expect(Object.isFrozen(task.nodes[0])).toBe(true)
    expect(Object.isFrozen(task.nodes[0]!.next_list[0])).toBe(true)
  })

  it('restores markRaw on detail payloads so Vue does not proxy them', () => {
    const waitFreezesDetails = { wf_id: 7, images: ['blob:vision'] }
    const task = createTask({
      nodes: [
        {
          node_id: 1,
          name: 'Node',
          ts: '2026.07.27-01.00.00.000',
          status: 'success',
          task_id: 1,
          next_list: [],
          node_flow: [
            {
              id: 'flow-1',
              type: 'wait_freezes',
              name: 'WaitFreezes',
              status: 'success',
              ts: '2026.07.27-01.00.00.000',
              wait_freezes_details: waitFreezesDetails,
            },
          ],
        },
      ],
    } as Partial<TaskInfo>)

    reviveParsedTaskList([task])

    const wrapper = reactive({ details: waitFreezesDetails })
    expect(isReactive(wrapper.details)).toBe(false)
    expect(toRaw(wrapper.details)).toBe(waitFreezesDetails)
  })

  it('marks raw before freezing so a shared detail object never throws', () => {
    const shared = { task_id: 9, entry: 'Shared', status: 'succeeded' as const }
    const first = createTask({
      task_id: 1,
      nodes: [
        {
          node_id: 1,
          name: 'A',
          ts: '2026.07.27-01.00.00.000',
          status: 'success',
          task_id: 1,
          next_list: [],
          node_flow: [
            {
              id: 'flow-a',
              type: 'task',
              name: 'A',
              status: 'success',
              ts: '2026.07.27-01.00.00.000',
              task_details: shared,
            },
          ],
        },
      ],
    } as Partial<TaskInfo>)
    // The same details object reachable from a second task forces the two-pass
    // ordering: freezing during the first traversal would break markRaw here.
    const second = createTask({
      task_id: 2,
      nodes: [
        {
          node_id: 2,
          name: 'B',
          ts: '2026.07.27-01.00.00.000',
          status: 'success',
          task_id: 2,
          next_list: [],
          node_flow: [
            {
              id: 'flow-b',
              type: 'task',
              name: 'B',
              status: 'success',
              ts: '2026.07.27-01.00.00.000',
              task_details: shared,
            },
          ],
        },
      ],
    } as Partial<TaskInfo>)

    expect(() => reviveParsedTaskList([first, second])).not.toThrow()
    expect(Object.isFrozen(shared)).toBe(true)
  })

  it('tolerates cyclic references', () => {
    const task = createTask()
    ;(task as unknown as Record<string, unknown>).self = task

    expect(() => reviveParsedTaskList([task])).not.toThrow()
    expect(Object.isFrozen(task)).toBe(true)
  })
})
