import type { Ref } from 'vue'
import type { TaskInfo } from '../../../../types'

export interface ScrollablePanelRef {
  scrollToBottom: () => void
}

export interface RealtimeNodeItem {
  node_id: number
}

export interface UseRealtimeFollowOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  pendingScrollNodeId: Ref<number | null | undefined>
  isRealtimeStreaming: Ref<boolean>
  onSelectTask: (task: TaskInfo) => void
  onScrollDone: () => void
}
