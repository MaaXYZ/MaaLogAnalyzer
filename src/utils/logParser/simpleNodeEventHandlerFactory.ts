import type { RecognitionAttempt } from '../../types'
import type { KnownMaaPhase, MaaMessageMeta } from './eventMeta'
import type {
  ScopedActionEventHandler,
  ScopedActionNodeEventHandler,
} from './scopedNodeDispatchHelpers'
import { routeSimpleNodeEvent } from './simpleNodeEventRouter'

export const createSimpleNodeEventHandler = (params: {
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
}) => {
  return (
    taskId: number | null,
    messageMeta: MaaMessageMeta,
    phase: KnownMaaPhase,
    details: Record<string, any>,
    timestamp: string,
    eventOrder: number,
    handleActionEvent: ScopedActionEventHandler,
    handleActionNodeEvent: ScopedActionNodeEventHandler,
    onWaitFreezesUpdated?: (details: Record<string, any>) => void,
    onRecognitionAttempt?: (taskId: number, attempt: RecognitionAttempt) => void,
    skipRecognitionRefreshWhenTaskMissingOnFinish?: boolean
  ): boolean => {
    return routeSimpleNodeEvent({
      taskId,
      messageMeta,
      phase,
      details,
      timestamp,
      eventOrder,
      handleActionEvent,
      handleActionNodeEvent,
      onNextList: params.onNextList,
      onWaitFreezes: params.onWaitFreezes,
      onRecognition: params.onRecognition,
      onWaitFreezesUpdated,
      onRecognitionAttempt,
      skipRecognitionRefreshWhenTaskMissingOnFinish,
    })
  }
}
