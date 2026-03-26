import { computed, nextTick, ref, type Ref } from 'vue'
import type { NodeInfo, TaskInfo } from '../../../types'

interface UseFlowchartTimelineOptions {
  selectedTask: Ref<TaskInfo | null>
}

interface TimelineItem {
  index: number
  name: string
  status: NodeInfo['status']
  ts: string
  nodeInfo: NodeInfo
}

export const useFlowchartTimeline = (options: UseFlowchartTimelineOptions) => {
  const selectedTimelineIndex = ref<number | null>(null)
  const showNavDrawer = ref(false)

  // Execution timeline: one entry per execution in order.
  const executionTimeline = computed<TimelineItem[]>(() => {
    const task = options.selectedTask.value
    if (!task) return []
    return task.nodes.map((node, index) => ({
      index,
      name: node.name,
      status: node.status,
      ts: node.ts,
      nodeInfo: node,
    }))
  })

  const getTimelineDotClass = (status: NodeInfo['status']) => {
    if (status === 'success') return 'dot-success'
    if (status === 'running') return 'dot-running'
    return 'dot-failed'
  }

  // The canvas node ID that corresponds to the selected timeline item.
  const selectedFlowNodeId = computed(() => {
    if (selectedTimelineIndex.value == null) return null
    const item = executionTimeline.value[selectedTimelineIndex.value]
    return item?.name ?? null
  })

  const scrollNavToIndex = (index: number) => {
    nextTick(() => {
      const element = document.querySelector(`[data-nav-index="${index}"]`)
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  return {
    selectedTimelineIndex,
    showNavDrawer,
    executionTimeline,
    getTimelineDotClass,
    selectedFlowNodeId,
    scrollNavToIndex,
  }
}
