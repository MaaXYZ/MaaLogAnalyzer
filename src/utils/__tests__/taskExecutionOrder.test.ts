import { describe, expect, it } from 'vitest'
import type { NodeInfo } from '../../types'
import { sortNodesByGlobalExecutionOrder } from '../taskExecutionOrder'

const makeNode = (params: {
  nodeId: number
  name: string
  ts: string
}): NodeInfo => ({
  node_id: params.nodeId,
  name: params.name,
  ts: params.ts,
  status: 'success',
  task_id: 1,
  next_list: [],
})

describe('sortNodesByGlobalExecutionOrder', () => {
  it('sorts by global start timestamp instead of local array order', () => {
    const nodes: NodeInfo[] = [
      makeNode({ nodeId: 1003, name: 'C', ts: '2026-04-07 10:00:00.300' }),
      makeNode({ nodeId: 1001, name: 'A', ts: '2026-04-07 10:00:00.100' }),
      makeNode({ nodeId: 1002, name: 'B', ts: '2026-04-07 10:00:00.200' }),
    ]

    const ordered = sortNodesByGlobalExecutionOrder(nodes)
    expect(ordered.map(node => node.name)).toEqual(['A', 'B', 'C'])
    expect(ordered.map(node => node.node_id)).toEqual([1001, 1002, 1003])
  })

  it('keeps original relative order when timestamp is invalid', () => {
    const nodes: NodeInfo[] = [
      makeNode({ nodeId: 2001, name: 'X', ts: 'invalid-ts' }),
      makeNode({ nodeId: 2002, name: 'Y', ts: '2026-04-07 10:00:00.200' }),
      makeNode({ nodeId: 2003, name: 'Z', ts: 'invalid-ts-2' }),
    ]

    const ordered = sortNodesByGlobalExecutionOrder(nodes)
    expect(ordered.map(node => node.name)).toEqual(['Y', 'X', 'Z'])
  })
})
