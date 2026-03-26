import type { RealtimeEventItem, RealtimeSessionState } from './types'

interface ProcessRealtimeEventBatchOptions {
  session: RealtimeSessionState
  events: RealtimeEventItem[]
  mode: 'live' | 'snapshot'
  shouldMaintainRealtimeTextTargets: boolean
  toSyntheticEventLine: (event: RealtimeEventItem) => string | null
  requestRealtimeSnapshot: (sessionId: string, lastSeq: number) => Promise<void>
}

interface ProcessRealtimeEventBatchResult {
  appended: number
  hasGap: boolean
}

export const processRealtimeEventBatch = async (
  options: ProcessRealtimeEventBatchOptions,
): Promise<ProcessRealtimeEventBatchResult> => {
  let appended = 0
  let hasGap = false

  for (const event of options.events) {
    if (event.seq <= options.session.lastSeq) continue
    if (event.seq > options.session.lastSeq + 1) {
      hasGap = true
      console.warn('[realtime] seq gap detected, requesting snapshot replay:', {
        sessionId: options.session.sessionId,
        expectedSeq: options.session.lastSeq + 1,
        actualSeq: event.seq,
        mode: options.mode,
      })
      await options.requestRealtimeSnapshot(options.session.sessionId, options.session.lastSeq)
      break
    }
    const line = options.toSyntheticEventLine(event)
    options.session.lastSeq = event.seq
    if (!line) continue
    if (options.shouldMaintainRealtimeTextTargets) {
      options.session.lines?.push(line)
    }
    options.session.pendingLines.push(line)
    appended++
  }

  return { appended, hasGap }
}
