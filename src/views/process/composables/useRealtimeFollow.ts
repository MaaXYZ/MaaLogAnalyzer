import { computed, onUnmounted, ref } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import { createRealtimeFollowScrolling } from './realtimeFollow/scrolling'
import { createFollowScheduler } from './realtimeFollow/scheduler'
import { setupRealtimeFollowWatchers } from './realtimeFollow/watchers'
import type { ScrollablePanelRef, UseRealtimeFollowOptions } from './realtimeFollow/types'
import { buildTaskIdentity } from '../../../utils/taskIdentity'

export const useRealtimeFollow = (options: UseRealtimeFollowOptions) => {
  const activeTaskIndex = ref(0)
  const followLast = ref(true)

  const taskListPanelRef = ref<ScrollablePanelRef | null>(null)
  const nodeNavPanelRef = ref<ScrollablePanelRef | null>(null)
  const virtualScroller = ref<InstanceType<typeof DynamicScroller> | null>(null)

  // 当前任务的节点列表（添加唯一 key 供虚拟滚动使用）
  const currentNodes = computed(() => {
    const selectedTask = options.selectedTask.value
    if (!selectedTask) return []
    const taskIdentity = buildTaskIdentity(selectedTask)
    return (selectedTask.nodes || []).map((node, index) => ({
      ...node,
      _uniqueKey: `${taskIdentity}-${node.node_id}-${node.ts}-${index}`,
    }))
  })
  const currentNodeCount = computed(() => currentNodes.value.length)
  const { safeScrollToItem, scrollToNode, scrollToLatestNodeBottom } = createRealtimeFollowScrolling({
    virtualScroller,
    currentNodeCount,
    isRealtimeStreaming: options.isRealtimeStreaming,
    followLast,
  })
  const { scheduleFollowToLatest, clearFollowSchedule } = createFollowScheduler({
    tasks: options.tasks,
    selectedTask: options.selectedTask,
    isRealtimeStreaming: options.isRealtimeStreaming,
    followLast,
    activeTaskIndex,
    onSelectTask: options.onSelectTask,
    taskListPanelRef,
    nodeNavPanelRef,
    scrollToLatestNodeBottom,
  })

  const handleTabChange = (index: number) => {
    if (options.isRealtimeStreaming.value) {
      followLast.value = false
    }
    activeTaskIndex.value = index
    const task = options.tasks.value[index]
    if (task) {
      options.onSelectTask(task)
    }
  }
  onUnmounted(clearFollowSchedule)

  const toggleFollowLast = () => {
    followLast.value = !followLast.value
    if (followLast.value) {
      scheduleFollowToLatest()
    }
  }

  const stopFollowOnScrollUp = () => {
    if (!options.isRealtimeStreaming.value) return
    if (!followLast.value) return
    followLast.value = false
  }

  const handleFollowWheel = (event: WheelEvent) => {
    if (event.deltaY < 0) {
      stopFollowOnScrollUp()
    }
  }
  setupRealtimeFollowWatchers({
    tasks: options.tasks,
    selectedTask: options.selectedTask,
    pendingScrollNodeId: options.pendingScrollNodeId,
    isRealtimeStreaming: options.isRealtimeStreaming,
    followLast,
    activeTaskIndex,
    currentNodes,
    safeScrollToItem,
    scrollToNode,
    onScrollDone: options.onScrollDone,
    scheduleFollowToLatest,
  })

  return {
    activeTaskIndex,
    followLast,
    taskListPanelRef,
    nodeNavPanelRef,
    virtualScroller,
    currentNodes,
    handleTabChange,
    toggleFollowLast,
    stopFollowOnScrollUp,
    handleFollowWheel,
    scrollToNode,
  }
}
