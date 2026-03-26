import { ref } from 'vue'
import { createRealtimeEventLineBuilder } from './realtimeSession/eventLine'
import { processRealtimeEventBatch } from './realtimeSession/eventBatchProcessor'
import { parseRealtimeEvents } from './realtimeSession/eventParser'
import { createRealtimeParseScheduler } from './realtimeSession/parseScheduler'
import { createRealtimeSessionLifecycle } from './realtimeSession/sessionLifecycle'
import { createRealtimeSnapshotRequester } from './realtimeSession/snapshot'
import type {
  RealtimeSessionState,
  UseRealtimeSessionOptions,
} from './realtimeSession/types'

export type { RealtimeSessionState } from './realtimeSession/types'

export const useRealtimeSession = (options: UseRealtimeSessionOptions) => {
  const realtimeSession = ref<RealtimeSessionState | null>(null)
  const realtimeStreaming = ref(false)
  const realtimeSnapshotRequestedFromSeq = ref<number | null>(null)
  const realtimeSnapshotRequesting = ref(false)
  const realtimeSnapshotReplaying = ref(false)
  const { toSyntheticEventLine, clearUnknownMessages } = createRealtimeEventLineBuilder()
  const {
    scheduleRealtimeParse,
    clearRealtimeParseTimer,
    resetParseState,
  } = createRealtimeParseScheduler({
    parseIntervalMs: options.parseIntervalMs,
    realtimeSession,
    appendRealtimeLines: options.appendRealtimeLines,
    getTasksSnapshot: options.getTasksSnapshot,
    applyParsedTasks: options.applyParsedTasks,
    syncRealtimeLoadedTarget: options.syncRealtimeLoadedTarget,
  })
  const requestRealtimeSnapshot = createRealtimeSnapshotRequester({
    getBridge: options.getBridge,
    snapshotTimeoutMs: options.snapshotTimeoutMs,
    snapshotMaxBatchSize: options.snapshotMaxBatchSize,
    asRecord: options.asRecord,
    toFiniteNumber: options.toFiniteNumber,
    snapshotRequestedFromSeq: realtimeSnapshotRequestedFromSeq,
    snapshotRequesting: realtimeSnapshotRequesting,
    snapshotReplaying: realtimeSnapshotReplaying,
  })
  const {
    stopRealtimeSession,
    handleRealtimeStart,
    handleRealtimeEnd,
    handleRealtimeSnapshotEnd,
    cleanupRealtimeSession,
  } = createRealtimeSessionLifecycle({
    asRecord: options.asRecord,
    toFiniteNumber: options.toFiniteNumber,
    shouldMaintainRealtimeTextTargets: options.shouldMaintainRealtimeTextTargets,
    realtimeSession,
    realtimeStreaming,
    realtimeSnapshotRequestedFromSeq,
    realtimeSnapshotRequesting,
    realtimeSnapshotReplaying,
    clearUnknownMessages,
    onSessionReset: options.onSessionReset,
    onRealtimeStartReset: options.onRealtimeStartReset,
    syncRealtimeLoadedTarget: options.syncRealtimeLoadedTarget,
    clearRealtimeParseTimer,
    resetParseState,
    scheduleRealtimeParse,
  })

  const handleRealtimePush = async (params: unknown) => {
    const payload = options.asRecord(params)
    if (!payload) return

    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId) return
    const mode = payload.mode === 'snapshot' ? 'snapshot' : 'live'

    if (!realtimeSession.value || realtimeSession.value.sessionId !== sessionId) {
      handleRealtimeStart({
        sessionId,
        startedAt: Date.now(),
      })
    }

    const session = realtimeSession.value
    if (!session) return
    if (mode === 'snapshot') {
      realtimeSnapshotReplaying.value = true
    }

    const rawEvents = Array.isArray(payload.events) ? payload.events : []
    if (rawEvents.length === 0) return

    const events = parseRealtimeEvents({
      rawEvents,
      asRecord: options.asRecord,
      toFiniteNumber: options.toFiniteNumber,
    })
    if (events.length === 0) return
    events.sort((a, b) => a.seq - b.seq)

    const { appended, hasGap } = await processRealtimeEventBatch({
      session,
      events,
      mode,
      shouldMaintainRealtimeTextTargets: options.shouldMaintainRealtimeTextTargets,
      toSyntheticEventLine,
      requestRealtimeSnapshot,
    })

    if (hasGap && appended === 0) return
    if (appended === 0) return
    options.syncRealtimeLoadedTarget(session)
    scheduleRealtimeParse()
  }

  return {
    realtimeSession,
    realtimeStreaming,
    stopRealtimeSession,
    handleRealtimeStart,
    handleRealtimePush,
    handleRealtimeEnd,
    handleRealtimeSnapshotEnd,
    cleanupRealtimeSession,
  }
}
