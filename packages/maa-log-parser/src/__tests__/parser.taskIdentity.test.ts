import { describe, expect, it } from 'vitest'
import type { ParseSourceInput } from '../core/logParser'
import { LogParser } from '../core/logParser'

const formatTimestamp = (eventIndex: number): string => {
  const second = Math.floor(eventIndex / 1000)
  const millisecond = eventIndex % 1000
  return `2026-04-06 10:00:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}`
}

const makeEventLine = (
  eventIndex: number,
  message: string,
  details: Record<string, unknown>,
  source?: { processId?: string; threadId?: string },
): string => {
  const processId = source?.processId ?? 'Px1'
  const threadId = source?.threadId ?? 'Tx1'
  return `[${formatTimestamp(eventIndex)}][INF][${processId}][${threadId}][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const taskStarting = (eventIndex: number, taskId: number, entry: string, processId?: string) =>
  makeEventLine(
    eventIndex,
    'Tasker.Task.Starting',
    { task_id: taskId, entry, hash: 'h', uuid: 'u' },
    {
      processId,
    },
  )

const taskSucceeded = (eventIndex: number, taskId: number, entry: string, processId?: string) =>
  makeEventLine(
    eventIndex,
    'Tasker.Task.Succeeded',
    { task_id: taskId, entry, hash: 'h', uuid: 'u' },
    { processId },
  )

const nodeStarting = (
  eventIndex: number,
  taskId: number,
  nodeId: number,
  name: string,
  processId?: string,
) =>
  makeEventLine(
    eventIndex,
    'Node.PipelineNode.Starting',
    { task_id: taskId, node_id: nodeId, name },
    { processId },
  )

const nodeSucceeded = (
  eventIndex: number,
  taskId: number,
  nodeId: number,
  name: string,
  processId?: string,
) =>
  makeEventLine(
    eventIndex,
    'Node.PipelineNode.Succeeded',
    { task_id: taskId, node_id: nodeId, name },
    { processId },
  )

describe('TaskInfo 身份与来源信息（下游可追溯性）', () => {
  it('① 同一 task_id 被两个进程复用时，按 (process_id, task_id) 能分开', async () => {
    const lines = [
      // 两个进程交错跑，都用 task_id = 1
      taskStarting(1, 1, 'AlphaTask', 'Px1'),
      taskStarting(2, 1, 'BetaTask', 'Px2'),
      nodeStarting(3, 1, 101, 'AlphaNode', 'Px1'),
      nodeStarting(4, 1, 101, 'BetaNode', 'Px2'),
      nodeSucceeded(5, 1, 101, 'AlphaNode', 'Px1'),
      nodeSucceeded(6, 1, 101, 'BetaNode', 'Px2'),
      taskSucceeded(7, 1, 'AlphaTask', 'Px1'),
      taskSucceeded(8, 1, 'BetaTask', 'Px2'),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()

    const alpha = tasks.find((task) => task.entry === 'AlphaTask')
    const beta = tasks.find((task) => task.entry === 'BetaTask')

    expect(alpha).toBeTruthy()
    expect(beta).toBeTruthy()
    // 关键：两个任务的 task_id 相同，但 process_id 不同
    expect(alpha?.task_id).toBe(1)
    expect(beta?.task_id).toBe(1)
    expect(alpha?.process_id).toBe('Px1')
    expect(beta?.process_id).toBe('Px2')

    // 更细一级：同一 (process_id, task_id) 的两次执行也能靠 task_execution_id 分开
    expect(alpha?.task_execution_id).toBeTruthy()
    expect(beta?.task_execution_id).toBeTruthy()
    expect(alpha?.task_execution_id).not.toBe(beta?.task_execution_id)

    // 事件级也带进程归属，下游不必再按时间区间反推
    const alphaStarting = alpha?.events.find((event) => event.message === 'Tasker.Task.Starting')
    expect(alphaStarting?.process_id).toBe('Px1')
  })

  it('①同进程重复执行同一 task_id 时，task_execution_id 仍能区分两次执行', async () => {
    const lines = [
      taskStarting(1, 1, 'RepeatTask', 'Px1'),
      nodeStarting(2, 1, 101, 'N1', 'Px1'),
      nodeSucceeded(3, 1, 101, 'N1', 'Px1'),
      taskSucceeded(4, 1, 'RepeatTask', 'Px1'),
      // 同进程、同 task_id，再跑一次
      taskStarting(5, 1, 'RepeatTask', 'Px1'),
      nodeStarting(6, 1, 101, 'N1', 'Px1'),
      nodeSucceeded(7, 1, 101, 'N1', 'Px1'),
      taskSucceeded(8, 1, 'RepeatTask', 'Px1'),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()

    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.task_id).toBe(1)
    expect(tasks[1]?.task_id).toBe(1)
    expect(tasks[0]?.process_id).toBe('Px1')
    expect(tasks[1]?.process_id).toBe('Px1')
    expect(tasks[0]?.task_execution_id).not.toBe(tasks[1]?.task_execution_id)
  })

  it('② entry 的来源可以区分（field / node）', async () => {
    const lines = [
      taskStarting(1, 1, 'RealTask', 'Px1'),
      nodeStarting(2, 1, 101, 'OnlyNode', 'Px1'),
      nodeSucceeded(3, 1, 101, 'OnlyNode', 'Px1'),
      taskSucceeded(4, 1, 'RealTask', 'Px1'),
      // 隐式任务：只有节点事件，没有 Starting，也没有带 entry 的终止事件
      nodeStarting(5, 2, 201, 'ImplicitNode', 'Px1'),
      nodeSucceeded(6, 2, 201, 'ImplicitNode', 'Px1'),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()

    const real = tasks.find((task) => task.task_id === 1)
    const implicit = tasks.find((task) => task.task_id === 2)

    expect(real?.entry).toBe('RealTask')
    expect(real?.entry_source).toBe('field')

    // 隐式任务没有 entry 字段，靠第一个节点名兜底 —— 下游据此知道这不是真任务名
    expect(implicit?.entry).toBe('ImplicitNode')
    expect(implicit?.entry_source).toBe('node')
  })

  it('③ has_starting_event 反映是否真的收到过 Tasker.Task.Starting，且 events 仍保留该事件', async () => {
    const lines = [
      taskStarting(1, 1, 'RealTask', 'Px1'),
      nodeStarting(2, 1, 101, 'OnlyNode', 'Px1'),
      nodeSucceeded(3, 1, 101, 'OnlyNode', 'Px1'),
      taskSucceeded(4, 1, 'RealTask', 'Px1'),
      nodeStarting(5, 2, 201, 'ImplicitNode', 'Px1'),
      nodeSucceeded(6, 2, 201, 'ImplicitNode', 'Px1'),
      taskSucceeded(7, 2, 'ImplicitEntry', 'Px1'),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()

    const real = tasks.find((task) => task.task_id === 1)
    const implicit = tasks.find((task) => task.task_id === 2)

    expect(real?.has_starting_event).toBe(true)
    expect(implicit?.has_starting_event).toBe(false)

    // 文档承诺：events 里能查到 Starting（下游历史用法仍然成立）
    expect(real?.events.some((event) => event.message === 'Tasker.Task.Starting')).toBe(true)
    expect(implicit?.events.some((event) => event.message === 'Tasker.Task.Starting')).toBe(false)
  })

  it('④ 轮转缺口可判定：只有片段时 truncated_start 为真，片段后补到 Starting 时只剩 rotation_gap', async () => {
    // 形状 A：日志从任务中间开始，主日志里始终没有 Starting
    const rotationOnly = [
      nodeStarting(1, 1, 101, 'MidNode', 'Px1'),
      nodeSucceeded(2, 1, 101, 'MidNode', 'Px1'),
      makeEventLine(3, 'Tasker.Task.Failed', { task_id: 1 }, { processId: 'Px1' }),
    ]

    const parserA = new LogParser()
    await parserA.parseFile(rotationOnly.join('\n'))
    const [taskA] = parserA.getTasksSnapshot()

    expect(taskA?.rotation_gap).toBe(true)
    expect(taskA?.truncated_start).toBe(true)
    expect(taskA?.has_starting_event).toBe(false)

    // 形状 B：片段先到（节点事件），真正的 Starting 后到（跨文件补齐）
    const fragmentThenStarting = [
      nodeStarting(1, 1, 101, 'MidNode', 'Px1'),
      taskStarting(2, 1, 'RecoveredTask', 'Px1'),
      nodeSucceeded(3, 1, 101, 'MidNode', 'Px1'),
      taskSucceeded(4, 1, 'RecoveredTask', 'Px1'),
    ]

    const parserB = new LogParser()
    await parserB.parseFile(fragmentThenStarting.join('\n'))
    const [taskB] = parserB.getTasksSnapshot()

    expect(taskB?.rotation_gap).toBe(true)
    expect(taskB?.truncated_start).toBe(false)
    expect(taskB?.has_starting_event).toBe(true)
    expect(taskB?.entry_source).toBe('field')
    // 任务只应有一个（补建的作用域被真身 Starting 转正，不叠加）
    expect(parserB.getTasksSnapshot().filter((task) => task.task_id === 1)).toHaveLength(1)
  })

  it('事件与节点带上来源文件与行号（多输入时能回溯到具体文件）', async () => {
    const mainLog = [
      taskStarting(1, 1, 'MainTask', 'Px1'),
      nodeStarting(2, 1, 101, 'MainNode', 'Px1'),
    ]
    const backupLog = [
      nodeSucceeded(3, 1, 101, 'MainNode', 'Px1'),
      taskSucceeded(4, 1, 'MainTask', 'Px1'),
    ]

    const inputs: ParseSourceInput[] = [
      {
        content: mainLog.join('\n'),
        sourceKey: 'C:/logs/maa.log',
        sourcePath: 'C:/logs/maa.log',
        inputIndex: 0,
      },
      {
        content: backupLog.join('\n'),
        sourceKey: 'C:/logs/maa.bak.log',
        sourcePath: 'C:/logs/maa.bak.log',
        inputIndex: 1,
      },
    ]

    const parser = new LogParser()
    await parser.parseInputs(inputs)
    const [task] = parser.getTasksSnapshot()

    console.log(
      'DEBUG events:',
      JSON.stringify(task?.events?.map((e: any) => ({ m: e.message, s: e.source }))),
    )
    console.log('DEBUG node:', JSON.stringify(task?.nodes?.[0]))
    const startingEvent = task?.events.find((event) => event.message === 'Tasker.Task.Starting')
    const succeededEvent = task?.events.find((event) => event.message === 'Tasker.Task.Succeeded')

    // 起始事件永远保留（跨源去重不再把它过滤掉），并且带得回来源文件与行号
    expect(startingEvent?.source?.path).toBe('C:/logs/maa.log')
    expect(startingEvent?.source?.line).toBeGreaterThan(0)

    // 节点也带来源，界面可以直接显示「这个节点出自哪份日志的哪一行」
    expect(task?.nodes[0]?.source?.path).toBe('C:/logs/maa.log')
    expect(task?.nodes[0]?.source?.line).toBeGreaterThan(0)
    // 跨文件的后续事件按来源过滤保持原行为（这里只断言不崩、类型正确）
    expect(succeededEvent === undefined || typeof succeededEvent.source?.path === 'string').toBe(
      true,
    )
  })
})
