import { describe, expect, it } from 'vitest'
import type { ParseSourceInput } from '../core/logParser'
import { LogParser } from '../core/logParser'
import type { TaskInfo, TaskSummary } from '../shared/types'

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

const resourceLoading = (eventIndex: number, resId: number, path: string, phase: 'Starting' | 'Succeeded') =>
  makeEventLine(eventIndex, `Resource.Loading.${phase}`, {
    res_id: resId,
    path,
    type: 'image',
    hash: `hash-${resId}`,
  })

const taskStarting = (eventIndex: number, taskId: number, entry: string, processId?: string) =>
  makeEventLine(
    eventIndex,
    'Tasker.Task.Starting',
    { task_id: taskId, entry, hash: 'h', uuid: 'u' },
    { processId },
  )

const taskSucceeded = (eventIndex: number, taskId: number, entry: string, processId?: string) =>
  makeEventLine(
    eventIndex,
    'Tasker.Task.Succeeded',
    { task_id: taskId, entry, hash: 'h', uuid: 'u' },
    { processId },
  )

const taskFailed = (eventIndex: number, taskId: number, entry: string, processId?: string) =>
  makeEventLine(
    eventIndex,
    'Tasker.Task.Failed',
    { task_id: taskId, entry, hash: 'h', uuid: 'u' },
    { processId },
  )

const nodeStarting = (eventIndex: number, taskId: number, nodeId: number, name: string) =>
  makeEventLine(eventIndex, 'Node.PipelineNode.Starting', { task_id: taskId, node_id: nodeId, name })

const nodeSucceeded = (eventIndex: number, taskId: number, nodeId: number, name: string) =>
  makeEventLine(eventIndex, 'Node.PipelineNode.Succeeded', { task_id: taskId, node_id: nodeId, name })

const toExpectedSummary = (task: TaskInfo): Omit<TaskSummary, 'task_execution_id'> => ({
  task_id: task.task_id,
  entry: task.entry,
  entry_source: task.entry_source,
  process_id: task.process_id,
  process_ids: task.process_ids,
  has_starting_event: task.has_starting_event,
  rotation_gap: task.rotation_gap,
  truncated_start: task.truncated_start,
  start_time: task.start_time,
  end_time: task.end_time,
  status: task.status,
  duration: task.duration,
  node_count: task.nodes.length,
})

const makeMultiTaskLog = (): string =>
  [
    resourceLoading(1, 501, 'resource/base/image.png', 'Starting'),
    resourceLoading(2, 501, 'resource/base/image.png', 'Succeeded'),
    taskStarting(3, 1, 'MainTask'),
    nodeStarting(4, 1, 101, 'MainNode'),
    nodeSucceeded(5, 1, 101, 'MainNode'),
    nodeStarting(6, 1, 102, 'SecondNode'),
    nodeSucceeded(7, 1, 102, 'SecondNode'),
    taskSucceeded(8, 1, 'MainTask'),
    taskStarting(9, 2, 'FailingTask'),
    nodeStarting(10, 2, 201, 'FailNode'),
    nodeStarting(11, 2, 202, 'SecondFailNode'),
    taskFailed(12, 2, 'FailingTask'),
  ].join('\n')

describe('getTaskSummaries', () => {
  it('returns the same task set, order and task-level fields as the full projection', async () => {
    const parser = new LogParser()
    await parser.parseFile(makeMultiTaskLog())

    const tasks = parser.getTasksSnapshot()
    const summaries = parser.getTaskSummaries()

    expect(tasks.length).toBeGreaterThan(1)
    expect(summaries.map((summary) => summary.entry)).toEqual(tasks.map((task) => task.entry))
    expect(summaries.map((summary) => summary.task_id)).toEqual(tasks.map((task) => task.task_id))
    summaries.forEach((summary, index) => {
      expect(summary).toMatchObject(toExpectedSummary(tasks[index]!))
    })
  })

  it('keeps node_count aligned with the projected node list', async () => {
    const parser = new LogParser()
    await parser.parseFile(makeMultiTaskLog())

    const tasks = parser.getTasksSnapshot()
    const summaries = parser.getTaskSummaries()

    for (const summary of summaries) {
      const task = tasks.find(
        (candidate) =>
          candidate.task_id === summary.task_id && candidate.start_time === summary.start_time,
      )
      expect(task).toBeDefined()
      expect(summary.node_count).toBe(task!.nodes.length)
    }
  })

  it('includes the root resource pseudo task and keeps it first', async () => {
    const parser = new LogParser()
    await parser.parseFile(makeMultiTaskLog())

    const summaries = parser.getTaskSummaries()
    expect(summaries[0]).toMatchObject({
      task_id: 0,
      entry: '[Global] Resource.Loading',
      status: 'succeeded',
      node_count: 1,
    })
  })

  it('drops MaaTaskerPostStop tasks like the full projection does', async () => {
    const log = [
      taskStarting(1, 1, 'MainTask'),
      nodeStarting(2, 1, 101, 'MainNode'),
      nodeSucceeded(3, 1, 101, 'MainNode'),
      taskSucceeded(4, 1, 'MainTask'),
      taskStarting(5, 2, 'MaaTaskerPostStop'),
      taskSucceeded(6, 2, 'MaaTaskerPostStop'),
    ].join('\n')

    const parser = new LogParser()
    await parser.parseFile(log)

    expect(parser.getTasksSnapshot().map((task) => task.entry)).not.toContain('MaaTaskerPostStop')
    expect(parser.getTaskSummaries().map((summary) => summary.entry)).not.toContain(
      'MaaTaskerPostStop',
    )
  })

  it('keeps reused task_id apart across processes', async () => {
    const log = [
      taskStarting(1, 200000001, 'FirstTask', 'Px100'),
      nodeStarting(2, 200000001, 101, 'FirstNode'),
      nodeSucceeded(3, 200000001, 101, 'FirstNode'),
      taskSucceeded(4, 200000001, 'FirstTask', 'Px100'),
      taskStarting(5, 200000001, 'SecondTask', 'Px200'),
      nodeStarting(6, 200000001, 201, 'SecondNode'),
      nodeSucceeded(7, 200000001, 201, 'SecondNode'),
      taskSucceeded(8, 200000001, 'SecondTask', 'Px200'),
    ].join('\n')

    const parser = new LogParser()
    await parser.parseFile(log)

    const summaries = parser.getTaskSummaries()
    expect(summaries).toHaveLength(2)
    expect(summaries.map((summary) => summary.task_id)).toEqual([200000001, 200000001])
    expect(summaries.map((summary) => summary.process_id)).toEqual(['Px100', 'Px200'])
    expect(new Set(summaries.map((summary) => summary.start_time)).size).toBe(2)
  })

  it('reports partial task lists through onInputParsed at each segment boundary', async () => {
    const firstSegment = [
      taskStarting(1, 1, 'FirstSegmentTask'),
      nodeStarting(2, 1, 101, 'NodeA'),
      nodeSucceeded(3, 1, 101, 'NodeA'),
      taskSucceeded(4, 1, 'FirstSegmentTask'),
    ].join('\n')
    const secondSegment = [
      taskStarting(1, 2, 'SecondSegmentTask'),
      nodeStarting(2, 2, 201, 'NodeB'),
      nodeSucceeded(3, 2, 201, 'NodeB'),
      taskSucceeded(4, 2, 'SecondSegmentTask'),
    ].join('\n')
    const inputs: ParseSourceInput[] = [
      { content: firstSegment, sourceKey: 'seg-1', inputIndex: 0 },
      { content: secondSegment, sourceKey: 'seg-2', inputIndex: 1 },
    ]

    const parser = new LogParser()
    const snapshots: Array<{ index: number; entries: string[] }> = []
    await parser.parseInputs(inputs, undefined, {
      onInputParsed: ({ index }) => {
        snapshots.push({
          index,
          entries: parser.getTaskSummaries().map((summary) => summary.entry),
        })
      },
    })

    expect(snapshots.map((snapshot) => snapshot.index)).toEqual([0, 1])
    expect(snapshots[0]!.entries).toEqual(['FirstSegmentTask'])
    expect(snapshots[1]!.entries).toEqual(['FirstSegmentTask', 'SecondSegmentTask'])
    expect(parser.getTaskSummaries().map((summary) => summary.entry)).toEqual([
      'FirstSegmentTask',
      'SecondSegmentTask',
    ])
  })

  it('does not let a throwing onInputParsed callback abort the parse', async () => {
    const parser = new LogParser()
    const warn = console.warn
    console.warn = () => {}
    try {
      await parser.parseInputs(
        [{ content: makeMultiTaskLog(), sourceKey: 'seg-1' }],
        undefined,
        {
          onInputParsed: () => {
            throw new Error('ui blew up')
          },
        },
      )
    } finally {
      console.warn = warn
    }
    expect(parser.getTaskSummaries().length).toBeGreaterThan(0)
  })
})
