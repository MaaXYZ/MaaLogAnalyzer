import type { BridgeController } from '../../../../composables/useBridge'

export interface RealtimeEventItem {
  seq: number
  at: number
  msg: string
  details: Record<string, unknown>
}

export interface RealtimeSessionState {
  sessionId: string
  startedAt: number
  lastSeq: number
  lines?: string[]
  pendingLines: string[]
}

export interface SnapshotRequestResult {
  accepted: boolean
  sessionId: string
  fromSeq: number
  toSeq: number
  totalEvents: number
}

export interface UseRealtimeSessionOptions {
  getBridge: () => BridgeController | null
  shouldMaintainRealtimeTextTargets: boolean
  parseIntervalMs: number
  snapshotTimeoutMs: number
  snapshotMaxBatchSize: number
  asRecord: (value: unknown) => Record<string, unknown> | null
  toFiniteNumber: (value: unknown, fallback: number) => number
  appendRealtimeLines: (lines: string[]) => void
  getTasksSnapshot: () => unknown[]
  applyParsedTasks: (tasks: unknown[], preserveSelection: boolean) => void
  syncRealtimeLoadedTarget: (session: RealtimeSessionState) => void
  onSessionReset: () => void
  onRealtimeStartReset: () => void
}
