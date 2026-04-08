import { markRaw } from 'vue'
import type { TaskInfo, UnifiedFlowItem } from '../../types'

export function settleRunningFlowItems(
  items: UnifiedFlowItem[] | undefined,
  fallbackStatus: 'success' | 'failed'
): void {
  if (!items || items.length === 0) return
  for (const item of items) {
    if (item.status === 'running') {
      item.status = fallbackStatus
    }
    if (item.children && item.children.length > 0) {
      settleRunningFlowItems(item.children, fallbackStatus)
    }
  }
}

export function settleCompletedTaskNodes(task: TaskInfo): void {
  if (task.status === 'running') return
  const fallbackStatus: 'success' | 'failed' = task.status === 'succeeded' ? 'success' : 'failed'
  const fallbackTimestamp = task.end_time || task.start_time
  for (const node of task.nodes) {
    if (node.status === 'running') {
      node.status = fallbackStatus
      node.end_ts = node.end_ts || fallbackTimestamp
      if (node.action_details) {
        node.action_details = markRaw({
          ...node.action_details,
          success: fallbackStatus === 'success',
          end_ts: node.action_details.end_ts || node.end_ts,
        })
      }
    }
    settleRunningFlowItems(node.node_flow, fallbackStatus)
  }
}
