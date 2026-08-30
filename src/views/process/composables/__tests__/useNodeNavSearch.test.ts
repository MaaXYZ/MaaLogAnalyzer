import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { NodeInfo } from '../../../../types'
import { useNodeNavSearch } from '../useNodeNavSearch'

const createNode = (params: {
  nodeId: number
  name: string
  taskId: number
  nextList?: string[]
  status?: NodeInfo['status']
}): NodeInfo => ({
  node_id: params.nodeId,
  name: params.name,
  ts: '2026-04-08 10:00:00.000',
  status: params.status ?? 'success',
  task_id: params.taskId,
  next_list: (params.nextList ?? []).map((name) => ({
    name,
    anchor: false,
    jump_back: false,
  })),
})

describe('useNodeNavSearch', () => {
  it('keeps original pipeline navigation mode by default', () => {
    const nodes = ref<NodeInfo[]>([
      createNode({ nodeId: 1, name: 'A', taskId: 100, nextList: ['B'] }),
      createNode({ nodeId: 2, name: 'B', taskId: 100, nextList: ['C'] }),
      createNode({ nodeId: 3, name: 'CustomInner', taskId: 200, nextList: ['Ignored'] }),
      createNode({ nodeId: 4, name: 'C', taskId: 100, nextList: [] }),
    ])

    const rootTaskId = computed(() => 100)
    const { nodeNavItems, nodeNavMode } = useNodeNavSearch(nodes, rootTaskId)

    expect(nodeNavMode.value).toBe('pipeline')
    expect(nodeNavItems.value.map((item) => item.node.name)).toEqual(['A', 'B', 'CustomInner', 'C'])
    expect(nodeNavItems.value.map((item) => item.originalIndex)).toEqual([0, 1, 2, 3])
  })

  it('builds recognition navigation from root-level execution order and semantic labels', () => {
    const nodes = ref<NodeInfo[]>([
      {
        ...createNode({ nodeId: 1, name: 'NodeHit', taskId: 100, nextList: ['B'] }),
        ts: '2026-04-08 10:00:00.100',
        node_details: {
          action_id: 1,
          completed: true,
          name: 'B',
          node_id: 1,
          reco_id: 1,
        },
      },
      {
        ...createNode({
          nodeId: 2,
          name: 'NodeRunning',
          taskId: 100,
          nextList: ['RecoRunning'],
          status: 'running',
        }),
        ts: '2026-04-08 10:00:00.400',
      },
      {
        ...createNode({ nodeId: 3, name: 'CustomInner', taskId: 200, nextList: ['Ignored'] }),
        ts: '2026-04-08 10:00:00.150',
      },
      {
        ...createNode({
          nodeId: 4,
          name: 'NodeActionFailed',
          taskId: 100,
          nextList: ['CCBuyCard'],
          status: 'failed',
        }),
        ts: '2026-04-08 10:00:00.200',
        action_details: {
          action_id: 2,
          action: 'Click',
          box: [0, 0, 1, 1],
          detail: {},
          name: 'CCBuyCard',
          success: false,
        },
      },
      {
        ...createNode({
          nodeId: 5,
          name: 'NodeTimeout',
          taskId: 100,
          nextList: ['RecoTimeout'],
          status: 'failed',
        }),
        ts: '2026-04-08 10:00:00.300',
      },
    ])

    const rootTaskId = computed(() => 100)
    const { nodeNavItems, setNodeNavMode } = useNodeNavSearch(nodes, rootTaskId)
    setNodeNavMode('next-list-hit')

    expect(nodeNavItems.value.map((item) => item.primaryText)).toEqual([
      'B',
      '动作失败: CCBuyCard',
      '未命中（识别超时）',
      '未命中（识别中）',
    ])
    expect(nodeNavItems.value.map((item) => item.navStatus)).toEqual([
      'success',
      'action-failed',
      'timeout',
      'running',
    ])
    expect(nodeNavItems.value.map((item) => item.originalIndex)).toEqual([0, 3, 4, 1])
    expect(nodeNavItems.value.map((item) => item.node.node_id)).toEqual([1, 4, 5, 2])
  })

  it('does not include jump_back or anchor prefixes in recognition label', () => {
    const nodes = ref<NodeInfo[]>([
      {
        ...createNode({ nodeId: 21, name: 'A', taskId: 100, nextList: [] }),
        next_list: [{ name: 'B', anchor: true, jump_back: true }],
        node_details: {
          action_id: 1,
          completed: true,
          name: 'B',
          node_id: 21,
          reco_id: 1,
        },
      },
      createNode({ nodeId: 22, name: 'B', taskId: 100, nextList: [] }),
    ])

    const rootTaskId = computed(() => 100)
    const { nodeNavItems, setNodeNavMode } = useNodeNavSearch(nodes, rootTaskId)
    setNodeNavMode('next-list-hit')

    expect(nodeNavItems.value).toHaveLength(2)
    expect(nodeNavItems.value[0]?.primaryText).toBe('B')
  })

  it('toggles failed-only filter for pipeline and recognition modes', () => {
    const nodes = ref<NodeInfo[]>([
      {
        ...createNode({ nodeId: 31, name: 'NodeHit', taskId: 100, nextList: ['CCBuyCard'] }),
        ts: '2026-04-08 10:00:00.100',
        node_details: {
          action_id: 3,
          completed: true,
          name: 'CCBuyCard',
          node_id: 31,
          reco_id: 3,
        },
      },
      {
        ...createNode({
          nodeId: 32,
          name: 'NodeActionFailed',
          taskId: 100,
          nextList: ['CCCombatEnd'],
          status: 'failed',
        }),
        ts: '2026-04-08 10:00:00.200',
        action_details: {
          action_id: 4,
          action: 'Click',
          box: [0, 0, 1, 1],
          detail: {},
          name: 'CCCombatEnd',
          success: false,
        },
      },
      {
        ...createNode({
          nodeId: 33,
          name: 'NodeFailed',
          taskId: 100,
          nextList: ['RecoTimeout'],
          status: 'failed',
        }),
        ts: '2026-04-08 10:00:00.300',
      },
      {
        ...createNode({
          nodeId: 34,
          name: 'NodeRunning',
          taskId: 100,
          nextList: ['RecoRunning'],
          status: 'running',
        }),
        ts: '2026-04-08 10:00:00.400',
      },
    ])

    const rootTaskId = computed(() => 100)
    const { nodeNavItems, nodeNavFailedOnly, setNodeNavMode, toggleNodeNavFailedOnly } =
      useNodeNavSearch(nodes, rootTaskId)

    expect(nodeNavFailedOnly.value).toBe(false)
    expect(nodeNavItems.value.map((item) => item.node.node_id)).toEqual([31, 32, 33, 34])

    toggleNodeNavFailedOnly()
    expect(nodeNavFailedOnly.value).toBe(true)
    expect(nodeNavItems.value.map((item) => item.node.node_id)).toEqual([32, 33])

    setNodeNavMode('next-list-hit')
    expect(nodeNavItems.value.map((item) => item.primaryText)).toEqual([
      '动作失败: CCCombatEnd',
      '未命中（识别超时）',
    ])

    toggleNodeNavFailedOnly()
    expect(nodeNavFailedOnly.value).toBe(false)
    expect(nodeNavItems.value.map((item) => item.primaryText)).toEqual([
      'CCBuyCard',
      '动作失败: CCCombatEnd',
      '未命中（识别超时）',
      '未命中（识别中）',
    ])
  })

  it('returns root-layer empty description when selected root task has no nodes', () => {
    const nodes = ref<NodeInfo[]>([
      createNode({ nodeId: 11, name: 'A', taskId: 200, nextList: ['X'] }),
      createNode({ nodeId: 12, name: 'B', taskId: 200, nextList: [] }),
    ])

    const rootTaskId = computed(() => 100)
    const { nodeNavItems, nodeNavEmptyDescription, setNodeNavMode } = useNodeNavSearch(
      nodes,
      rootTaskId,
    )
    setNodeNavMode('next-list-hit')

    expect(nodeNavItems.value).toHaveLength(0)
    expect(nodeNavEmptyDescription.value).toBe('暂无根层节点数据')
  })

  it('builds focus navigation entries for node and flow item focus configs', () => {
    const nodes = ref<NodeInfo[]>([
      {
        ...createNode({ nodeId: 41, name: 'FocusedNode', taskId: 100 }),
        focus: { display: ['log', 'toast'], content: 'Node {name}' },
        node_flow: [
          {
            id: 'reco.1',
            type: 'recognition',
            name: 'FocusedReco',
            status: 'failed',
            ts: '2026-04-08 10:00:00.100',
            focus: 'Reco focus',
          },
        ],
      },
      {
        ...createNode({ nodeId: 42, name: 'OtherTaskNode', taskId: 200 }),
        focus: 'Should be filtered by task',
      },
    ])

    const rootTaskId = computed(() => 100)
    const { nodeNavItems, setNodeNavMode, toggleNodeNavFailedOnly } = useNodeNavSearch(
      nodes,
      rootTaskId,
    )
    setNodeNavMode('focus')

    expect(nodeNavItems.value.map((item) => item.primaryText)).toEqual([
      'FocusedNode',
      'FocusedReco',
    ])
    expect(nodeNavItems.value.map((item) => item.focusKind)).toEqual(['node', 'recognition'])
    expect(nodeNavItems.value.map((item) => item.focusDisplay)).toEqual(['log/toast', 'log'])
    expect(nodeNavItems.value[1]?.targetFlowItemId).toBe('reco.1')

    toggleNodeNavFailedOnly()
    expect(nodeNavItems.value.map((item) => item.primaryText)).toEqual(['FocusedReco'])
  })

  it('only shows focus entries that can be resolved for the current source kind', () => {
    const actionFocus = { 'Node.Action.Starting': '主任务启动' }
    const nodes = ref<NodeInfo[]>([
      {
        ...createNode({ nodeId: 51, name: 'BatchUseDetectorMain', taskId: 100 }),
        focus: actionFocus,
        node_flow: [
          {
            id: 'recognition:1',
            type: 'recognition',
            name: 'BatchUseDetectorMain',
            status: 'success',
            ts: '2026-05-15 11:38:58.201',
            focus: actionFocus,
          },
          {
            id: 'action:1',
            type: 'action',
            name: 'BatchUseDetectorMain',
            status: 'success',
            ts: '2026-05-15 11:38:58.454',
            focus: actionFocus,
          },
        ],
      },
    ])

    const rootTaskId = computed(() => 100)
    const { nodeNavItems, setNodeNavMode } = useNodeNavSearch(nodes, rootTaskId)
    setNodeNavMode('focus')

    expect(nodeNavItems.value).toHaveLength(1)
    expect(nodeNavItems.value[0]?.focusKind).toBe('action')
    expect(nodeNavItems.value[0]?.targetFlowItemId).toBe('action:1')
  })
})
