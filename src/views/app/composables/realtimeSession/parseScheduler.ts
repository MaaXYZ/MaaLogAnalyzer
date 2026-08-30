import { ref, type Ref } from 'vue'
import type { RealtimeSessionState } from './types'

interface CreateRealtimeParseSchedulerOptions {
  parseIntervalMs: number
  realtimeSession: Ref<RealtimeSessionState | null>
  appendRealtimeLines: (lines: string[]) => void
  getTasksSnapshot: () => unknown[]
  applyParsedTasks: (tasks: unknown[], preserveSelection: boolean) => void
  syncRealtimeLoadedTarget: (session: RealtimeSessionState) => void
}

const MAX_REALTIME_PARSE_RETRIES = 3

export const createRealtimeParseScheduler = (options: CreateRealtimeParseSchedulerOptions) => {
  const realtimeParsing = ref(false)
  const realtimeReparseRequested = ref(false)
  const realtimeParseFailed = ref(false)
  let realtimeParseTimer: number | null = null
  let realtimeParseRetryCount = 0

  const runRealtimeParse = async () => {
    if (realtimeParsing.value) {
      realtimeReparseRequested.value = true
      return
    }

    const session = options.realtimeSession.value
    if (!session) return

    realtimeParsing.value = true
    let retryRequested = false
    try {
      const pendingLineCount = session.pendingLines.length
      if (pendingLineCount > 0) {
        const pendingLines = session.pendingLines.slice(0, pendingLineCount)
        options.appendRealtimeLines(pendingLines)
        session.pendingLines.splice(0, pendingLineCount)
      }

      if (options.realtimeSession.value !== session) return

      const parsedTasks = options.getTasksSnapshot()
      options.applyParsedTasks(parsedTasks, true)
      options.syncRealtimeLoadedTarget(session)
      realtimeParseFailed.value = false
      realtimeParseRetryCount = 0
    } catch (error) {
      realtimeParseFailed.value = true
      console.warn('[realtime] parse failed:', error)
      if (
        options.realtimeSession.value === session &&
        realtimeParseRetryCount < MAX_REALTIME_PARSE_RETRIES
      ) {
        realtimeParseRetryCount += 1
        retryRequested = true
      }
    } finally {
      realtimeParsing.value = false
      const shouldSchedule = realtimeReparseRequested.value || retryRequested
      realtimeReparseRequested.value = false
      if (shouldSchedule && options.realtimeSession.value === session) {
        if (realtimeParseTimer == null) {
          realtimeParseTimer = window.setTimeout(() => {
            realtimeParseTimer = null
            void runRealtimeParse()
          }, options.parseIntervalMs)
        }
      }
    }
  }

  const scheduleRealtimeParse = () => {
    if (realtimeParseTimer != null) return
    realtimeParseTimer = window.setTimeout(() => {
      realtimeParseTimer = null
      void runRealtimeParse()
    }, options.parseIntervalMs)
  }

  const clearRealtimeParseTimer = () => {
    if (realtimeParseTimer == null) return
    window.clearTimeout(realtimeParseTimer)
    realtimeParseTimer = null
  }

  const resetParseState = () => {
    realtimeReparseRequested.value = false
    realtimeParsing.value = false
    realtimeParseFailed.value = false
    realtimeParseRetryCount = 0
  }

  return {
    realtimeParsing,
    realtimeReparseRequested,
    realtimeParseFailed,
    runRealtimeParse,
    scheduleRealtimeParse,
    clearRealtimeParseTimer,
    resetParseState,
  }
}
