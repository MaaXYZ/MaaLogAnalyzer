import { computed, type Ref } from 'vue'
import { useNodeNavSearch } from '../useNodeNavSearch'
import { useRealtimeFollow } from '../useRealtimeFollow'
import type { ProcessViewControllerEmitters, ProcessViewControllerProps } from './types'

interface UseProcessFollowNavOptions {
  props: ProcessViewControllerProps
  emitters: ProcessViewControllerEmitters
  isRealtimeStreaming: Ref<boolean>
}

export const useProcessFollowNav = (
  options: UseProcessFollowNavOptions,
) => {
  const {
    activeTaskIndex,
    followLast,
    taskListPanelRef,
    nodeNavPanelRef,
    virtualScroller,
    currentNodes,
    handleTabChange,
    toggleFollowLast,
    stopFollowOnScrollUp,
    scrollToNode,
  } = useRealtimeFollow({
    tasks: computed(() => options.props.tasks),
    selectedTask: computed(() => options.props.selectedTask),
    pendingScrollNodeId: computed(() => options.props.pendingScrollNodeId),
    isRealtimeStreaming: options.isRealtimeStreaming,
    onSelectTask: options.emitters.onSelectTask,
    onScrollDone: options.emitters.onScrollDone,
  })

  const {
    nodeNavSearchText,
    normalizedNodeNavSearchText,
    nodeNavFailedOnly,
    toggleNodeNavFailedOnly,
    nodeNavItems,
    nodeNavEmptyDescription,
  } = useNodeNavSearch(currentNodes)

  const setTaskListPanelRef = (instance: unknown | null) => {
    taskListPanelRef.value = instance as { scrollToBottom: () => void } | null
  }

  const setNodeNavPanelRef = (instance: unknown | null) => {
    nodeNavPanelRef.value = instance as { scrollToBottom: () => void } | null
  }

  return {
    activeTaskIndex,
    followLast,
    virtualScroller,
    currentNodes,
    handleTabChange,
    toggleFollowLast,
    stopFollowOnScrollUp,
    scrollToNode,
    nodeNavSearchText,
    normalizedNodeNavSearchText,
    nodeNavFailedOnly,
    toggleNodeNavFailedOnly,
    nodeNavItems,
    nodeNavEmptyDescription,
    setTaskListPanelRef,
    setNodeNavPanelRef,
  }
}
