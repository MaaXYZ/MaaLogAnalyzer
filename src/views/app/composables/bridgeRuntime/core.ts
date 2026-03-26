import { computed, onBeforeUnmount, onMounted } from 'vue'
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

const FORWARDED_SHORTCUT_KEYS = new Set(['w', 'p', 't'])

const execDocumentCommand = (command: 'paste' | 'copy' | 'cut' | 'selectAll' | 'undo') => {
  try {
    document.execCommand(command)
  } catch {
    // ignore unsupported commands in restricted environments
  }
}

export const useBridgeRuntimeCore = (options: UseBridgeRuntimeCoreOptions) => {
  let bridge: BridgeController | null = null

  const forwardBridgeKeydown = (event: KeyboardEvent) => {
    if (!bridge?.enabled) return

    const hasMeta = event.ctrlKey || event.metaKey
    const code = event.keyCode
    let handled = false

    if ((hasMeta && code === 86) || (event.shiftKey && code === 45)) {
      execDocumentCommand('paste')
      handled = true
    } else if (hasMeta && code === 67) {
      execDocumentCommand('copy')
      handled = true
    } else if (hasMeta && code === 88) {
      execDocumentCommand('cut')
      handled = true
    } else if (hasMeta && code === 65) {
      execDocumentCommand('selectAll')
      handled = true
    } else if (hasMeta && code === 90) {
      execDocumentCommand('undo')
      handled = true
    } else if (hasMeta && FORWARDED_SHORTCUT_KEYS.has(event.key.toLowerCase())) {
      bridge.sendNotification('bridge.keydown', {
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
      })
      handled = true
    }

    if (handled) {
      event.preventDefault()
    }
  }

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

  onMounted(() => {
    if (!options.runtime.bridgeEnabled) return
    window.addEventListener('keydown', forwardBridgeKeydown)
  })

  onBeforeUnmount(() => {
    if (!options.runtime.bridgeEnabled) return
    window.removeEventListener('keydown', forwardBridgeKeydown)
  })

  return {
    getBridge: () => bridge,
    realtimeSession,
    stopRealtimeSession,
    cleanupRealtimeSession,
    isRealtimeContext,
  }
}
