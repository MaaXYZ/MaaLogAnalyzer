import type { NextListItem } from '../types'
import type { WaitFreezesRuntimeState } from './logParserWaitFreezesHelpers'

export type TaskScopedNodeAggregation = {
  nextList: NextListItem[]
  waitFreezesRuntimeStates: Map<number, WaitFreezesRuntimeState>
}

export const getOrCreateTaskNodeAggregation = (
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>,
  taskId: number
): TaskScopedNodeAggregation => {
  const existing = taskScopedNodeAggregationByTaskId.get(taskId)
  if (existing) return existing
  const created: TaskScopedNodeAggregation = {
    nextList: [],
    waitFreezesRuntimeStates: new Map<number, WaitFreezesRuntimeState>(),
  }
  taskScopedNodeAggregationByTaskId.set(taskId, created)
  return created
}

export const getTaskNextList = (
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>,
  taskId: number
): NextListItem[] => {
  return taskScopedNodeAggregationByTaskId.get(taskId)?.nextList ?? []
}

export const resetTaskNodeAggregation = (
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>,
  taskId: number
): void => {
  const aggregation = getOrCreateTaskNodeAggregation(taskScopedNodeAggregationByTaskId, taskId)
  aggregation.nextList = []
  aggregation.waitFreezesRuntimeStates.clear()
}

export const clearTaskNodeAggregation = (
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>,
  taskId: number
): void => {
  taskScopedNodeAggregationByTaskId.delete(taskId)
}

export const setTaskNextList = (
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>,
  taskId: number,
  nextList: NextListItem[]
): NextListItem[] => {
  const aggregation = getOrCreateTaskNodeAggregation(taskScopedNodeAggregationByTaskId, taskId)
  aggregation.nextList = nextList
  return aggregation.nextList
}
