import type { NodeInfo } from '../../types'
import type { KnownMaaPhase } from './eventMeta'
import type { TaskScopedNodeAggregation } from './taskScopedAggregationHelpers'

export const handleWaitFreezesNodeEvent = (params: {
  taskId: number | null
  rootTaskId: number
  phase: KnownMaaPhase
  details: Record<string, any>
  timestamp: string
  eventOrder: number
  onUpdated?: (details: Record<string, any>) => void
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>
  getOrCreateTaskNodeAggregation: (
    map: Map<number, TaskScopedNodeAggregation>,
    taskId: number
  ) => TaskScopedNodeAggregation
  upsertWaitFreezesState: (params: {
    runtimeStates: TaskScopedNodeAggregation['waitFreezesRuntimeStates']
    details: Record<string, any>
    timestamp: string
    status: 'running' | 'success' | 'failed'
    eventOrder: number
    activeNodeId?: number
    activeNodeName?: string
    intern: (value: string) => string
    resolveEventFocus: (details: Record<string, any>, fallbackFocus?: NodeInfo['focus']) => NodeInfo['focus']
    findWaitFreezesImages: (timestamp: string, actionName: string) => string[] | undefined
  }) => void
  resolveRuntimeStatusFromPhase: (phase: KnownMaaPhase) => 'running' | 'success' | 'failed'
  getActivePipelineNodeId: (taskId: number) => number | undefined
  getActivePipelineNodeName: () => string | undefined
  intern: (value: string) => string
  resolveEventFocus: (details: Record<string, any>, fallbackFocus?: NodeInfo['focus']) => NodeInfo['focus']
  findWaitFreezesImages: (timestamp: string, actionName: string) => string[] | undefined
  refresh: (timestamp: string) => void
}): boolean => {
  if (params.taskId != null) {
    const waitFreezesStatus = params.resolveRuntimeStatusFromPhase(params.phase)
    const aggregation = params.getOrCreateTaskNodeAggregation(
      params.taskScopedNodeAggregationByTaskId,
      params.taskId
    )
    params.upsertWaitFreezesState({
      runtimeStates: aggregation.waitFreezesRuntimeStates,
      details: params.details,
      timestamp: params.timestamp,
      status: waitFreezesStatus,
      eventOrder: params.eventOrder,
      activeNodeId: params.getActivePipelineNodeId(params.taskId),
      activeNodeName: params.taskId === params.rootTaskId ? params.getActivePipelineNodeName() : undefined,
      intern: params.intern,
      resolveEventFocus: params.resolveEventFocus,
      findWaitFreezesImages: params.findWaitFreezesImages,
    })
    params.onUpdated?.(params.details)
  }
  params.refresh(params.timestamp)
  return true
}
