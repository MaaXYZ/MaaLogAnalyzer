import { describe, expect, it } from 'vitest'
import { LogParser } from '../core/logParser'
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

const formatTimestamp = (eventIndex: number): string => {
  const totalSeconds = Math.floor(eventIndex / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const milliseconds = String(eventIndex % 1000).padStart(3, '0')
  return `2026-04-06 10:${minutes}:${seconds}.${milliseconds}`
}

const makeTaskStartingLine = (eventIndex: number, taskId: number): string =>
  `[${formatTimestamp(eventIndex)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":${taskId},"entry":"Task${taskId}","hash":"h-${taskId}","uuid":"u-${taskId}"}]`

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

  it('projects a chain where every task has events without a quadratic subtree walk', async () => {
    // 每个任务都有事件序列时，旧实现会给每个任务各走一遍自己的子树（收集归属进程集合）=
    // O(节点数²)：17,000 层的链实测 19s。改成一次后序并集后整条链 <1s。
    // 这里的 15s 上限只用来拦住那个二次方的回归，不是性能断言。
    const count = 17_000
    const lines = Array.from({ length: count }, (_, index) =>
      makeTaskStartingLine(index + 1, index + 1),
    )

    const parser = new LogParser()
    await parser.parseInputs([
      { content: lines.join('\n'), sourceKey: 'maafw.log', inputIndex: 0 },
    ])

    const tasks = parser.getTasksSnapshot()
    expect(tasks).toHaveLength(count)
    // 归属过滤没变：每个任务只收自己那一条事件
    expect(tasks.every((task) => task.events.length === 1)).toBe(true)
  }, 15_000)
})
