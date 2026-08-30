import { nextTick, ref, watch, type Ref } from 'vue'
import { buildFlowchartData } from '../../../utils/flowchartBuilder'
import type { TaskInfo } from '../../../types'
import { isSameTask } from '@windsland52/maa-log-tools/task-identity'

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
  let renderedTask: TaskInfo | null = null

  const rebuildFlowchartLayout = async (
    task: TaskInfo,
    rebuildOptions?: { resetFocus?: boolean; fit?: boolean; preserveLayout?: boolean },
  ) => {
    const runId = ++layoutRunId.value
    const { nodes, edges } = await buildFlowchartData(task, {
      ignoreUnexecutedNodes: options.ignoreUnexecutedNodes.value,
      previousNodes: rebuildOptions?.preserveLayout ? options.flowNodes.value : undefined,
      previousEdges: rebuildOptions?.preserveLayout ? options.flowEdges.value : undefined,
    })
    if (runId !== layoutRunId.value) return

    options.flowNodes.value = nodes
    options.flowEdges.value = options.decorateInitialEdges(edges as any[])
    renderedTask = task

    const renderedNodeIds = new Set(nodes.map((node) => node.id))
    if (options.focusedNodeId.value && !renderedNodeIds.has(options.focusedNodeId.value)) {
      options.focusedNodeId.value = null
    }
    if (options.popoverNodeId.value && !renderedNodeIds.has(options.popoverNodeId.value)) {
      options.closePopover()
    }

    if (rebuildOptions?.resetFocus) {
      options.focusedNodeId.value = null
    }

    options.applyFocusStyles()

    if (rebuildOptions?.fit) {
      nextTick(() => {
        setTimeout(() => {
          if (renderedTask && isSameTask(renderedTask, task)) {
            options.fitView({ padding: 0.2 })
          }
        }, 50)
      })
    }

    if (options.popoverNodeId.value) {
      nextTick(() => {
        if (runId !== layoutRunId.value) return
        options.updatePopoverPosition()
        requestAnimationFrame(() => {
          if (runId === layoutRunId.value) options.updatePopoverPosition()
        })
      })
    }
  }

  watch(
    options.selectedTask,
    async (task, previousTask) => {
      if (!task) {
        layoutRunId.value += 1
        renderedTask = null
        options.stopPlayback()
        options.closePopover()
        options.focusedNodeId.value = null
        options.selectedTimelineIndex.value = null
        options.flowNodes.value = []
        options.flowEdges.value = []
        return
      }

      const sameSelectedTask = previousTask != null && isSameTask(task, previousTask)
      if (!sameSelectedTask) {
        options.stopPlayback()
        options.closePopover()
        options.selectedTimelineIndex.value = null
        options.focusedNodeId.value = null
      }

      const preserveLayout = renderedTask != null && isSameTask(task, renderedTask)
      await rebuildFlowchartLayout(task, {
        resetFocus: !sameSelectedTask,
        fit: !preserveLayout,
        preserveLayout,
      })
    },
    { immediate: true },
  )

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
