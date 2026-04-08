import type { RecognitionAttempt } from '../../types'
import type { ScopedNodeDispatchConfig } from './scopedNodeDispatchHelpers'
import {
  createScopedPipelineNodeFinalizeHandler,
  createScopedSimpleNodeEventHandler,
  type ScopedActionEventHandler,
  type ScopedActionNodeEventHandler,
  type ScopedPipelineNodeStartingHandler,
} from './scopedNodeDispatchHelpers'

type RecognitionCallback = (taskId: number, recognition: RecognitionAttempt) => void

export const createRecognitionDispatchers = (params: {
  pushActionLevelRecognition: (attempt: RecognitionAttempt) => void
  pushCurrentTaskRecognitionAttempt: (attempt: RecognitionAttempt | undefined) => void
  addSubTaskRecognition: RecognitionCallback
  addSubTaskRecognitionNode: RecognitionCallback
}) => {
  const dispatchActionLevelRecognition: RecognitionCallback = (_taskId, recognition) => {
    params.pushActionLevelRecognition(recognition)
  }
  const addCurrentTaskRecognition: RecognitionCallback = (_taskId, recognition) => {
    params.pushCurrentTaskRecognitionAttempt(recognition)
  }

  return {
    dispatchActionLevelRecognition,
    addCurrentTaskRecognition,
    addSubTaskRecognition: params.addSubTaskRecognition,
    addSubTaskRecognitionNode: params.addSubTaskRecognitionNode,
  }
}

export const createNodeDispatchConfigs = (params: {
  rootTaskId: number
  handleSimpleNodeEvent: (...args: any[]) => boolean
  handleCurrentTaskActionEvent: ScopedActionEventHandler
  handleCurrentTaskActionNodeEvent: ScopedActionNodeEventHandler
  syncActiveNodeFocusAfterWaitFreezes: (details: Record<string, any>) => void
  handleSubTaskActionEvent: ScopedActionEventHandler
  handleSubTaskActionNodeLifecycleEvent: ScopedActionNodeEventHandler
  startCurrentPipelineNodeEvent: ScopedPipelineNodeStartingHandler
  startSubTaskPipelineNodeEvent: ScopedPipelineNodeStartingHandler
  finalizeTaskPipelineNodeEvent: (taskId: number, details: Record<string, any>, phase: any, timestamp: string) => void
  finalizeSubTaskPipelineNodeEvent: (taskId: number, details: Record<string, any>, phase: any, timestamp: string) => void
  pushActionLevelRecognition: (attempt: RecognitionAttempt) => void
  pushCurrentTaskRecognitionAttempt: (attempt: RecognitionAttempt | undefined) => void
  addSubTaskRecognition: RecognitionCallback
  addSubTaskRecognitionNode: RecognitionCallback
}) => {
  const {
    dispatchActionLevelRecognition,
    addCurrentTaskRecognition,
    addSubTaskRecognition,
    addSubTaskRecognitionNode,
  } = createRecognitionDispatchers({
    pushActionLevelRecognition: params.pushActionLevelRecognition,
    pushCurrentTaskRecognitionAttempt: params.pushCurrentTaskRecognitionAttempt,
    addSubTaskRecognition: params.addSubTaskRecognition,
    addSubTaskRecognitionNode: params.addSubTaskRecognitionNode,
  })

  const currentTaskNodeDispatchConfig: ScopedNodeDispatchConfig = {
    handleSimpleNodeEvent: createScopedSimpleNodeEventHandler({
      fixedTaskId: params.rootTaskId,
      handleSimpleNodeEvent: params.handleSimpleNodeEvent,
      handleActionEvent: params.handleCurrentTaskActionEvent,
      handleActionNodeEvent: params.handleCurrentTaskActionNodeEvent,
      onWaitFreezesUpdated: params.syncActiveNodeFocusAfterWaitFreezes,
      onRecognitionAttempt: addCurrentTaskRecognition,
    }),
    dispatchPendingRecognition: dispatchActionLevelRecognition,
    dispatchStandaloneRecognition: dispatchActionLevelRecognition,
    handlePipelineNodeStarting: params.startCurrentPipelineNodeEvent,
    handlePipelineNodeFinalize: createScopedPipelineNodeFinalizeHandler({
      fixedTaskId: params.rootTaskId,
      rootTaskId: params.rootTaskId,
      finalizeTaskPipelineNodeEvent: params.finalizeTaskPipelineNodeEvent,
      finalizeSubTaskPipelineNodeEvent: params.finalizeSubTaskPipelineNodeEvent,
    }),
    dispatchDetachedRecognition: params.pushActionLevelRecognition,
  }

  const subTaskNodeDispatchConfig: ScopedNodeDispatchConfig = {
    handleSimpleNodeEvent: createScopedSimpleNodeEventHandler({
      handleSimpleNodeEvent: params.handleSimpleNodeEvent,
      handleActionEvent: params.handleSubTaskActionEvent,
      handleActionNodeEvent: params.handleSubTaskActionNodeLifecycleEvent,
      onRecognitionAttempt: addSubTaskRecognition,
      skipRecognitionRefreshWhenTaskMissingOnFinish: true,
    }),
    dispatchPendingRecognition: addSubTaskRecognition,
    dispatchStandaloneRecognition: addSubTaskRecognitionNode,
    handlePipelineNodeStarting: params.startSubTaskPipelineNodeEvent,
    handlePipelineNodeFinalize: createScopedPipelineNodeFinalizeHandler({
      rootTaskId: params.rootTaskId,
      finalizeTaskPipelineNodeEvent: params.finalizeTaskPipelineNodeEvent,
      finalizeSubTaskPipelineNodeEvent: params.finalizeSubTaskPipelineNodeEvent,
    }),
    excludeTaskIdFromParentRecognitionLookup: true,
  }

  return {
    currentTaskNodeDispatchConfig,
    subTaskNodeDispatchConfig,
  }
}
