import type { Ref } from 'vue'
import type { TextSearchLoadedTarget } from './useTextSearchTargets'
import type { UseBridgeRuntimeOptions } from './bridgeRuntime/types'
import { useBridgeRuntime } from './useBridgeRuntime'

type RuntimeOptionOverrides = Omit<
  UseBridgeRuntimeOptions,
  'parseIntervalMs' | 'snapshotTimeoutMs' | 'snapshotMaxBatchSize' | 'onSessionReset' | 'onRealtimeStartReset'
>

export interface UseAppRuntimeOrchestrationOptions extends RuntimeOptionOverrides {
  clearDeferredTextSearchTargets: () => void
  setTextSearchLoadedTargets: (targets: TextSearchLoadedTarget[], defaultId?: string) => void
  resetParserDebugAssets: () => void
  resetAnalysisState: () => void
  selectedProcessId: Ref<string>
  selectedThreadId: Ref<string>
}

const REALTIME_PARSE_INTERVAL_MS = 16
const REALTIME_SNAPSHOT_REQUEST_TIMEOUT_MS = 12000
const REALTIME_SNAPSHOT_MAX_BATCH_SIZE = 300

export const useAppRuntimeOrchestration = (options: UseAppRuntimeOrchestrationOptions) => {
  const bridgeRuntimeOptions = {
    bridgeEnabled: options.bridgeEnabled,
    appEmbedMode: options.appEmbedMode,
    isVscodeLaunchEmbed: options.isVscodeLaunchEmbed,
    bridgeThemeUpdatedEvent: options.bridgeThemeUpdatedEvent,
    shouldMaintainRealtimeTextTargets: options.shouldMaintainRealtimeTextTargets,
    parseIntervalMs: REALTIME_PARSE_INTERVAL_MS,
    snapshotTimeoutMs: REALTIME_SNAPSHOT_REQUEST_TIMEOUT_MS,
    snapshotMaxBatchSize: REALTIME_SNAPSHOT_MAX_BATCH_SIZE,
    parser: options.parser,
    textSearchLoadedDefaultTargetId: options.textSearchLoadedDefaultTargetId,
    selectedNode: options.selectedNode,
    selectedFlowItemId: options.selectedFlowItemId,
    asRecord: options.asRecord,
    toFiniteNumber: options.toFiniteNumber,
    toPositiveInteger: options.toPositiveInteger,
    toTrimmedNonEmptyString: options.toTrimmedNonEmptyString,
    getErrorMessage: options.getErrorMessage,
    buildNodeFlowItems: options.buildNodeFlowItems,
    flattenFlowItems: options.flattenFlowItems,
    applyParsedTasks: options.applyParsedTasks,
    syncRealtimeLoadedTarget: options.syncRealtimeLoadedTarget,
    onSessionReset: () => {
      options.clearDeferredTextSearchTargets()
      options.setTextSearchLoadedTargets([])
    },
    onRealtimeStartReset: () => {
      options.resetParserDebugAssets()
      options.parser.resetParsedEvents()
      options.resetAnalysisState()
      options.selectedProcessId.value = ''
      options.selectedThreadId.value = ''
    },
  }

  const {
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
  } = useBridgeRuntime(bridgeRuntimeOptions)

  const handleAppCleanup = () => {
    invalidateBridgeRecognitionLoad()
    invalidateBridgeNodeDefinitionLoad()
    clearBridgeRecognitionState()
    clearBridgeNodeDefinitionState()
    clearBridgeImageCache()
    clearBridgeTaskDocCache()
    cleanupRealtimeSession()
    options.resetParserDebugAssets()
  }

  return {
    stopRealtimeSession,
    isRealtimeContext,
    bridgeRecognitionImages,
    bridgeRecognitionImageRefs,
    bridgeRecognitionLoading,
    bridgeRecognitionError,
    bridgeNodeDefinition,
    bridgeNodeDefinitionLoading,
    bridgeNodeDefinitionError,
    bridgeRequestTaskDoc,
    bridgeRevealTask,
    bridgeOpenCrop,
    handleAppCleanup,
  }
}
