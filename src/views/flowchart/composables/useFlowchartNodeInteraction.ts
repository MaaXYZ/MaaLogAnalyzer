import { nextTick, type Ref } from 'vue'
import type { FlowNodeData } from '../../../utils/flowchartBuilder'

interface TimelineItem {
  name: string
}

interface UseFlowchartNodeInteractionOptions {
  executionTimeline: Ref<TimelineItem[]>
  popoverNodeId: Ref<string | null>
  focusedNodeId: Ref<string | null>
  selectedTimelineIndex: Ref<number | null>
  stopPlayback: () => void
  closePopover: () => void
  updatePopoverPosition: () => void
  scrollNavToIndex: (index: number) => void
}

export const useFlowchartNodeInteraction = (options: UseFlowchartNodeInteractionOptions) => {
  const resolveTimelineIndexForNodeClick = (
    nodeId: string,
    data: FlowNodeData
  ): number => {
    const timelineLength = options.executionTimeline.value.length
    if (timelineLength === 0) return -1

    // Prefer the latest global execution order for aggregated nodes with repeated executions.
    if (Array.isArray(data.executionOrder) && data.executionOrder.length > 0) {
      for (let i = data.executionOrder.length - 1; i >= 0; i--) {
        const order = data.executionOrder[i]
        if (!Number.isFinite(order)) continue
        const idx = Math.trunc(order) - 1
        if (idx < 0 || idx >= timelineLength) continue
        const item = options.executionTimeline.value[idx]
        if (item?.name === nodeId) return idx
      }
    }

    // Fallback to the latest occurrence by name.
    for (let i = timelineLength - 1; i >= 0; i--) {
      if (options.executionTimeline.value[i]?.name === nodeId) return i
    }
    return -1
  }

  const onNodeClick = (event: { node: { id: string; data: FlowNodeData } }) => {
    const data = event.node.data
    if (data.nodeInfos.length === 0) return

    // Toggle popover: click same node again closes it.
    options.stopPlayback()

    if (options.popoverNodeId.value === event.node.id) {
      options.focusedNodeId.value = null
      options.closePopover()
      return
    }

    options.focusedNodeId.value = event.node.id
    options.popoverNodeId.value = event.node.id
    nextTick(() => {
      options.updatePopoverPosition()
      // Calibrate once more after popover content is painted.
      requestAnimationFrame(options.updatePopoverPosition)
    })

    // Bidirectional sync with timeline.
    const timelineIndex = resolveTimelineIndexForNodeClick(event.node.id, data)
    if (timelineIndex >= 0) {
      options.selectedTimelineIndex.value = timelineIndex
      options.scrollNavToIndex(timelineIndex)
    }
  }

  const onPaneClick = () => {
    options.stopPlayback()
    options.focusedNodeId.value = null
    options.closePopover()
  }

  return {
    onNodeClick,
    onPaneClick,
  }
}
