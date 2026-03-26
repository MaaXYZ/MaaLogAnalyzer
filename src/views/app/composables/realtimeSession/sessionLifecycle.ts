import type { Ref } from 'vue'
import type { RealtimeSessionState } from './types'

interface CreateRealtimeSessionLifecycleOptions {
  asRecord: (value: unknown) => Record<string, unknown> | null
  toFiniteNumber: (value: unknown, fallback: number) => number
  shouldMaintainRealtimeTextTargets: boolean
  realtimeSession: Ref<RealtimeSessionState | null>
  realtimeStreaming: Ref<boolean>
  realtimeSnapshotRequestedFromSeq: Ref<number | null>
  realtimeSnapshotRequesting: Ref<boolean>
  realtimeSnapshotReplaying: Ref<boolean>
  clearUnknownMessages: () => void
  onSessionReset: () => void
  onRealtimeStartReset: () => void
  syncRealtimeLoadedTarget: (session: RealtimeSessionState) => void
  clearRealtimeParseTimer: () => void
  resetParseState: () => void
  scheduleRealtimeParse: () => void
}

export const createRealtimeSessionLifecycle = (
  options: CreateRealtimeSessionLifecycleOptions,
) => {
  const stopRealtimeSession = () => {
    options.realtimeSession.value = null
    options.resetParseState()
    options.realtimeStreaming.value = false
    options.realtimeSnapshotRequestedFromSeq.value = null
    options.realtimeSnapshotRequesting.value = false
    options.realtimeSnapshotReplaying.value = false
    options.clearUnknownMessages()
    options.onSessionReset()
    options.clearRealtimeParseTimer()
  }

  const handleRealtimeStart = (params: unknown) => {
    const payload = options.asRecord(params)
    if (!payload) return

    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId) return

    options.clearRealtimeParseTimer()
    options.resetParseState()
    options.realtimeSnapshotRequestedFromSeq.value = null
    options.realtimeSnapshotRequesting.value = false
    options.realtimeSnapshotReplaying.value = false
    options.clearUnknownMessages()
    options.onSessionReset()

    options.realtimeSession.value = {
      sessionId,
      startedAt: options.toFiniteNumber(payload.startedAt, Date.now()),
      lastSeq: 0,
      lines: options.shouldMaintainRealtimeTextTargets ? [] : undefined,
      pendingLines: [],
    }
    options.realtimeStreaming.value = true

    options.onRealtimeStartReset()
    options.syncRealtimeLoadedTarget(options.realtimeSession.value)
  }

  const handleRealtimeEnd = (params: unknown) => {
    const payload = options.asRecord(params)
    if (!payload) return

    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId || !options.realtimeSession.value || options.realtimeSession.value.sessionId !== sessionId) return

    options.realtimeStreaming.value = false
    options.scheduleRealtimeParse()
  }

  const handleRealtimeSnapshotEnd = (params: unknown) => {
    const payload = options.asRecord(params)
    if (!payload) return

    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId || !options.realtimeSession.value || options.realtimeSession.value.sessionId !== sessionId) return

    options.realtimeSnapshotReplaying.value = false
    options.realtimeSnapshotRequestedFromSeq.value = null
    options.scheduleRealtimeParse()
  }

  const cleanupRealtimeSession = () => {
    options.clearRealtimeParseTimer()
  }

  return {
    stopRealtimeSession,
    handleRealtimeStart,
    handleRealtimeEnd,
    handleRealtimeSnapshotEnd,
    cleanupRealtimeSession,
  }
}
