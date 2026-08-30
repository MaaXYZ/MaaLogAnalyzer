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
 * 第一遍：重新标记 `markRaw`。
 *
 * 必须先于冻结完成。`markRaw` 内部用 `Object.defineProperty` 写入 `__v_skip`，
 * 对已冻结的对象会抛错，所以标记与冻结不能在同一次遍历里交错进行。
 */
const markRawDetails = (value: unknown, seen: WeakSet<object>): void => {
  if (!isObject(value) || seen.has(value)) return
  seen.add(value)

  if (!Array.isArray(value)) {
    for (const key of RAW_DETAIL_KEYS) {
      const detail = value[key]
      if (isObject(detail)) markRaw(detail)
    }
  }

  for (const key of Reflect.ownKeys(value)) {
    markRawDetails(value[key], seen)
  }
}

/** 第二遍：深冻结，与主线程解析路径的 `freezeSnapshotData` 行为一致。 */
const freezeDeep = (value: unknown, seen: WeakSet<object>): void => {
  if (!isObject(value) || seen.has(value)) return
  seen.add(value)

  for (const key of Reflect.ownKeys(value)) {
    freezeDeep(value[key], seen)
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
  const markSeen = new WeakSet<object>()
  for (const task of tasks) markRawDetails(task, markSeen)

  const freezeSeen = new WeakSet<object>()
  for (const task of tasks) freezeDeep(task, freezeSeen)

  return tasks
}
