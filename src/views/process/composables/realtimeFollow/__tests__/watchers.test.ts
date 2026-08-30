import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { NodeInfo, TaskInfo } from '../../../../../types'
import { setupRealtimeFollowWatchers } from '../watchers'

const makeTask = (params: {
  taskId: number
  entry: string
  hash: string
  uuid: string
  startEventIndex: number
}): TaskInfo => ({
  task_id: params.taskId,
  entry: params.entry,
  hash: params.hash,
  uuid: params.uuid,
  start_time: '2026-04-10 12:00:00.000',
  status: 'running',
  nodes: [],
  events: [],
  _startEventIndex: params.startEventIndex,
})

describe('setupRealtimeFollowWatchers', () => {
  it('does not scroll to top when selectedTask is same identity with a new object reference', async () => {
    const taskA = makeTask({
      taskId: 1,
      entry: 'TaskA',
      hash: 'h-a',
      uuid: 'u-a',
      startEventIndex: 11,
    })
    const taskARefreshed: TaskInfo = {
      ...taskA,
      nodes: [
        {
          node_id: 101,
          name: 'NodeA',
          ts: '2026-04-10 12:00:01.000',
          status: 'running',
          task_id: 1,
          next_list: [],
        } as NodeInfo,
      ],
    }

    const tasks = ref<TaskInfo[]>([taskA])
    const selectedTask = ref<TaskInfo | null>(taskA)
    const pendingScrollNodeId = ref<number | null>(null)
    const isRealtimeStreaming = ref(false)
    const followLast = ref(false)
    const activeTaskIndex = ref(0)
    const currentNodes = ref<Array<NodeInfo & { _uniqueKey: string }>>([])

    const safeScrollToItem = vi.fn(async () => true)
    const scrollToNode = vi.fn(async () => {})
    const onScrollDone = vi.fn()
    const scheduleFollowToLatest = vi.fn()

    setupRealtimeFollowWatchers({
      tasks,
      selectedTask,
      pendingScrollNodeId,
      isRealtimeStreaming,
      followLast,
      activeTaskIndex,
      currentNodes,
      safeScrollToItem,
      scrollToNode,
      onScrollDone,
      scheduleFollowToLatest,
    })

    await nextTick()
    expect(safeScrollToItem).toHaveBeenCalledTimes(1)

    tasks.value = [taskARefreshed]
    selectedTask.value = taskARefreshed
    await nextTick()

    expect(safeScrollToItem).toHaveBeenCalledTimes(1)
  })

  it('scrolls to top when switching to a different task identity', async () => {
    const taskA = makeTask({
      taskId: 1,
      entry: 'TaskA',
      hash: 'h-a',
      uuid: 'u-a',
      startEventIndex: 11,
    })
    const taskB = makeTask({
      taskId: 2,
      entry: 'TaskB',
      hash: 'h-b',
      uuid: 'u-b',
      startEventIndex: 21,
    })

    const tasks = ref<TaskInfo[]>([taskA, taskB])
    const selectedTask = ref<TaskInfo | null>(taskA)
    const pendingScrollNodeId = ref<number | null>(null)
    const isRealtimeStreaming = ref(false)
    const followLast = ref(false)
    const activeTaskIndex = ref(0)
    const currentNodes = ref<Array<NodeInfo & { _uniqueKey: string }>>([])

    const safeScrollToItem = vi.fn(async () => true)
    const scrollToNode = vi.fn(async () => {})
    const onScrollDone = vi.fn()
    const scheduleFollowToLatest = vi.fn()

    setupRealtimeFollowWatchers({
      tasks,
      selectedTask,
      pendingScrollNodeId,
      isRealtimeStreaming,
      followLast,
      activeTaskIndex,
      currentNodes,
      safeScrollToItem,
      scrollToNode,
      onScrollDone,
      scheduleFollowToLatest,
    })

    await nextTick()
    expect(safeScrollToItem).toHaveBeenCalledTimes(1)

    selectedTask.value = taskB
    await nextTick()

    expect(safeScrollToItem).toHaveBeenCalledTimes(2)
    expect(activeTaskIndex.value).toBe(1)
  })
})
