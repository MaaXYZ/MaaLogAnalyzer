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

    expect(timeline.executionTimeline.value.map((item) => item.name)).toEqual([
      'NodeA',
      'NodeB',
      'NodeC',
    ])
    expect(timeline.executionTimeline.value.map((item) => item.index)).toEqual([0, 1, 2])
    expect(timeline.executionTimeline.value.map((item) => item.nodeInfo.node_id)).toEqual([
      3001, 3002, 3003,
    ])
  })

  it('derives timeline labels including timeout and action-failed states', () => {
    const task = makeTask([
      {
        node_id: 4001,
        name: 'NodeHitSuccess',
        ts: '2026-04-07 10:00:00.100',
        status: 'success',
        task_id: 101,
        next_list: [{ name: 'CCCombatEnd', anchor: false, jump_back: false }],
        node_details: {
          action_id: 1,
          completed: true,
          name: 'CCCombatEnd',
          node_id: 4001,
          reco_id: 1,
        },
      },
      {
        node_id: 4002,
        name: 'NodeActionFailed',
        ts: '2026-04-07 10:00:00.200',
        status: 'failed',
        task_id: 101,
        next_list: [{ name: 'CCBuyCard', anchor: false, jump_back: false }],
        action_details: {
          action: 'Click',
          action_id: 2,
          box: [0, 0, 1, 1],
          detail: {},
          name: 'CCBuyCard',
          success: false,
        },
      },
      {
        node_id: 4003,
        name: 'NodeTimeout',
        ts: '2026-04-07 10:00:00.300',
        status: 'failed',
        task_id: 101,
        next_list: [{ name: 'RecoA', anchor: false, jump_back: false }],
      },
      {
        node_id: 4004,
        name: 'NodeRunningNoHit',
        ts: '2026-04-07 10:00:00.400',
        status: 'running',
        task_id: 101,
        next_list: [{ name: 'RecoB', anchor: false, jump_back: false }],
      },
    ])

    const selectedTask = ref<TaskInfo | null>(task)
    const timeline = useFlowchartTimeline({
      selectedTask: computed(() => selectedTask.value),
    })

    expect(timeline.timelineNavItems.value.map((item) => item.name)).toEqual([
      'CCCombatEnd',
      '动作失败: CCBuyCard',
      '未命中（识别超时）',
      '未命中（识别中）',
    ])
    expect(timeline.timelineNavItems.value.map((item) => item.status)).toEqual([
      'success',
      'action-failed',
      'timeout',
      'running',
    ])
  })

  it('normalizes JumpBack-prefixed hit names to actual next-list node names', () => {
    const task = makeTask([
      {
        node_id: 5001,
        name: 'ParentNode',
        ts: '2026-04-07 10:00:01.100',
        status: 'success',
        task_id: 101,
        next_list: [{ name: 'CombatEntering', anchor: false, jump_back: true }],
        node_flow: [
          {
            id: 'node.recognition.0',
            type: 'recognition',
            name: '[JumpBack]CombatEntering',
            status: 'success',
            ts: '2026-04-07 10:00:01.120',
          },
        ],
      },
    ])

    const selectedTask = ref<TaskInfo | null>(task)
    const timeline = useFlowchartTimeline({
      selectedTask: computed(() => selectedTask.value),
    })

    expect(timeline.timelineNavItems.value).toHaveLength(1)
    expect(timeline.timelineNavItems.value[0]?.name).toBe('CombatEntering')
    expect(timeline.timelineNavItems.value[0]?.focusNodeId).toBe('CombatEntering')

    timeline.selectedTimelineIndex.value = 0
    expect(timeline.selectedFlowNodeId.value).toBe('CombatEntering')
  })

  it('uses matched recognition target as execution node name', () => {
    const task = makeTask([
      {
        node_id: 6001,
        name: 'CCFlagInCombatMain',
        ts: '2026-04-07 10:00:02.100',
        status: 'success',
        task_id: 101,
        next_list: [{ name: 'CCBuyCard', anchor: false, jump_back: false }],
        node_flow: [
          {
            id: 'node.recognition.0',
            type: 'recognition',
            name: 'CCBuyCard',
            status: 'success',
            ts: '2026-04-07 10:00:02.120',
          },
        ],
      },
    ])

    const selectedTask = ref<TaskInfo | null>(task)
    const timeline = useFlowchartTimeline({
      selectedTask: computed(() => selectedTask.value),
    })

    expect(timeline.executionTimeline.value.map((item) => item.name)).toEqual(['CCBuyCard'])
    expect(timeline.timelineNavItems.value.map((item) => item.name)).toEqual(['CCBuyCard'])

    timeline.selectedTimelineIndex.value = 0
    expect(timeline.selectedFlowNodeId.value).toBe('CCBuyCard')
  })
})
