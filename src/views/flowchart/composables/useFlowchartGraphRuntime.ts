import { nextTick, ref, watch, type Ref } from 'vue'
import { buildFlowchartData } from '../../../utils/flowchartBuilder'
import type { TaskInfo } from '../../../types'

interface UseFlowchartGraphRuntimeOptions {
  selectedTask: Ref<TaskInfo | null>
  flowNodes: Ref<any[]>
  flowEdges: Ref<any[]>
  focusedNodeId: Ref<string | null>
  popoverNodeId: Ref<string | null>
  selectedTimelineIndex: Ref<number | null>
  isPlaying: Ref<boolean>
  playbackIntervalMs: Ref<number>
  focusZoom: Ref<number>
  edgeStyle: Ref<string>
  edgeFlowEnabled: Ref<boolean>
  ignoreUnexecutedNodes: Ref<boolean>
  relayoutAfterDrag: Ref<boolean>
  stopPlayback: () => void
  startPlayback: () => void
  closePopover: () => void
  fitView: (options: { padding: number }) => void
  updatePopoverPosition: () => void
  decorateInitialEdges: (edges: any[]) => any[]
  applyFocusStyles: () => void
  applyEdgeRenderTypes: () => void
  recomputeEdgeRoutesForCurrentNodes: () => void
  persistSettings: () => void
}

export const useFlowchartGraphRuntime = (options: UseFlowchartGraphRuntimeOptions) => {
  const layoutRunId = ref(0)

  const rebuildFlowchartLayout = async (task: TaskInfo, rebuildOptions?: { resetFocus?: boolean; fit?: boolean }) => {
    const runId = ++layoutRunId.value
    const { nodes, edges } = await buildFlowchartData(task, {
      ignoreUnexecutedNodes: options.ignoreUnexecutedNodes.value,
    })
    if (runId !== layoutRunId.value) return

    options.flowNodes.value = nodes
    options.flowEdges.value = options.decorateInitialEdges(edges as any[])

    if (rebuildOptions?.resetFocus) {
      options.focusedNodeId.value = null
    }

    options.applyFocusStyles()

    if (rebuildOptions?.fit) {
      nextTick(() => {
        setTimeout(() => options.fitView({ padding: 0.2 }), 50)
      })
    }

    if (options.popoverNodeId.value) {
      nextTick(() => {
        options.updatePopoverPosition()
        requestAnimationFrame(options.updatePopoverPosition)
      })
    }
  }

  watch(options.selectedTask, async (task) => {
    options.stopPlayback()
    options.closePopover()
    options.selectedTimelineIndex.value = null

    if (!task) {
      options.flowNodes.value = []
      options.flowEdges.value = []
      return
    }

    await rebuildFlowchartLayout(task, { resetFocus: true, fit: true })
  }, { immediate: true })

  const onNodeDragStop = () => {
    if (!options.relayoutAfterDrag.value) return

    options.stopPlayback()
    options.recomputeEdgeRoutesForCurrentNodes()
  }

  watch(options.focusedNodeId, () => {
    options.applyFocusStyles()
  })

  watch(options.isPlaying, () => {
    options.applyFocusStyles()
  })

  watch(options.playbackIntervalMs, () => {
    options.persistSettings()
    if (options.isPlaying.value) {
      options.startPlayback()
    }
  })

  watch(options.focusZoom, () => {
    options.persistSettings()
  })

  watch(options.edgeStyle, () => {
    options.applyEdgeRenderTypes()
    options.applyFocusStyles()
  })

  watch(options.edgeFlowEnabled, () => {
    options.applyEdgeRenderTypes()
    options.applyFocusStyles()
  })

  watch(options.ignoreUnexecutedNodes, async () => {
    const task = options.selectedTask.value
    if (!task) return

    options.stopPlayback()
    options.closePopover()
    options.selectedTimelineIndex.value = null
    await rebuildFlowchartLayout(task, { resetFocus: true, fit: false })
  })

  return {
    onNodeDragStop,
  }
}
