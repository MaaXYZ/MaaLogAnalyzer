import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import type { TaskInfo } from '../../../../types'
import { useFlowchartTimeline } from '../useFlowchartTimeline'

const makeTask = (nodes: TaskInfo['nodes']): TaskInfo => ({
  task_id: 101,
  entry: 'FlowTask',
  hash: 'h-flow',
  uuid: 'u-flow',
  start_time: '2026-04-07 10:00:00.000',
  status: 'succeeded',
  nodes,
  events: [],
})

describe('useFlowchartTimeline', () => {
  it('builds execution timeline in global execution order', () => {
    const task = makeTask([
      {
        node_id: 3003,
        name: 'NodeC',
        ts: '2026-04-07 10:00:00.300',
        status: 'success',
        task_id: 101,
        next_list: [],
      },
      {
        node_id: 3001,
        name: 'NodeA',
        ts: '2026-04-07 10:00:00.100',
        status: 'success',
        task_id: 101,
        next_list: [],
      },
      {
        node_id: 3002,
        name: 'NodeB',
        ts: '2026-04-07 10:00:00.200',
        status: 'failed',
        task_id: 101,
        next_list: [],
      },
    ])

    const selectedTask = ref<TaskInfo | null>(task)
    const timeline = useFlowchartTimeline({
      selectedTask: computed(() => selectedTask.value),
    })

    expect(timeline.executionTimeline.value.map(item => item.name)).toEqual(['NodeA', 'NodeB', 'NodeC'])
    expect(timeline.executionTimeline.value.map(item => item.index)).toEqual([0, 1, 2])
    expect(timeline.executionTimeline.value.map(item => item.nodeInfo.node_id)).toEqual([3001, 3002, 3003])
  })
})
