import { describe, expect, it } from 'vitest'
import type { NodeInfo } from '../../../../types'
import type { NodeNavViewItem } from '../useNodeNavSearch'
import { resolveNodeByOriginalIndex } from '../nodeNavSelection'

const createNode = (params: { nodeId: number; name: string }): NodeInfo => ({
  node_id: params.nodeId,
  name: params.name,
  ts: '2026-04-07 22:00:00.000',
  status: 'success',
  task_id: 1,
  next_list: [],
})

const createNavItem = (node: NodeInfo, originalIndex: number): NodeNavViewItem => ({
  navKey: `test:${originalIndex}`,
  node,
  originalIndex,
  primaryText: node.name,
  navStatus: node.status,
  matchDetails: [],
  matchKinds: [],
  matchHint: '',
  matchPreview: '',
})

describe('resolveNodeByOriginalIndex', () => {
  it('resolves node correctly when nav items are filtered/reordered', () => {
    const nodeB = createNode({ nodeId: 102, name: 'B' })
    const nodeC = createNode({ nodeId: 103, name: 'C' })

    const filteredItems: NodeNavViewItem[] = [createNavItem(nodeB, 1), createNavItem(nodeC, 2)]

    expect(resolveNodeByOriginalIndex(filteredItems, 1)).toBe(nodeB)
    expect(resolveNodeByOriginalIndex(filteredItems, 2)).toBe(nodeC)
    expect(resolveNodeByOriginalIndex(filteredItems, 0)).toBeNull()
  })

  it('returns null when index does not exist', () => {
    const items: NodeNavViewItem[] = [createNavItem(createNode({ nodeId: 201, name: 'X' }), 4)]

    expect(resolveNodeByOriginalIndex(items, 2)).toBeNull()
  })
})
