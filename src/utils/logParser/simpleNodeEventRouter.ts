import type { RecognitionAttempt } from '../../types'
import type { KnownMaaPhase, MaaMessageMeta } from './eventMeta'
import type {
  ScopedActionEventHandler,
  ScopedActionNodeEventHandler,
} from './scopedNodeDispatchHelpers'

type RouteSimpleNodeEventParams = {
  taskId: number | null
  messageMeta: MaaMessageMeta
  phase: KnownMaaPhase
  details: Record<string, any>
  timestamp: string
  eventOrder: number
  handleActionEvent: ScopedActionEventHandler
  handleActionNodeEvent: ScopedActionNodeEventHandler
  onNextList: (
    taskId: number | null,
    phase: KnownMaaPhase,
    details: Record<string, any>,
    timestamp: string
  ) => boolean
  onWaitFreezes: (
    taskId: number | null,
    phase: KnownMaaPhase,
    details: Record<string, any>,
    timestamp: string,
    eventOrder: number,
    onUpdated?: (details: Record<string, any>) => void
  ) => boolean
  onRecognition: (
    taskId: number | null,
    phase: KnownMaaPhase,
    details: Record<string, any>,
    timestamp: string,
    eventOrder: number,
    onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void,
    skipRefreshWhenTaskMissingOnFinish?: boolean
  ) => boolean
  onWaitFreezesUpdated?: (details: Record<string, any>) => void
  onRecognitionAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
  skipRecognitionRefreshWhenTaskMissingOnFinish?: boolean
}

export const routeSimpleNodeEvent = (params: RouteSimpleNodeEventParams): boolean => {
  switch (params.messageMeta.nodeKind) {
    case 'NextList':
      return params.onNextList(params.taskId, params.phase, params.details, params.timestamp)
    case 'WaitFreezes':
      return params.onWaitFreezes(
        params.taskId,
        params.phase,
        params.details,
        params.timestamp,
        params.eventOrder,
        params.onWaitFreezesUpdated
      )
    case 'Recognition':
      return params.onRecognition(
        params.taskId,
        params.phase,
        params.details,
        params.timestamp,
        params.eventOrder,
        params.onRecognitionAttempt,
        params.skipRecognitionRefreshWhenTaskMissingOnFinish
      )
    case 'Action':
      params.handleActionEvent(params.taskId, params.phase, params.details, params.timestamp, params.eventOrder)
      return true
    case 'ActionNode':
      params.handleActionNodeEvent(params.taskId, params.phase, params.details, params.timestamp)
      return true
    default:
      return false
  }
}
