import { ref, type Ref } from 'vue'

interface TimelineItem {
  name: string
}

interface UseFlowchartPlaybackOptions {
  executionTimeline: Ref<TimelineItem[]>
  selectedTimelineIndex: Ref<number | null>
  focusedNodeId: Ref<string | null>
  showNavDrawer: Ref<boolean>
  isMobile: Ref<boolean>
  focusZoom: Ref<number>
  playbackIntervalMs: Ref<number>
  getNodeById: (nodeId: string) => { position: { x: number; y: number } } | undefined
  centerOnNode: (x: number, y: number, options: { zoom: number; duration: number }) => void
  popoverNodeId: Ref<string | null>
  updatePopoverPosition: () => void
  closePopover: () => void
  scrollNavToIndex: (index: number) => void
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
    focusOptions?: { openPopover?: boolean; center?: boolean; closeDrawer?: boolean },
  ) => {
    const item = options.executionTimeline.value[index]
    if (!item) return

    options.selectedTimelineIndex.value = index
    options.focusedNodeId.value = item.name

    if (focusOptions?.center !== false) {
      const flowNode = options.getNodeById(item.name)
      if (flowNode) {
        options.centerOnNode(flowNode.position.x + 90, flowNode.position.y + 30, {
          zoom: options.focusZoom.value,
          duration: 300,
        })
      }
    }

    if (focusOptions?.openPopover) {
      options.popoverNodeId.value = item.name
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
    if (options.executionTimeline.value.length === 0) return

    const startIndex = options.selectedTimelineIndex.value == null ? 0 : options.selectedTimelineIndex.value
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
  const selectTimelineItem = (index: number) => {
    stopPlayback()
    focusTimelineItem(index, { openPopover: true, center: true })
  }

  return {
    isPlaying,
    stopPlayback,
    startPlayback,
    togglePlayback,
    selectTimelineItem,
  }
}
