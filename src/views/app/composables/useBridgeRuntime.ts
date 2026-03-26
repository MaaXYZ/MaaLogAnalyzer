import { useBridgeCaches } from './useBridgeCaches'
import { useBridgeRecognition } from './useBridgeRecognition'
import { useBridgeNodeQuery } from './useBridgeNodeQuery'
import { useBridgeNodeDefinition } from './useBridgeNodeDefinition'
import { useBridgeTaskActions } from './useBridgeTaskActions'
import { useSelectedRecognitionTarget } from './useSelectedRecognitionTarget'
import { useBridgeDetailLoaders } from './useBridgeDetailLoaders'
import { useBridgeRuntimeCore } from './bridgeRuntime/core'
import type { UseBridgeRuntimeOptions } from './bridgeRuntime/types'

export const useBridgeRuntime = (options: UseBridgeRuntimeOptions) => {
  let clearBridgeNodeDefinitionStateProxy: () => void = () => {}

  const {
    toBridgeImageCacheKey,
    toBridgeTaskDocCacheKey,
    clearBridgeImageCache,
    clearBridgeTaskDocCache,
    getBridgeImageFromCache,
    getBridgeTaskDocFromCache,
    saveBridgeImageToCache,
    saveBridgeTaskDocToCache,
  } = useBridgeCaches()

  const {
    getBridge,
    realtimeSession,
    stopRealtimeSession,
    cleanupRealtimeSession,
    isRealtimeContext,
  } = useBridgeRuntimeCore({
    runtime: options,
    onSessionResetBefore: () => {
      clearBridgeNodeDefinitionStateProxy()
      clearBridgeImageCache()
      clearBridgeTaskDocCache()
    },
  })

  const { getSelectedRecognitionTarget } = useSelectedRecognitionTarget({
    bridgeEnabled: options.bridgeEnabled,
    isBridgeEnabled: () => getBridge()?.enabled === true,
    getSessionId: () => realtimeSession.value?.sessionId,
    selectedNode: options.selectedNode,
    selectedFlowItemId: options.selectedFlowItemId,
    buildNodeFlowItems: options.buildNodeFlowItems,
    flattenFlowItems: options.flattenFlowItems,
    toPositiveInteger: options.toPositiveInteger,
  })

  const {
    bridgeRecognitionImages,
    bridgeRecognitionImageRefs,
    bridgeRecognitionLoading,
    bridgeRecognitionError,
    invalidateBridgeRecognitionLoad,
    clearBridgeRecognitionState,
    loadBridgeRecognitionImages,
  } = useBridgeRecognition({
    getBridge,
    getSelectedRecognitionTarget,
    toPositiveInteger: options.toPositiveInteger,
    asRecord: options.asRecord,
    getErrorMessage: options.getErrorMessage,
    toBridgeImageCacheKey,
    getBridgeImageFromCache,
    saveBridgeImageToCache,
  })

  const {
    getBridgeSessionId,
    queryBridgeNode,
  } = useBridgeNodeQuery({
    isVscodeLaunchEmbed: options.isVscodeLaunchEmbed,
    getBridge,
    getSessionId: () => realtimeSession.value?.sessionId,
    asRecord: options.asRecord,
    toTrimmedNonEmptyString: options.toTrimmedNonEmptyString,
  })

  const {
    bridgeNodeDefinition,
    bridgeNodeDefinitionLoading,
    bridgeNodeDefinitionError,
    invalidateBridgeNodeDefinitionLoad,
    clearBridgeNodeDefinitionState,
    loadBridgeNodeDefinition,
  } = useBridgeNodeDefinition({
    getBridgeSessionId,
    getSelectedNode: () => options.selectedNode.value,
    getSelectedFlowItemId: () => options.selectedFlowItemId.value,
    queryBridgeNode,
    toTrimmedNonEmptyString: options.toTrimmedNonEmptyString,
    toPositiveInteger: options.toPositiveInteger,
    getErrorMessage: options.getErrorMessage,
  })
  clearBridgeNodeDefinitionStateProxy = clearBridgeNodeDefinitionState

  const {
    bridgeRequestTaskDoc,
    bridgeRevealTask,
    bridgeOpenCrop,
  } = useBridgeTaskActions({
    getBridge,
    getBridgeSessionId,
    toTrimmedNonEmptyString: options.toTrimmedNonEmptyString,
    toPositiveInteger: options.toPositiveInteger,
    toBridgeTaskDocCacheKey,
    getBridgeTaskDocFromCache,
    saveBridgeTaskDocToCache,
  })

  useBridgeDetailLoaders({
    getSelectedRecognitionTarget,
    loadBridgeRecognitionImages,
    getBridgeSessionId,
    selectedNode: options.selectedNode,
    selectedFlowItemId: options.selectedFlowItemId,
    toPositiveInteger: options.toPositiveInteger,
    loadBridgeNodeDefinition,
  })

  return {
    stopRealtimeSession,
    cleanupRealtimeSession,
    isRealtimeContext,
    bridgeRecognitionImages,
    bridgeRecognitionImageRefs,
    bridgeRecognitionLoading,
    bridgeRecognitionError,
    invalidateBridgeRecognitionLoad,
    clearBridgeRecognitionState,
    bridgeNodeDefinition,
    bridgeNodeDefinitionLoading,
    bridgeNodeDefinitionError,
    invalidateBridgeNodeDefinitionLoad,
    clearBridgeNodeDefinitionState,
    bridgeRequestTaskDoc,
    bridgeRevealTask,
    bridgeOpenCrop,
    clearBridgeImageCache,
    clearBridgeTaskDocCache,
  }
}
