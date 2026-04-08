import { markRaw } from 'vue'
import type { RecognitionAttempt } from '../../types'
import type { TaskTerminalPhase } from './eventMeta'
import type { SubTaskCollector } from './subTaskCollector'
import type { TaskScopedNodeAggregation } from './taskScopedAggregationHelpers'

export const finalizeSubTaskPipelineNodeEvent = (params: {
  subTaskId: number
  details: Record<string, any>
  phase: TaskTerminalPhase
  timestamp: string
  allocateSyntheticNodeId: () => number
  readNumberField: (details: Record<string, any>, field: string) => number | undefined
  resolveTerminalCompletionStatus: (phase: TaskTerminalPhase) => 'success' | 'failed'
  resolveActionDetailsActionId: (details: Record<string, any>) => number | null | undefined
  resolveSubTaskActionKey: (taskId: number, actionId: number | null | undefined) => string | null
  consumeMatchedSubTaskAction: (
    subTasks: Pick<SubTaskCollector, 'consumeActions' | 'addAction'>,
    subTaskId: number,
    actionId: number | null | undefined
  ) => {
    action_details?: any
    ts?: string
    end_ts?: string
  } | undefined
  subTasks: SubTaskCollector
  dedupeRecognitionAttempts: (items: RecognitionAttempt[]) => RecognitionAttempt[]
  attachRecognitionNodesToAttempts: (attempts: RecognitionAttempt[], nodes: RecognitionAttempt[]) => {
    attempts: RecognitionAttempt[]
    orphans: RecognitionAttempt[]
  }
  resolveFallbackRecoDetails: (details: Record<string, any>, attempts: RecognitionAttempt[]) => any
  withTimestamps: (
    actionDetails: any,
    startTimestamp?: string,
    endTimestamp?: string,
    fallbackEndTimestamp?: string
  ) => any
  composeFinalPipelineNodeFlow: (params: {
    taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>
    taskId: number
    topLevelRecognitions: RecognitionAttempt[]
    actionLevelRecognitions: RecognitionAttempt[]
    nestedActionGroups: any[]
    actionDetails?: any
    fallbackStatus: 'success' | 'failed'
    eventTimestamp: string
    details: Record<string, any>
    nodeName: string
    actionId: number | null | undefined
    nodeId: number | null | undefined
    fallbackTimestamp: string
    findErrorImageByNames: (timestamp: string, candidateNames: Array<string | null | undefined>) => string | undefined
  }) => {
    nodeFlow: any[]
  }
  findErrorImageByNames: (timestamp: string, candidateNames: Array<string | null | undefined>) => string | undefined
  getTaskNextList: (map: Map<number, TaskScopedNodeAggregation>, taskId: number) => any[]
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>
  scopedKey: (taskId: number, nodeId: number) => string
  subTaskPipelineNodeStartTimes: Map<string, string>
  subTaskActionStartTimes: Map<string, string>
  subTaskActionEndTimes: Map<string, string>
  subTaskActionStartOrders: Map<string, number>
  subTaskActionEndOrders: Map<string, number>
  activeSubTaskActionNodes: Map<string, any>
  activeRecognitionNodeAttempts: Map<string, RecognitionAttempt>
  clearSubTaskRuntimeStateAfterPipelineFinalize: (params: {
    subTaskId: number
    nodeId: number | null | undefined
    actionKey: string | null
    scopedKey: (taskId: number, nodeId: number) => string
    subTaskPipelineNodeStartTimes: Map<string, string>
    subTaskActionStartTimes: Map<string, string>
    subTaskActionEndTimes: Map<string, string>
    subTaskActionStartOrders: Map<string, number>
    subTaskActionEndOrders: Map<string, number>
    activeSubTaskActionNodes: Map<string, any>
    activeRecognitionNodeAttempts: Map<string, RecognitionAttempt>
    taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>
  }) => void
  intern: (value: string) => string
}): void => {
  const subTaskPipelineStatus = params.resolveTerminalCompletionStatus(params.phase)
  const nodeId = params.readNumberField(params.details, 'node_id')
  const resolvedNodeId = nodeId ?? params.allocateSyntheticNodeId()
  const endTimestamp = params.intern(params.timestamp)
  const startTimestamp = nodeId != null
    ? (params.subTaskPipelineNodeStartTimes.get(params.scopedKey(params.subTaskId, nodeId)) || endTimestamp)
    : endTimestamp
  const actionId = params.resolveActionDetailsActionId(params.details)
  const actionKey = params.resolveSubTaskActionKey(params.subTaskId, actionId)
  const actionStartTimestamp = actionKey ? params.subTaskActionStartTimes.get(actionKey) : undefined
  const actionEndTimestamp = actionKey ? params.subTaskActionEndTimes.get(actionKey) : undefined
  const matchedTaskAction = params.consumeMatchedSubTaskAction(params.subTasks, params.subTaskId, actionId)
  const mergedActionDetails = params.details.action_details || matchedTaskAction?.action_details
  const mergedActionStartTimestamp = actionStartTimestamp || matchedTaskAction?.ts
  const mergedActionEndTimestamp = actionEndTimestamp || matchedTaskAction?.end_ts
  const taskRecognitions = params.dedupeRecognitionAttempts(params.subTasks.consumeRecognitions(params.subTaskId))
  const recognitionNodes = params.dedupeRecognitionAttempts(params.subTasks.consumeRecognitionNodes(params.subTaskId))
  const attachedRecognitions = params.attachRecognitionNodesToAttempts(taskRecognitions, recognitionNodes)
  const fallbackRecoDetails = params.resolveFallbackRecoDetails(params.details, attachedRecognitions.attempts)
  const resolvedNodeName = params.intern(
    params.details.reco_details?.name || params.details.action_details?.name || params.details.name || ''
  )
  const resolvedNextList = params.getTaskNextList(params.taskScopedNodeAggregationByTaskId, params.subTaskId)
  const resolvedActionDetails = params.withTimestamps(
    mergedActionDetails,
    mergedActionStartTimestamp,
    mergedActionEndTimestamp,
    endTimestamp
  )
  const attachedTopLevelRecognitions = attachedRecognitions.attempts.length > 0
    ? attachedRecognitions.attempts
    : attachedRecognitions.orphans
  const attachedNodeRecognitions = attachedRecognitions.attempts.length > 0
    ? attachedRecognitions.attempts
    : (attachedRecognitions.orphans.length > 0 ? attachedRecognitions.orphans : undefined)
  const composedSubTaskFlow = params.composeFinalPipelineNodeFlow({
    taskScopedNodeAggregationByTaskId: params.taskScopedNodeAggregationByTaskId,
    taskId: params.subTaskId,
    topLevelRecognitions: attachedTopLevelRecognitions,
    actionLevelRecognitions: [],
    nestedActionGroups: [],
    actionDetails: resolvedActionDetails,
    fallbackStatus: subTaskPipelineStatus,
    eventTimestamp: params.timestamp,
    details: params.details,
    nodeName: resolvedNodeName,
    actionId,
    nodeId,
    fallbackTimestamp: endTimestamp,
    findErrorImageByNames: params.findErrorImageByNames,
  })
  const resolvedNodeFlow = composedSubTaskFlow.nodeFlow.length > 0
    ? composedSubTaskFlow.nodeFlow
    : undefined
  params.subTasks.addPipelineNode(params.subTaskId, {
    node_id: resolvedNodeId,
    name: resolvedNodeName,
    ts: startTimestamp,
    end_ts: endTimestamp,
    status: subTaskPipelineStatus,
    reco_details: fallbackRecoDetails ? markRaw(fallbackRecoDetails) : undefined,
    action_details: resolvedActionDetails,
    next_list: resolvedNextList,
    node_flow: resolvedNodeFlow,
    recognitions: attachedNodeRecognitions,
  })
  params.clearSubTaskRuntimeStateAfterPipelineFinalize({
    subTaskId: params.subTaskId,
    nodeId,
    actionKey,
    scopedKey: params.scopedKey,
    subTaskPipelineNodeStartTimes: params.subTaskPipelineNodeStartTimes,
    subTaskActionStartTimes: params.subTaskActionStartTimes,
    subTaskActionEndTimes: params.subTaskActionEndTimes,
    subTaskActionStartOrders: params.subTaskActionStartOrders,
    subTaskActionEndOrders: params.subTaskActionEndOrders,
    activeSubTaskActionNodes: params.activeSubTaskActionNodes,
    activeRecognitionNodeAttempts: params.activeRecognitionNodeAttempts,
    taskScopedNodeAggregationByTaskId: params.taskScopedNodeAggregationByTaskId,
  })
}
