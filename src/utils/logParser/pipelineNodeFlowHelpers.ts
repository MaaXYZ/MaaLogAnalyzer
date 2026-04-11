import type {
  NestedActionGroup,
  NodeInfo,
  RecognitionAttempt,
  UnifiedFlowItem,
} from '../../types'
import { buildActionFlowItems, buildRecognitionFlowItems } from '../nodeFlow'
import { toTimestampMs } from '../timestamp'
import {
  partitionActionScopeWaitFreezes,
  sortFlowItemsByTimestamp,
  splitAndAttachWaitFreezesFlowItems,
} from './flowAssemblyHelpers'
import { summarizeRuntimeStatus } from './subTaskCollector'
import type { TaskScopedNodeAggregation } from './taskScopedAggregationHelpers'
import { buildWaitFreezesFlowItems } from './waitFreezesHelpers'

export const summarizeActionFlowStatus = (
  items: UnifiedFlowItem[]
): 'success' | 'failed' | 'running' | null => {
  if (items.length === 0) return null
  return summarizeRuntimeStatus(items)
}

export const createActionRootFlowItem = (params: {
  actionId: number
  name: string
  status: UnifiedFlowItem['status']
  ts: string
  endTs?: string
  actionDetails?: NodeInfo['action_details']
  errorImage?: string
}): UnifiedFlowItem => {
  return {
    id: `node.action.${params.actionId}`,
    type: 'action',
    name: params.name,
    status: params.status,
    ts: params.ts,
    end_ts: params.endTs,
    action_id: params.actionId,
    action_details: params.actionDetails,
    error_image: params.errorImage,
  }
}

export const createFinalActionRootFactory = (params: {
  actionDetails?: NodeInfo['action_details']
  fallbackStatus: 'success' | 'failed'
  eventTimestamp: string
  errorImageCandidates: Array<string | null | undefined>
  fallbackActionId: number | null | undefined
  fallbackName: string
  fallbackTimestamp: string
  findErrorImageByNames: (timestamp: string, candidateNames: Array<string | null | undefined>) => string | undefined
}) => {
  return (actionFlow: UnifiedFlowItem[]) => {
    const hasActionRoot = !!params.actionDetails || actionFlow.length > 0
    if (!hasActionRoot) return null

    const actionStatus: 'success' | 'failed' = params.actionDetails
      ? (params.actionDetails.success ? 'success' : 'failed')
      : params.fallbackStatus
    const resolvedActionErrorImage = actionStatus === 'failed'
      ? params.findErrorImageByNames(params.eventTimestamp, params.errorImageCandidates)
      : undefined
    const resolvedActionId = params.actionDetails?.action_id ?? params.fallbackActionId ?? -1
    return createActionRootFlowItem({
      actionId: resolvedActionId,
      name: params.actionDetails?.name || params.fallbackName,
      status: actionStatus,
      ts: params.actionDetails?.ts || params.actionDetails?.end_ts || params.fallbackTimestamp,
      endTs: params.actionDetails?.end_ts,
      actionDetails: params.actionDetails,
      errorImage: resolvedActionErrorImage,
    })
  }
}

export const composePipelineNodeFlow = (params: {
  topLevelRecognitions: RecognitionAttempt[]
  actionLevelRecognitions: RecognitionAttempt[]
  nestedActionGroups: NestedActionGroup[]
  waitFreezesFlow: UnifiedFlowItem[]
  createActionRoot: (actionFlow: UnifiedFlowItem[]) => UnifiedFlowItem | null
}) => {
  const recognitionFlow = buildRecognitionFlowItems(params.topLevelRecognitions)
  const actionFlow = buildActionFlowItems(params.actionLevelRecognitions, params.nestedActionGroups)
  const {
    recognitionFlow: scopedRecognitionFlow,
    actionFlow: scopedActionFlow,
    actionScopeWaitFreezes,
    unassignedContextWaitFreezes,
  } = splitAndAttachWaitFreezesFlowItems({
    recognitionFlow,
    actionFlow,
    waitFreezesFlow: params.waitFreezesFlow,
    toTimestampMs,
  })
  const actionScopeWaitFreezesAll = [...actionScopeWaitFreezes, ...unassignedContextWaitFreezes]

  const actionRootBase = params.createActionRoot(actionFlow)
  const actionRoot: UnifiedFlowItem | null = actionRootBase
    ? {
        ...actionRootBase,
        children: scopedActionFlow.length > 0
          ? sortFlowItemsByTimestamp(
            [
              ...(actionRootBase.children ?? []),
              ...scopedActionFlow,
            ],
            toTimestampMs
          )
          : actionRootBase.children,
      }
    : null

  const waitFreezesPlacement = partitionActionScopeWaitFreezes(
    actionScopeWaitFreezesAll,
    toTimestampMs,
    actionRoot?.ts,
    actionRoot?.end_ts,
    actionRoot?.status,
  )
  if (actionRoot && waitFreezesPlacement.inside.length > 0) {
    actionRoot.children = sortFlowItemsByTimestamp(
      [
        ...(actionRoot.children ?? []),
        ...waitFreezesPlacement.inside,
      ],
      toTimestampMs
    )
  }

  const nodeFlow = [
    ...scopedRecognitionFlow,
    ...waitFreezesPlacement.before,
    ...(!actionRoot ? waitFreezesPlacement.inside : []),
    ...(actionRoot ? [actionRoot] : []),
    ...waitFreezesPlacement.after,
  ]

  return {
    nodeFlow,
    actionFlow,
  }
}

export const composeFinalPipelineNodeFlow = (params: {
  taskScopedNodeAggregationByTaskId: Map<number, TaskScopedNodeAggregation>
  taskId: number
  topLevelRecognitions: RecognitionAttempt[]
  actionLevelRecognitions: RecognitionAttempt[]
  nestedActionGroups: NestedActionGroup[]
  actionDetails?: NodeInfo['action_details']
  fallbackStatus: 'success' | 'failed'
  eventTimestamp: string
  details: Record<string, any>
  nodeName: string
  actionId: number | null | undefined
  nodeId: number | null | undefined
  fallbackTimestamp: string
  findErrorImageByNames: (timestamp: string, candidateNames: Array<string | null | undefined>) => string | undefined
}) => {
  return composePipelineNodeFlow({
    topLevelRecognitions: params.topLevelRecognitions,
    actionLevelRecognitions: params.actionLevelRecognitions,
    nestedActionGroups: params.nestedActionGroups,
    waitFreezesFlow: buildWaitFreezesFlowItems(
      params.taskScopedNodeAggregationByTaskId.get(params.taskId)?.waitFreezesRuntimeStates,
      params.taskId,
    ),
    createActionRoot: createFinalActionRootFactory({
      actionDetails: params.actionDetails,
      fallbackStatus: params.fallbackStatus,
      eventTimestamp: params.eventTimestamp,
      errorImageCandidates: [
        params.actionDetails?.name,
        params.details.action_details?.name,
        params.details.node_details?.name,
        params.details.reco_details?.name,
        params.nodeName,
      ],
      fallbackActionId: params.actionId ?? params.nodeId,
      fallbackName: params.nodeName,
      fallbackTimestamp: params.fallbackTimestamp,
      findErrorImageByNames: params.findErrorImageByNames,
    }),
  })
}
