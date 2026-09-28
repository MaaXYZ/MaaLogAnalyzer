import { describe, expect, it } from 'vitest'
import type { ScopeNode } from '../trace/scopeTypes'
import { projectTasksFromTrace, type SequencedTaskEvent } from '../projector/taskProjector'

const makeTaskScope = (depthIndex: number): ScopeNode => ({
  id: `Px1|task:${depthIndex}`,
  kind: 'task',
  status: 'running',
  ts: '2026-04-06 10:00:00.000',
  seq: depthIndex,
  taskId: depthIndex,
  payload: { entry: `Task${depthIndex}`, processId: 'Px1' },
  children: [],
})

/** root → task1 → task2 → …：每一层都挂在还没闭合的那一层下面。 */
const buildTaskChain = (depth: number): ScopeNode => {
  const root: ScopeNode = {
    id: 'root',
    kind: 'trace_root',
    status: 'running',
    ts: '2026-04-06 10:00:00.000',
    seq: 0,
    payload: {},
    children: [],
  }
  let cursor = root
  for (let index = 1; index <= depth; index += 1) {
    const child = makeTaskScope(index)
    cursor.children.push(child)
    cursor = child
  }
  return root
}

describe('deep scope chains', () => {
  it('projects a long chain of unclosed tasks instead of overflowing the stack', () => {
    // 轮转片段丢失、Tasker.Task.Failed/Succeeded 成批缺失时，每个新任务都会挂在还开着的那一个下面，
    // 作用域树退化成上万层的链（实测 17,000 个连续未闭合任务 = 深度 17,000）。
    // 旧实现里 collectTaskScopes / collectSubtreeProcessIds 是递归的，这种输入直接 RangeError。
    const depth = 17_000
    const root = buildTaskChain(depth)
    // 给第一层任务一份（空）事件序列，让投影真的走一遍子树进程收集。
    const sequencedEventsByTaskId = new Map<number, SequencedTaskEvent[]>([[1, []]])

    const tasks = projectTasksFromTrace(root, { sequencedEventsByTaskId })

    expect(tasks).toHaveLength(depth)
  })
})
