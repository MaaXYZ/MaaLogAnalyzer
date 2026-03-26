import type { Ref } from 'vue'
import type { BridgeController } from '../../../../composables/useBridge'
import type { SnapshotRequestResult } from './types'

interface CreateRealtimeSnapshotRequesterOptions {
  getBridge: () => BridgeController | null
  snapshotTimeoutMs: number
  snapshotMaxBatchSize: number
  asRecord: (value: unknown) => Record<string, unknown> | null
  toFiniteNumber: (value: unknown, fallback: number) => number
  snapshotRequestedFromSeq: Ref<number | null>
  snapshotRequesting: Ref<boolean>
  snapshotReplaying: Ref<boolean>
}

const queryRealtimeSnapshot = async (
  options: CreateRealtimeSnapshotRequesterOptions,
  sessionId: string,
  lastSeq: number,
): Promise<SnapshotRequestResult> => {
  const bridge = options.getBridge()
  if (!bridge?.enabled) {
    throw new Error('Bridge is disabled')
  }
  const result = await bridge.sendRequest('realtime.snapshot.request', {
    sessionId,
    lastSeq,
    maxBatchSize: options.snapshotMaxBatchSize,
  }, { timeoutMs: options.snapshotTimeoutMs })
  const record = options.asRecord(result)
  if (!record) {
    throw new Error('Invalid realtime.snapshot.request response')
  }
  return {
    accepted: record.accepted === true,
    sessionId: typeof record.sessionId === 'string' ? record.sessionId : sessionId,
    fromSeq: options.toFiniteNumber(record.fromSeq, lastSeq + 1),
    toSeq: options.toFiniteNumber(record.toSeq, lastSeq),
    totalEvents: options.toFiniteNumber(record.totalEvents, 0),
  }
}

export const createRealtimeSnapshotRequester = (
  options: CreateRealtimeSnapshotRequesterOptions,
) => {
  return async (sessionId: string, lastSeq: number) => {
    const bridge = options.getBridge()
    if (!bridge?.enabled) return
    if (options.snapshotRequesting.value) return
    if (options.snapshotRequestedFromSeq.value === lastSeq && options.snapshotReplaying.value) return

    options.snapshotRequesting.value = true
    options.snapshotRequestedFromSeq.value = lastSeq
    try {
      const result = await queryRealtimeSnapshot(options, sessionId, lastSeq)
      if (result.accepted) {
        options.snapshotReplaying.value = true
        return
      }
      options.snapshotReplaying.value = false
      console.warn('[realtime] snapshot request rejected:', result)
    } catch (error) {
      options.snapshotReplaying.value = false
      console.warn('[realtime] snapshot request failed:', error)
    } finally {
      options.snapshotRequesting.value = false
    }
  }
}
