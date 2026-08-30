import { ref, type Ref } from 'vue'

interface TimelineItem {
  name: string
  focusNodeId?: string
}

interface UseFlowchartPlaybackOptions {
  executionTimeline: Ref<TimelineItem[]>
  selectedTimelineIndex: Ref<number | null>
  focusedNodeId: Ref<string | null>
  showNavDrawer: Ref<boolean>
  isMobile: Ref<boolean>
  focusZoom: Ref<number>
  playbackIntervalMs: Ref<number>
  getNodeById: (nodeId: string) => any
  centerOnNode: (x: number, y: number, options: { zoom: number; duration: number }) => void
  popoverNodeId: Ref<string | null>
  updatePopoverPosition: () => void
  closePopover: () => void
  scrollNavToIndex: (index: number) => void
}

const DEFAULT_NODE_WIDTH = 120
const DEFAULT_NODE_HEIGHT = 44

const parseSizeValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

const resolveNodeCenter = (node: any): { x: number; y: number } => {
  const width =
    parseSizeValue(node?.dimensions?.width) ??
    parseSizeValue(node?.width) ??
    parseSizeValue(node?.style?.width) ??
    parseSizeValue(node?.data?.nodeWidth) ??
    DEFAULT_NODE_WIDTH

  const height =
    parseSizeValue(node?.dimensions?.height) ??
    parseSizeValue(node?.height) ??
    parseSizeValue(node?.style?.height) ??
    parseSizeValue(node?.data?.nodeHeight) ??
    DEFAULT_NODE_HEIGHT

  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  }
}

export const useFlowchartPlayback = (options: UseFlowchartPlaybackOptions) => {
  const isPlaying = ref(false)
  const playbackTimer = ref<number | null>(null)

  const clearPlaybackTimer = () => {
    if (playbackTimer.value == null) return
    window.clearInterval(playbackTimer.value)
    playbackTimer.value = null
  }

  const stopPlayback = () => {
    isPlaying.value = false
    clearPlaybackTimer()
  }

  const focusTimelineItem = (
    index: number,
    focusOptions?: {
      openPopover?: boolean
      center?: boolean
      closeDrawer?: boolean
      focusNodeId?: string
    },
  ) => {
    const item = options.executionTimeline.value[index]
    if (!item) return
    const requestedFocusNodeId = focusOptions?.focusNodeId ?? item.focusNodeId ?? item.name
    const requestedFlowNode = options.getNodeById(requestedFocusNodeId)
    const focusNodeId = requestedFlowNode ? requestedFocusNodeId : item.name
    const flowNode = requestedFlowNode ?? options.getNodeById(item.name)

    options.selectedTimelineIndex.value = index
    options.focusedNodeId.value = focusNodeId

    if (focusOptions?.center !== false) {
      if (flowNode) {
        const center = resolveNodeCenter(flowNode)
        options.centerOnNode(center.x, center.y, {
          zoom: options.focusZoom.value,
          duration: 300,
        })
      }
    }

    if (focusOptions?.openPopover) {
      options.popoverNodeId.value = focusNodeId
      setTimeout(() => {
        options.updatePopoverPosition()
        requestAnimationFrame(options.updatePopoverPosition)
      }, 320)
    } else {
      options.closePopover()
    }

    if (focusOptions?.closeDrawer !== false && options.isMobile.value) {
      options.showNavDrawer.value = false
    }

    options.scrollNavToIndex(index)
  }

  const startPlayback = () => {
    const timelineLength = options.executionTimeline.value.length
    if (timelineLength === 0) return

    const selectedIndex = options.selectedTimelineIndex.value
    const startIndex =
      selectedIndex == null || selectedIndex < 0 || selectedIndex >= timelineLength - 1
        ? 0
        : selectedIndex
    focusTimelineItem(startIndex, { openPopover: false, center: true })

    isPlaying.value = true
    clearPlaybackTimer()

    playbackTimer.value = window.setInterval(() => {
      const current = options.selectedTimelineIndex.value ?? -1
      const next = current + 1
      if (next >= options.executionTimeline.value.length) {
        stopPlayback()
        return
      }
      focusTimelineItem(next, { openPopover: false, center: true })
    }, options.playbackIntervalMs.value)
  }

  const togglePlayback = () => {
    if (isPlaying.value) {
      stopPlayback()
      return
    }
    startPlayback()
  }

  // Select a timeline item: center canvas + open popover.
  const selectTimelineItem = (index: number, focusNodeId?: string) => {
    stopPlayback()
    focusTimelineItem(index, { openPopover: true, center: true, focusNodeId })
  }

  return {
    isPlaying,
    stopPlayback,
    startPlayback,
    togglePlayback,
    selectTimelineItem,
  }
}
