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

export const createRealtimeParseScheduler = (
  options: CreateRealtimeParseSchedulerOptions,
) => {
  const realtimeParsing = ref(false)
  const realtimeReparseRequested = ref(false)
  let realtimeParseTimer: number | null = null

  const runRealtimeParse = async () => {
    if (realtimeParsing.value) {
      realtimeReparseRequested.value = true
      return
    }

    const session = options.realtimeSession.value
    if (!session) return

    realtimeParsing.value = true
    try {
      const pendingLines = session.pendingLines.splice(0, session.pendingLines.length)
      if (pendingLines.length > 0) {
        options.appendRealtimeLines(pendingLines)
      }
      const parsedTasks = options.getTasksSnapshot()
      options.applyParsedTasks(parsedTasks, true)
      options.syncRealtimeLoadedTarget(session)
    } catch (error) {
      console.warn('[realtime] parse failed:', error)
    } finally {
      realtimeParsing.value = false
      if (realtimeReparseRequested.value) {
        realtimeReparseRequested.value = false
        if (options.realtimeSession.value) {
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
  }

  return {
    realtimeParsing,
    realtimeReparseRequested,
    runRealtimeParse,
    scheduleRealtimeParse,
    clearRealtimeParseTimer,
    resetParseState,
  }
}
