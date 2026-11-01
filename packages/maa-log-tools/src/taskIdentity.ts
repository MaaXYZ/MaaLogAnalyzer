import type { TaskInfo } from '@windsland52/maa-log-parser/types'

/**
 * 任务身份在本仓库里有三套，定位不同，别混用：
 *
 * 1. `task_execution_id`（parser 输出）：**单次加载内**唯一。本文件的身份函数优先用它 ——
 *    它由作用域 id 派生（`task:<taskId>:<localId>:seq<起始序号>`），比旧的
 *    `_startEventIndex` 多带了 taskId，同时天然区分同进程重复执行。
 * 2. `_startEventIndex` / `uuid` / 复合键：**回退路径**。旧快照、被裁剪过的对象、
 *    或第三方手工构造的 TaskInfo 可能没有 `task_execution_id`，这时仍按历史规则算。
 * 3. `(process_id, task_id, start_time)`：**跨运行/跨材料**的稳定键。它不是本函数的职责
 *    （本函数用于同一次会话内的选中同步、列表 key、布局缓存），跨运行比对请用那一组字段。
 */

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
  task: Pick<
    TaskInfo,
    'task_id' | 'start_time' | 'entry' | 'hash' | 'uuid' | '_startEventIndex' | 'task_execution_id'
  >,
): string => {
  // 首选 parser 给出的执行身份：与 scope 一一对应，跨快照稳定
  const executionId = normalize(task.task_execution_id)
  if (executionId) return `exec:${executionId}`

  if (typeof task._startEventIndex === 'number' && task._startEventIndex >= 0) {
    return `startEvent:${task._startEventIndex}`
  }

  const uuid = normalize(task.uuid)
  if (uuid) return `uuid:${uuid}`

  return buildCompositeIdentity(task)
}

export const isSameTask = (
  left: Pick<
    TaskInfo,
    'task_id' | 'start_time' | 'entry' | 'hash' | 'uuid' | '_startEventIndex' | 'task_execution_id'
  >,
  right: Pick<
    TaskInfo,
    'task_id' | 'start_time' | 'entry' | 'hash' | 'uuid' | '_startEventIndex' | 'task_execution_id'
  >,
): boolean => {
  if (left === right) return true

  const leftExecutionId = normalize(left.task_execution_id)
  const rightExecutionId = normalize(right.task_execution_id)
  if (leftExecutionId && rightExecutionId) return leftExecutionId === rightExecutionId

  if (
    typeof left._startEventIndex === 'number' &&
    left._startEventIndex >= 0 &&
    typeof right._startEventIndex === 'number' &&
    right._startEventIndex >= 0
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
  const byRef = tasks.findIndex((task) => task === target)
  if (byRef >= 0) return byRef

  const byIdentity = tasks.findIndex((task) => isSameTask(task, target))
  if (byIdentity >= 0) return byIdentity

  const targetIdentity = buildTaskIdentity(target)
  return tasks.findIndex((task) => buildTaskIdentity(task) === targetIdentity)
}
