import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { FlowNodeData } from '../../../../utils/flowchartBuilder'
import { useFlowchartNodeInteraction } from '../useFlowchartNodeInteraction'

let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame | undefined

beforeAll(() => {
  originalRequestAnimationFrame = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0)
    return 0
  }) as typeof globalThis.requestAnimationFrame
})

afterAll(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame as typeof globalThis.requestAnimationFrame
})

const makeNodeData = (params: {
  executionOrder: number[]
  nodeInfoCount?: number
}): FlowNodeData => ({
  label: 'NodeA',
  status: 'success',
  executionOrder: params.executionOrder,
  nodeInfos: Array.from({ length: params.nodeInfoCount ?? 1 }, () => ({
    node_id: 1,
    name: 'NodeA',
    ts: '2026-04-07 10:00:00.100',
    status: 'success' as const,
    task_id: 1,
    next_list: [],
  })),
})

describe('useFlowchartNodeInteraction', () => {
  it('maps node click to latest execution index for repeated node names', () => {
    const executionTimeline = ref([
      { name: 'NodeA' },
      { name: 'NodeB' },
      { name: 'NodeA' },
    ])
    const selectedTimelineIndex = ref<number | null>(null)
    const popoverNodeId = ref<string | null>(null)
    const focusedNodeId = ref<string | null>(null)
    const stopPlayback = vi.fn()
    const closePopover = vi.fn()
    const updatePopoverPosition = vi.fn()
    const scrollNavToIndex = vi.fn()

    const interaction = useFlowchartNodeInteraction({
      executionTimeline,
      popoverNodeId,
      focusedNodeId,
      selectedTimelineIndex,
      stopPlayback,
      closePopover,
      updatePopoverPosition,
      scrollNavToIndex,
    })

    interaction.onNodeClick({
      node: {
        id: 'NodeA',
        data: makeNodeData({ executionOrder: [1, 3] }),
      },
    })

    expect(selectedTimelineIndex.value).toBe(2)
    expect(scrollNavToIndex).toHaveBeenCalledWith(2)
  })

  it('falls back to latest name match when execution order is missing/invalid', () => {
    const executionTimeline = ref([
      { name: 'NodeA' },
      { name: 'NodeB' },
      { name: 'NodeA' },
    ])
    const selectedTimelineIndex = ref<number | null>(null)
    const popoverNodeId = ref<string | null>(null)
    const focusedNodeId = ref<string | null>(null)

    const interaction = useFlowchartNodeInteraction({
      executionTimeline,
      popoverNodeId,
      focusedNodeId,
      selectedTimelineIndex,
      stopPlayback: vi.fn(),
      closePopover: vi.fn(),
      updatePopoverPosition: vi.fn(),
      scrollNavToIndex: vi.fn(),
    })

    interaction.onNodeClick({
      node: {
        id: 'NodeA',
        data: makeNodeData({ executionOrder: [999, -1] }),
      },
    })

    expect(selectedTimelineIndex.value).toBe(2)
  })
})
