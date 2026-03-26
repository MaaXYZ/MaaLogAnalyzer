import { nextTick, type Ref } from 'vue'
import type { TaskInfo } from '../../../../types'
import type { ScrollablePanelRef } from './types'

interface CreateFollowSchedulerOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  isRealtimeStreaming: Ref<boolean>
  followLast: Ref<boolean>
  activeTaskIndex: Ref<number>
  onSelectTask: (task: TaskInfo) => void
  taskListPanelRef: Ref<ScrollablePanelRef | null>
  nodeNavPanelRef: Ref<ScrollablePanelRef | null>
  scrollToLatestNodeBottom: () => Promise<void>
}

export const createFollowScheduler = (options: CreateFollowSchedulerOptions) => {
  const followToLatest = async () => {
    if (!options.isRealtimeStreaming.value || !options.followLast.value) return
    if (options.tasks.value.length === 0) return

    const latestIndex = options.tasks.value.length - 1
    const latestTask = options.tasks.value[latestIndex]
    if (!latestTask) return

    const needSwitchTask = options.selectedTask.value?.task_id !== latestTask.task_id
    if (needSwitchTask) {
      options.activeTaskIndex.value = latestIndex
      options.onSelectTask(latestTask)
      await nextTick()
      options.taskListPanelRef.value?.scrollToBottom()
      options.nodeNavPanelRef.value?.scrollToBottom()
    }

    void options.scrollToLatestNodeBottom()
  }

  let followToLatestRafId: number | null = null
  const scheduleFollowToLatest = () => {
    if (!options.isRealtimeStreaming.value || !options.followLast.value) return
    if (followToLatestRafId != null) return
    if (typeof window === 'undefined') {
      void followToLatest()
      return
    }
    followToLatestRafId = window.requestAnimationFrame(() => {
      followToLatestRafId = null
      void followToLatest()
    })
  }

  const clearFollowSchedule = () => {
    if (followToLatestRafId == null) return
    window.cancelAnimationFrame(followToLatestRafId)
    followToLatestRafId = null
  }

  return {
    followToLatest,
    scheduleFollowToLatest,
    clearFollowSchedule,
  }
}
