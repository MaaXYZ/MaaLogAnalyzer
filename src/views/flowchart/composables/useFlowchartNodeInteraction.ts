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
    const timelineIndex = options.executionTimeline.value.findIndex(item => item.name === event.node.id)
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
