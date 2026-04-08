import type { RecognitionAttempt } from '../../types'
import type { KnownMaaPhase } from './eventMeta'

export const pushRecognitionAttemptIfMissing = (
  target: RecognitionAttempt[],
  attempt: RecognitionAttempt | undefined
): void => {
  if (attempt && !target.includes(attempt)) {
    target.push(attempt)
  }
}

export const handleRecognitionStartEvent = (params: {
  taskId: number
  details: Record<string, any>
  timestamp: string
  eventOrder: number
  startRecognitionAttempt: (
    taskId: number,
    details: Record<string, any>,
    timestamp: string,
    eventOrder: number
  ) => RecognitionAttempt | undefined
  onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
}): void => {
  const attempt = params.startRecognitionAttempt(
    params.taskId,
    params.details,
    params.timestamp,
    params.eventOrder
  )
  if (attempt && params.onAttempt) {
    params.onAttempt(params.taskId, attempt)
  }
}

export const handleRecognitionFinishEvent = (params: {
  taskId: number
  details: Record<string, any>
  timestamp: string
  status: 'success' | 'failed'
  eventOrder: number
  finishRecognitionAttempt: (
    taskId: number,
    details: Record<string, any>,
    timestamp: string,
    status: 'success' | 'failed',
    eventOrder: number
  ) => RecognitionAttempt | undefined
  onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
}): void => {
  const attempt = params.finishRecognitionAttempt(
    params.taskId,
    params.details,
    params.timestamp,
    params.status,
    params.eventOrder
  )
  if (attempt && params.onAttempt) {
    params.onAttempt(params.taskId, attempt)
  }
}

export const handleRecognitionNodeEvent = (params: {
  taskId: number | null
  phase: KnownMaaPhase
  details: Record<string, any>
  timestamp: string
  eventOrder: number
  onStart: (
    taskId: number,
    details: Record<string, any>,
    timestamp: string,
    eventOrder: number,
    onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
  ) => void
  onFinish: (
    taskId: number,
    details: Record<string, any>,
    timestamp: string,
    status: 'success' | 'failed',
    eventOrder: number,
    onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
  ) => void
  resolveTerminalStatus: (phase: KnownMaaPhase) => 'success' | 'failed'
  refresh: (timestamp: string) => void
  onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
  skipRefreshWhenTaskMissingOnFinish?: boolean
}): boolean => {
  if (params.phase === 'Starting') {
    if (params.taskId != null) {
      params.onStart(
        params.taskId,
        params.details,
        params.timestamp,
        params.eventOrder,
        params.onAttempt
      )
    }
    params.refresh(params.timestamp)
    return true
  }
  if (params.taskId == null) {
    if (!params.skipRefreshWhenTaskMissingOnFinish) {
      params.refresh(params.timestamp)
    }
    return true
  }
  params.onFinish(
    params.taskId,
    params.details,
    params.timestamp,
    params.resolveTerminalStatus(params.phase),
    params.eventOrder,
    params.onAttempt
  )
  params.refresh(params.timestamp)
  return true
}
