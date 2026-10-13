import { describe, expect, it } from 'vitest'
import { resolveActiveNavRowKey, type NavRowIdentity } from '../resolveActiveNavRowKey'

// 复刻 Focus 模式下同一个节点的三行：节点行 + 识别项 + 动作项
const focusRows: NavRowIdentity[] = [
  { navKey: 'row-node', node: { node_id: 7 } },
  { navKey: 'row-reco', node: { node_id: 7 }, targetFlowItemId: 'reco.1' },
  { navKey: 'row-action', node: { node_id: 7 }, targetFlowItemId: 'action.2' },
  { navKey: 'row-next-node', node: { node_id: 8 } },
]

describe('resolveActiveNavRowKey', () => {
  it('follows the flow identity when the selection comes from a recognition/action row', () => {
    expect(resolveActiveNavRowKey(focusRows, 7, 'action.2', null)).toBe('row-action')
    expect(resolveActiveNavRowKey(focusRows, 7, 'reco.1', null)).toBe('row-reco')
  })

  it('falls back to the node row when only the node is selected', () => {
    expect(resolveActiveNavRowKey(focusRows, 7, null, null)).toBe('row-node')
  })

  it('prefers the remembered row when the flow identity is unknown or foreign', () => {
    expect(resolveActiveNavRowKey(focusRows, 7, null, 'row-action')).toBe('row-action')
    expect(resolveActiveNavRowKey(focusRows, 7, 'reco.999', 'row-action')).toBe('row-action')
  })

  it('uses the first row of the node as the last resort', () => {
    // 该节点没有“无 flow 身份”的行（例如识别模式下每行都是某个识别项）
    const recoOnly: NavRowIdentity[] = [
      { navKey: 'r1', node: { node_id: 9 }, targetFlowItemId: 'a' },
      { navKey: 'r2', node: { node_id: 9 }, targetFlowItemId: 'b' },
    ]
    expect(resolveActiveNavRowKey(recoOnly, 9, null, null)).toBe('r1')
  })

  it('returns null when there is no selection or no row for that node', () => {
    expect(resolveActiveNavRowKey(focusRows, null, null, null)).toBeNull()
    expect(resolveActiveNavRowKey(focusRows, 999, 'x', null)).toBeNull()
  })
})
