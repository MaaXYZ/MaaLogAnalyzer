import type { TaskInfo } from '../types'

const normalize = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const buildCompositeIdentity = (
  task: Pick<TaskInfo, 'task_id' | 'start_time' | 'entry' | '_startEventIndex' | 'hash'>,
): string => {
  const startEventIndex = typeof task._startEventIndex === 'number' ? task._startEventIndex : -1
  return `task:${task.task_id}|start:${normalize(task.start_time)}|entry:${normalize(task.entry)}|startEvent:${startEventIndex}|hash:${normalize(task.hash)}`
}

export const buildTaskIdentity = (
  task: Pick<TaskInfo, 'task_id' | 'start_time' | 'entry' | 'hash' | 'uuid' | '_startEventIndex'>,
): string => {
  if (typeof task._startEventIndex === 'number' && task._startEventIndex >= 0) {
    return `startEvent:${task._startEventIndex}`
  }

  const uuid = normalize(task.uuid)
  if (uuid) return `uuid:${uuid}`

  return buildCompositeIdentity(task)
}

export const isSameTask = (
  left: Pick<TaskInfo, 'task_id' | 'start_time' | 'entry' | 'hash' | 'uuid' | '_startEventIndex'>,
  right: Pick<TaskInfo, 'task_id' | 'start_time' | 'entry' | 'hash' | 'uuid' | '_startEventIndex'>,
): boolean => {
  if (left === right) return true

  if (
    typeof left._startEventIndex === 'number' && left._startEventIndex >= 0
    && typeof right._startEventIndex === 'number' && right._startEventIndex >= 0
  ) {
    return left._startEventIndex === right._startEventIndex
  }

  const leftUuid = normalize(left.uuid)
  const rightUuid = normalize(right.uuid)
  if (leftUuid && rightUuid) return leftUuid === rightUuid
  if (leftUuid || rightUuid) return false

  return buildCompositeIdentity(left) === buildCompositeIdentity(right)
}

export const findTaskIndex = (tasks: TaskInfo[], target: TaskInfo): number => {
  const byRef = tasks.findIndex(task => task === target)
  if (byRef >= 0) return byRef

  const byIdentity = tasks.findIndex(task => isSameTask(task, target))
  if (byIdentity >= 0) return byIdentity

  const targetIdentity = buildTaskIdentity(target)
  return tasks.findIndex(task => buildTaskIdentity(task) === targetIdentity)
}
