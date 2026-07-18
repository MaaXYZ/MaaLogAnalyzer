import { nextTick, ref, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { NodeInfo, TaskInfo } from '../../../types'
import { useAppSelectionAndFilters } from './useAppSelectionAndFilters'

describe('mobile detail drawer selection', () => {
  it('stays closed across realtime node replacement and reopens on explicit selection', async () => {
    const selectedNode = shallowRef<NodeInfo | null>(null)
    const afterSelect = vi.fn()
    const state = useAppSelectionAndFilters({
      isMobile: ref(true),
      tasks: shallowRef<TaskInfo[]>([]),
      selectedTask: shallowRef<TaskInfo | null>(null),
      selectedNode,
      selectedFlowItemId: ref<string | null>(null),
      pendingScrollNodeId: ref<number | null>(null),
      buildNodeFlowItems: () => [],
      buildNodeRecognitionFlowItems: () => [],
      afterSelect,
    })
    const initialNode = { node_id: 7 } as NodeInfo

    state.handleSelectNode(initialNode)
    await nextTick()
    expect(state.showDetailDrawer.value).toBe(true)
    expect(afterSelect).toHaveBeenCalledOnce()

    state.showDetailDrawer.value = false
    const refreshedNode = { node_id: 7 } as NodeInfo
    selectedNode.value = refreshedNode
    await nextTick()
    expect(state.showDetailDrawer.value).toBe(false)

    state.handleSelectNode(refreshedNode)
    expect(state.showDetailDrawer.value).toBe(true)
    expect(afterSelect).toHaveBeenCalledTimes(2)
  })
})
