import { computed, nextTick, watch, type Ref } from 'vue'
import type { TaskInfo } from '../../../../types'
import { buildFollowTasksFingerprint } from './fingerprint'
import type { RealtimeNodeItem } from './types'
import { findTaskIndex } from '../../../../utils/taskIdentity'

interface SetupRealtimeFollowWatchersOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  pendingScrollNodeId: Ref<number | null | undefined>
  isRealtimeStreaming: Ref<boolean>
  followLast: Ref<boolean>
  activeTaskIndex: Ref<number>
  currentNodes: Ref<RealtimeNodeItem[]>
  safeScrollToItem: (index: number) => Promise<boolean>
  scrollToNode: (index: number) => Promise<void>
  onScrollDone: () => void
  scheduleFollowToLatest: () => void
}

export const setupRealtimeFollowWatchers = (options: SetupRealtimeFollowWatchersOptions) => {
  watch(() => options.selectedTask.value, async (newTask, oldTask) => {
    const switchedTask = newTask !== oldTask

    if (newTask && switchedTask) {
      const index = findTaskIndex(options.tasks.value, newTask)
      if (index !== -1 && index !== options.activeTaskIndex.value) {
        options.activeTaskIndex.value = index
      }
    }

    // 只有真正切换任务时才重置到顶部；实时更新同一任务不打断当前位置
    if (switchedTask) {
      await options.safeScrollToItem(0)
    }
  }, { immediate: true, flush: 'post' })

  const followTasksFingerprint = computed(() => buildFollowTasksFingerprint(options.tasks.value))
  watch([followTasksFingerprint, options.isRealtimeStreaming, options.followLast], ([, streaming, following]) => {
    if (!streaming || !following) return
    options.scheduleFollowToLatest()
  }, { immediate: true, flush: 'post' })

  watch(options.isRealtimeStreaming, (streaming) => {
    if (!streaming) return
    if (!options.followLast.value) return
    options.scheduleFollowToLatest()
  }, { flush: 'post' })

  watch(() => options.pendingScrollNodeId.value, (nodeId) => {
    if (nodeId == null) return
    const index = options.currentNodes.value.findIndex((node) => node.node_id === nodeId)
    if (index < 0) return
    nextTick(() => {
      void options.scrollToNode(index)
      options.onScrollDone()
    })
  })
}
