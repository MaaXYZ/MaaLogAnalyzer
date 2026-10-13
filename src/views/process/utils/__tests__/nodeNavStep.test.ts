import { describe, expect, it } from 'vitest'
import { resolveNodeNavStepIndex } from '../nodeNavStep'

const nodes = [{ node_id: 11 }, { node_id: 22 }, { node_id: 33 }]
const byId = (selectedNodeId: number | null) => (node: { node_id: number }) =>
  selectedNodeId != null && node.node_id === selectedNodeId
const step = (selectedNodeId: number | null, delta: number) =>
  resolveNodeNavStepIndex(nodes, byId(selectedNodeId), delta)

describe('resolveNodeNavStepIndex', () => {
  it('steps forward and backward from the current item', () => {
    expect(step(11, 1)).toBe(1)
    expect(step(22, 1)).toBe(2)
    expect(step(33, -1)).toBe(1)
  })

  it('stops at both ends instead of wrapping around', () => {
    expect(step(33, 1)).toBeNull()
    expect(step(11, -1)).toBeNull()
  })

  it('starts from the first item when nothing (or something foreign) is current', () => {
    expect(step(null, 1)).toBe(0)
    expect(step(null, -1)).toBe(0)
    expect(step(999, 1)).toBe(0)
  })

  it('returns null for an empty list', () => {
    expect(resolveNodeNavStepIndex([], () => false, 1)).toBeNull()
  })

  it('uses the exact current item when several rows share one node (Focus/识别 模式)', () => {
    // 同一个节点下三行（节点行 + 两个 flow 项），旧实现按 node_id 会一直命中第 0 行
    const rows = [
      { node_id: 7, flowItemId: null },
      { node_id: 7, flowItemId: 'reco.1' },
      { node_id: 7, flowItemId: 'action.2' },
      { node_id: 8, flowItemId: null },
    ]
    const isCurrent = (row: (typeof rows)[number]) =>
      row.node_id === 7 && row.flowItemId === 'action.2'

    expect(resolveNodeNavStepIndex(rows, isCurrent, 1)).toBe(3)
    expect(resolveNodeNavStepIndex(rows, isCurrent, -1)).toBe(1)
  })
})
