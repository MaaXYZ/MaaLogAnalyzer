import type { EventNotification, NodeInfo, TaskInfo } from '../../types'
import type { StringPool } from '../stringPool'
import {
  isTaskTerminalPhase,
  resolveTaskLifecyclePhase,
  resolveTaskTerminalStatus,
  type MaaMessageMeta,
} from './eventMeta'
import { resolveEventTaskId, resolveTaskLifecycleEventDetails } from './taskLifecycle'
import { settleCompletedTaskNodes } from './taskCompletionHelpers'
import { compactTaskEventDetails } from './taskEventCompaction'

type BuildTasksFromEventsParams = {
  events: EventNotification[]
  stringPool: StringPool
  getCachedMaaMessageMeta: (message: string) => MaaMessageMeta
  getTaskNodes: (task: TaskInfo) => NodeInfo[]
}

export function buildTasksFromEvents(params: BuildTasksFromEventsParams): TaskInfo[] {
  const { events, stringPool, getCachedMaaMessageMeta, getTaskNodes } = params
  const tasks: TaskInfo[] = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const { message, details } = event
    const meta = getCachedMaaMessageMeta(message)
    const taskLifecyclePhase = resolveTaskLifecyclePhase(meta)
    const lifecycleDetails = resolveTaskLifecycleEventDetails(details)

    if (taskLifecyclePhase === 'Starting') {
      const taskId = lifecycleDetails.task_id
      const uuid = lifecycleDetails.uuid

      const isDuplicate = tasks.some(t =>
        t.uuid === uuid && t.task_id === taskId && !t.end_time
      )

      if (taskId && !isDuplicate) {
        tasks.push({
          task_id: taskId,
          entry: stringPool.intern(lifecycleDetails.entry),
          hash: stringPool.intern(lifecycleDetails.hash),
          uuid: stringPool.intern(uuid),
          start_time: stringPool.intern(event.timestamp),
          status: 'running',
          nodes: [],
          events: [],
          duration: undefined,
          _startEventIndex: i,
        })
      }
    } else if (taskLifecyclePhase && isTaskTerminalPhase(taskLifecyclePhase)) {
      const taskId = lifecycleDetails.task_id
      const uuid = lifecycleDetails.uuid

      let matchedTask = null
      if (uuid && uuid.trim() !== '') {
        matchedTask = tasks.find(t => t.uuid === uuid && !t.end_time)
      } else {
        matchedTask = tasks.find(t => t.task_id === taskId && !t.end_time)
      }

      if (matchedTask) {
        matchedTask.status = resolveTaskTerminalStatus(taskLifecyclePhase)
        matchedTask.end_time = stringPool.intern(event.timestamp)
        matchedTask._endEventIndex = i

        if (matchedTask.start_time && matchedTask.end_time) {
          const start = new Date(matchedTask.start_time).getTime()
          const end = new Date(matchedTask.end_time).getTime()
          matchedTask.duration = end - start
        }
      }
    }
  }

  for (const task of tasks) {
    task.nodes = getTaskNodes(task)
    settleCompletedTaskNodes(task)
    const taskStartIndex = task._startEventIndex ?? -1
    const taskEndIndex = task._endEventIndex ?? events.length - 1
    if (taskStartIndex >= 0) {
      task.events = events
        .slice(taskStartIndex, taskEndIndex + 1)
        .filter(event => resolveEventTaskId(event.details) === task.task_id)
        .map((event) => ({
          timestamp: event.timestamp,
          level: event.level,
          message: event.message,
          details: compactTaskEventDetails(event.message, event.details ?? {}, stringPool),
          _lineNumber: event._lineNumber,
        }))
    }

    if (task.status === 'running' && task.nodes.length > 0) {
      const lastNode = task.nodes[task.nodes.length - 1]
      const start = new Date(task.start_time).getTime()
      const end = new Date(lastNode.end_ts || lastNode.ts).getTime()
      task.duration = end - start
    }
  }

  return tasks.filter(task => task.entry !== 'MaaTaskerPostStop')
}
