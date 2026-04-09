import { describe, expect, it } from 'vitest'
import type { NodeInfo, TaskInfo } from '../../types'
import { buildFlowchartData } from '../flowchartBuilder'

const makeNode = (params: {
  nodeId: number
  name: string
  ts: string
  status?: NodeInfo['status']
  nextList?: NodeInfo['next_list']
}): NodeInfo => ({
  node_id: params.nodeId,
  name: params.name,
  ts: params.ts,
  status: params.status ?? 'success',
  task_id: 100,
  next_list: params.nextList ?? [],
})

const makeTask = (nodes: NodeInfo[]): TaskInfo => ({
  task_id: 100,
  entry: 'FlowTask',
  hash: 'h-flow',
  uuid: 'u-flow',
  start_time: '2026-04-07 10:00:00.000',
  status: 'succeeded',
  nodes,
  events: [],
})

describe('buildFlowchartData execution order', () => {
  it('uses global execution order for node badges and execution edges', async () => {
    const task = makeTask([
      makeNode({
        nodeId: 3,
        name: 'NodeC',
        ts: '2026-04-07 10:00:00.300',
        status: 'failed',
      }),
      makeNode({
        nodeId: 1,
        name: 'NodeA',
        ts: '2026-04-07 10:00:00.100',
        status: 'success',
      }),
      makeNode({
        nodeId: 2,
        name: 'NodeB',
        ts: '2026-04-07 10:00:00.200',
        status: 'running',
      }),
    ])

    const { nodes, edges } = await buildFlowchartData(task)

    const nodeA = nodes.find((node) => node.id === 'NodeA')
    const nodeB = nodes.find((node) => node.id === 'NodeB')
    const nodeC = nodes.find((node) => node.id === 'NodeC')
    expect(nodeA?.data.executionOrder).toEqual([1])
    expect(nodeB?.data.executionOrder).toEqual([2])
    expect(nodeC?.data.executionOrder).toEqual([3])

    const edgeAB = edges.find((edge) => edge.id === 'NodeA->NodeB')
    const edgeBC = edges.find((edge) => edge.id === 'NodeB->NodeC')
    expect(edgeAB?.data.executed).toBe(true)
    expect(edgeAB?.data.edgeStatus).toBe('running')
    expect(edgeAB?.data.transitionType).toBe('next')
    expect(edgeBC?.data.executed).toBe(true)
    expect(edgeBC?.data.edgeStatus).toBe('failed')
    expect(edgeBC?.data.transitionType).toBe('next')
  })

  it('keeps repeated node execution order aligned to sorted timeline', async () => {
    const task = makeTask([
      makeNode({
        nodeId: 11,
        name: 'NodeA',
        ts: '2026-04-07 10:00:00.300',
      }),
      makeNode({
        nodeId: 12,
        name: 'NodeA',
        ts: '2026-04-07 10:00:00.100',
      }),
      makeNode({
        nodeId: 13,
        name: 'NodeB',
        ts: '2026-04-07 10:00:00.200',
      }),
    ])

    const { nodes } = await buildFlowchartData(task)
    const nodeA = nodes.find((node) => node.id === 'NodeA')
    const nodeB = nodes.find((node) => node.id === 'NodeB')

    expect(nodeA?.data.executionOrder).toEqual([1, 3])
    expect(nodeB?.data.executionOrder).toEqual([2])
  })

  it('marks matched recognition target as executed node instead of raw pipeline card name', async () => {
    const task = makeTask([
      {
        ...makeNode({
          nodeId: 21,
          name: 'CCFlagInCombatMain',
          ts: '2026-04-07 10:00:00.100',
          status: 'success',
          nextList: [{ name: 'CCCombatEnd', anchor: false, jump_back: false }],
        }),
        node_flow: [
          {
            id: 'node.recognition.0',
            type: 'recognition',
            name: 'CCCombatEnd',
            status: 'success',
            ts: '2026-04-07 10:00:00.120',
          },
        ],
      },
    ])

    const { nodes } = await buildFlowchartData(task)

    const hitNode = nodes.find((node) => node.id === 'CCCombatEnd')
    expect(hitNode?.data.executionOrder).toEqual([1])

    const rawPipelineNode = nodes.find((node) => node.id === 'CCFlagInCombatMain')
    expect(rawPipelineNode?.data.executionOrder ?? []).toEqual([])
  })

  it('does not connect consecutive JumpBack hits directly when they come from the same parent pipeline node', async () => {
    const task = makeTask([
      {
        ...makeNode({
          nodeId: 31,
          name: 'ParentNode',
          ts: '2026-04-07 10:00:10.100',
          status: 'success',
          nextList: [{ name: 'JumpA', anchor: false, jump_back: true }],
        }),
        node_flow: [
          {
            id: 'node.recognition.0',
            type: 'recognition',
            name: 'JumpA',
            status: 'success',
            ts: '2026-04-07 10:00:10.120',
          },
        ],
      },
      {
        ...makeNode({
          nodeId: 32,
          name: 'ParentNode',
          ts: '2026-04-07 10:00:10.300',
          status: 'success',
          nextList: [{ name: 'JumpB', anchor: false, jump_back: true }],
        }),
        node_flow: [
          {
            id: 'node.recognition.1',
            type: 'recognition',
            name: 'JumpB',
            status: 'success',
            ts: '2026-04-07 10:00:10.320',
          },
        ],
      },
    ])

    const { edges } = await buildFlowchartData(task)

    const directJumpBackEdge = edges.find((edge) => edge.id === 'JumpA->JumpB')
    expect(directJumpBackEdge).toBeUndefined()

    const returnEdge = edges.find((edge) => edge.id === 'JumpA->ParentNode')
    expect(returnEdge?.data.executed).toBe(true)
    expect(returnEdge?.data.transitionType).toBe('jump-back-return')

    const parentToSecondJumpBack = edges.find((edge) => edge.id === 'ParentNode->JumpB')
    expect(parentToSecondJumpBack?.data.executed).toBe(true)
    expect(parentToSecondJumpBack?.data.transitionType).toBe('jump-back')
  })

  it('does not connect jump_back hit directly to later non-jump_back hit when context returns to same parent', async () => {
    const task = makeTask([
      {
        ...makeNode({
          nodeId: 41,
          name: 'ParentNode',
          ts: '2026-04-07 10:00:20.100',
          status: 'success',
          nextList: [{ name: 'JumpA', anchor: false, jump_back: true }],
        }),
        node_flow: [
          {
            id: 'node.recognition.0',
            type: 'recognition',
            name: 'JumpA',
            status: 'success',
            ts: '2026-04-07 10:00:20.120',
          },
        ],
      },
      {
        ...makeNode({
          nodeId: 42,
          name: 'ParentNode',
          ts: '2026-04-07 10:00:20.300',
          status: 'success',
          nextList: [{ name: 'NormalB', anchor: false, jump_back: false }],
        }),
        node_flow: [
          {
            id: 'node.recognition.1',
            type: 'recognition',
            name: 'NormalB',
            status: 'success',
            ts: '2026-04-07 10:00:20.320',
          },
        ],
      },
    ])

    const { edges } = await buildFlowchartData(task)

    const directEdge = edges.find((edge) => edge.id === 'JumpA->NormalB')
    expect(directEdge).toBeUndefined()

    const returnEdge = edges.find((edge) => edge.id === 'JumpA->ParentNode')
    expect(returnEdge?.data.executed).toBe(true)
    expect(returnEdge?.data.transitionType).toBe('jump-back-return')

    const parentEdge = edges.find((edge) => edge.id === 'ParentNode->NormalB')
    expect(parentEdge?.data.executed).toBe(true)
    expect(parentEdge?.data.transitionType).toBe('next')
  })

  it('marks transition after failed node as on-error', async () => {
    const task = makeTask([
      makeNode({
        nodeId: 51,
        name: 'NodeFail',
        ts: '2026-04-07 10:00:30.100',
        status: 'failed',
      }),
      makeNode({
        nodeId: 52,
        name: 'NodeRecovery',
        ts: '2026-04-07 10:00:30.300',
        status: 'success',
      }),
    ])

    const { edges } = await buildFlowchartData(task)

    const edge = edges.find((item) => item.id === 'NodeFail->NodeRecovery')
    expect(edge?.data.executed).toBe(true)
    expect(edge?.data.transitionType).toBe('on-error')
  })

  it('marks JumpBack hit node as failed when action fails in any execution', async () => {
    const task = makeTask([
      {
        ...makeNode({
          nodeId: 61,
          name: 'ParentNode',
          ts: '2026-04-07 10:00:40.100',
          status: 'success',
          nextList: [{ name: 'JumpTarget', anchor: false, jump_back: true }],
        }),
        node_details: {
          action_id: 1001,
          completed: true,
          name: 'JumpTarget',
          node_id: 61,
          reco_id: 2001,
        },
        action_details: {
          action_id: 1001,
          action: 'Click',
          box: [0, 0, 1, 1],
          detail: {},
          name: 'JumpTarget',
          success: false,
        },
      },
      {
        ...makeNode({
          nodeId: 62,
          name: 'ParentNode',
          ts: '2026-04-07 10:00:40.300',
          status: 'success',
          nextList: [{ name: 'JumpTarget', anchor: false, jump_back: true }],
        }),
        node_details: {
          action_id: 1002,
          completed: true,
          name: 'JumpTarget',
          node_id: 62,
          reco_id: 2002,
        },
        action_details: {
          action_id: 1002,
          action: 'Click',
          box: [0, 0, 1, 1],
          detail: {},
          name: 'JumpTarget',
          success: true,
        },
      },
    ])

    const { nodes } = await buildFlowchartData(task)
    const jumpNode = nodes.find((node) => node.id === 'JumpTarget')
    expect(jumpNode?.data.status).toBe('failed')
    expect(jumpNode?.data.executionOrder).toEqual([1, 2])
  })
})
