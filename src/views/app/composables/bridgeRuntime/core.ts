import { computed } from 'vue'
import type { TaskInfo } from '../../../../types'
import { useBridge, type BridgeController } from '../../../../composables/useBridge'
import { useRealtimeSession } from '../useRealtimeSession'
import { useBridgeRpcHandler } from '../useBridgeRpcHandler'
import type { UseBridgeRuntimeOptions } from './types'

interface UseBridgeRuntimeCoreOptions {
  runtime: UseBridgeRuntimeOptions
  onSessionResetBefore: () => void
}

const BRIDGE_CAPABILITIES = [
  'bridge.updateTheme',
  'bridge.keydown',
  'realtime.start',
  'realtime.push',
  'realtime.end',
  'realtime.snapshot.end',
]

export const useBridgeRuntimeCore = (options: UseBridgeRuntimeCoreOptions) => {
  let bridge: BridgeController | null = null

  const {
    realtimeSession,
    stopRealtimeSession,
    handleRealtimeStart,
    handleRealtimePush,
    handleRealtimeEnd,
    handleRealtimeSnapshotEnd,
    cleanupRealtimeSession,
  } = useRealtimeSession({
    getBridge: () => bridge,
    shouldMaintainRealtimeTextTargets: options.runtime.shouldMaintainRealtimeTextTargets,
    parseIntervalMs: options.runtime.parseIntervalMs,
    snapshotTimeoutMs: options.runtime.snapshotTimeoutMs,
    snapshotMaxBatchSize: options.runtime.snapshotMaxBatchSize,
    asRecord: options.runtime.asRecord,
    toFiniteNumber: options.runtime.toFiniteNumber,
    appendRealtimeLines: (lines) => options.runtime.parser.appendRealtimeLines(lines),
    getTasksSnapshot: () => options.runtime.parser.getTasksSnapshot(),
    applyParsedTasks: (nextTasks, preserveSelection) => {
      options.runtime.applyParsedTasks(nextTasks as TaskInfo[], preserveSelection)
    },
    syncRealtimeLoadedTarget: options.runtime.syncRealtimeLoadedTarget,
    onSessionReset: () => {
      options.onSessionResetBefore()
      options.runtime.onSessionReset()
    },
    onRealtimeStartReset: () => {
      options.runtime.onRealtimeStartReset()
    },
  })

  const isRealtimeContext = computed(() => {
    return realtimeSession.value !== null || options.runtime.textSearchLoadedDefaultTargetId.value.startsWith('realtime:')
  })

  const { handleJsonRpcMethod } = useBridgeRpcHandler({
    getBridge: () => bridge,
    bridgeThemeUpdatedEvent: options.runtime.bridgeThemeUpdatedEvent,
    handleRealtimeStart,
    handleRealtimePush,
    handleRealtimeEnd,
    handleRealtimeSnapshotEnd,
  })

  bridge = useBridge({
    enabled: options.runtime.bridgeEnabled,
    from: 'maa-log-analyzer',
    capabilities: BRIDGE_CAPABILITIES,
    readyPayload: {
      embed: {
        mode: options.runtime.appEmbedMode,
        bridgeEnabled: options.runtime.bridgeEnabled,
      },
    },
    onMethod: async (method, params, id) => {
      await handleJsonRpcMethod(method, params, id)
    },
  })

  return {
    getBridge: () => bridge,
    realtimeSession,
    stopRealtimeSession,
    cleanupRealtimeSession,
    isRealtimeContext,
  }
}
