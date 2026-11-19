import { markRaw } from 'vue'
import type { TaskInfo } from '../types'

/**
 * 解析器内部用 `wrapRaw` 标记的字段，这些对象体积大且不需要响应式代理。
 * 结构化克隆只复制自有可枚举属性，`markRaw` 写入的 `__v_skip` 不可枚举，
 * 因此跨 Worker 传回后必须重新标记，否则 Vue 会深度代理整棵详情树。
 */
const RAW_DETAIL_KEYS = ['task_details', 'wait_freezes_details'] as const

const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  value !== null && typeof value === 'object'

/**
 * 给大体积详情对象补 `markRaw`。
 *
 * `markRaw` 用 `Object.defineProperty` 写 `__v_skip`，对已冻结对象会抛错；同一个
 * 详情对象可能被多个任务共享，先检查 `__v_skip` / 冻结状态，保证幂等、不重复 define。
 */
const markRawDetail = (detail: object): void => {
  if ('__v_skip' in detail || Object.isFrozen(detail)) return
  markRaw(detail)
}

/**
 * 单次遍历同时完成「补 markRaw」与「深冻结」。
 *
 * 两件事必须「先标记、后冻结」（同上），但不必分两遍：后序遍历时先给本对象引用的
 * 详情子对象补标记，递归完子节点再冻结自身即可。旧实现为此走两趟全树，改动后
 * 只走一趟——大型日志的任务树可达上百万节点，这一步在主线程是"解析 100% 之后"
 * 的主要耗时之一。与主线程解析路径的 `freezeSnapshotData` 行为保持一致。
 */
const reviveValue = (value: unknown, seen: WeakSet<object>): void => {
  if (!isObject(value) || seen.has(value)) return
  seen.add(value)

  if (!Array.isArray(value)) {
    for (const key of RAW_DETAIL_KEYS) {
      const detail = value[key]
      if (isObject(detail)) markRawDetail(detail)
    }
  }

  for (const key of Reflect.ownKeys(value)) {
    reviveValue(value[key], seen)
  }

  Object.freeze(value)
}

/**
 * 重新施加 Worker 传输过程中丢失的 `markRaw` 与深冻结。
 *
 * 解析器在主线程内解析时会对投影结果做这两件事（见 logParser 的
 * `freezeSnapshotData` 与 `wrapRaw`），Worker 路径必须在收到结果后补齐，
 * 使两条路径产出的任务树行为一致。
 */
export const reviveParsedTaskList = (tasks: TaskInfo[]): TaskInfo[] => {
  const seen = new WeakSet<object>()
  for (const task of tasks) reviveValue(task, seen)
  return tasks
}
