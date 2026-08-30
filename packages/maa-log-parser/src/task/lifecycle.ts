import {
  decodeTaskLifecycleEventDetails,
  readNumberField,
  type TaskLifecycleEventDetails,
} from '../shared/logEventDecoders'
import {
  resolveTaskLifecyclePhase,
  type MaaMessageMeta,
  type TaskTerminalPhase,
} from '../event/meta'

export const resolveEventTaskId = (
  details: Record<string, any> | undefined,
): number | undefined => {
  return readNumberField(details, 'task_id')
}

export const resolveTaskLifecycleEventDetails = (
  details: Record<string, any> | undefined,
): TaskLifecycleEventDetails => {
  return decodeTaskLifecycleEventDetails(details)
}

export interface TaskLifecycleMetaEventContext {
  rootTaskId: number
  peekActiveTask: () => number
  pushActiveTask: (taskId: number) => void
  popActiveTask: (taskId: number) => void
  setSubTaskParent: (taskId: number, parentTaskId: number) => void
  onSubTaskStarting: (
    taskId: number,
    details: Record<string, any>,
    message: string,
    timestamp: string,
  ) => void
  onSubTaskTerminal: (
    taskId: number,
    details: Record<string, any>,
    message: string,
    timestamp: string,
    phase: TaskTerminalPhase,
  ) => void
}

export const handleTaskLifecycleMetaEvent = (
  context: TaskLifecycleMetaEventContext,
  messageMeta: MaaMessageMeta,
  eventTaskId: number | undefined,
  details: Record<string, any>,
  message: string,
  timestamp: string,
): void => {
  const phase = resolveTaskLifecyclePhase(messageMeta)
  if (phase == null || eventTaskId == null) return

  if (phase === 'Starting') {
    const parentTaskId = context.peekActiveTask()
    if (eventTaskId !== context.rootTaskId && parentTaskId !== eventTaskId) {
      context.setSubTaskParent(eventTaskId, parentTaskId)
    }
    context.pushActiveTask(eventTaskId)
  } else {
    context.popActiveTask(eventTaskId)
  }

  if (eventTaskId === context.rootTaskId) return
  if (phase === 'Starting') {
    context.onSubTaskStarting(eventTaskId, details, message, timestamp)
  } else {
    context.onSubTaskTerminal(eventTaskId, details, message, timestamp, phase)
  }
}
