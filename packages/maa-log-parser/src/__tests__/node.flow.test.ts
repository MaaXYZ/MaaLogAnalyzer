import { describe, expect, it } from 'vitest'
import { buildNodeActionTimelineItems } from '../node/flow'
import type { NodeInfo } from '../shared/types'

const makeNode = (
  overrides: Partial<NodeInfo> = {},
): NodeInfo => ({
  node_id: 1,
  name: 'FocusNode',
  ts: '2026-04-15 00:00:00.000',
  status: 'success',
  task_id: 1,
  next_list: [],
  ...overrides,
})

describe('node flow timeline helpers', () => {
  it('does not attach node-scoped focus to synthesized fallback action items', () => {
    const items = buildNodeActionTimelineItems(makeNode({
      focus: {
        'Node.PipelineNode.Starting': 'Node focus only',
      },
      action_details: {
        action_id: 2,
        action: 'DoNothing',
        box: [0, 0, 0, 0],
        detail: {},
        name: 'FocusNode',
        success: true,
      },
    }))

    expect(items).toHaveLength(1)
    expect(items[0]).not.toHaveProperty('focus')
    expect(items[0]?.type).toBe('action')
  })
})
