import type { NodeInfo } from '../../types'
import { setTaskNextList, type TaskScopedNodeAggregation } from './taskScopedAggregationHelpers'
import type { KnownMaaPhase } from './eventMeta'

export const applyTaskNextList = (params: {
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>
  taskId: number
  list: unknown[]
  toListItems: (list: unknown[]) => NodeInfo['next_list']
  rootTaskId: number
  getActivePipelineNode: () => NodeInfo | null
}): void => {
  const nextList = setTaskNextList(
    params.taskScopedNodeAggregationByTaskId,
    params.taskId,
    params.toListItems(params.list)
  )
  if (params.taskId === params.rootTaskId) {
    const activeNode = params.getActivePipelineNode()
    if (activeNode) {
      activeNode.next_list = nextList
    }
  }
}

export const handleNextListNodeEvent = (params: {
  taskId: number | null
  phase: KnownMaaPhase
  details: Record<string, any>
  timestamp: string
  applyTaskNextList: (taskId: number, list: unknown[]) => void
  refreshActivePipelineNodePreview: (timestamp: string) => void
}): boolean => {
  if (params.taskId != null) {
    if (params.phase === 'Failed') {
      params.applyTaskNextList(params.taskId, [])
    } else {
      params.applyTaskNextList(
        params.taskId,
        Array.isArray(params.details.list) ? params.details.list : []
      )
    }
  }
  params.refreshActivePipelineNodePreview(params.timestamp)
  return true
}
