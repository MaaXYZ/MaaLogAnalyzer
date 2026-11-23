import { describe, expect, it } from 'vitest'
import { analyzeLogSources, iterateTaskDetails, streamTaskDetails } from '../index'
import type { TaskInfo } from '@windsland52/maa-log-kernel'

const makeEventLine = (index: number, message: string, details: Record<string, unknown>): string => {
  const second = Math.floor(index / 1000)
  const millisecond = index % 1000
  return `[2026-04-06 10:00:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const buildLog = (): string =>
  [
    makeEventLine(1, 'Tasker.Task.Starting', { task_id: 1, entry: '任务一', hash: 'h', uuid: 'u' }),
    makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(3, 'Node.Recognition.Starting', {
      task_id: 1,
      reco_id: 42,
      name: '节点A',
      reco_details: { reco_id: 42, algorithm: 'And', box: null, detail: { all: [] } },
    }),
    makeEventLine(4, 'Node.PipelineNode.Succeeded', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(5, 'Tasker.Task.Succeeded', { task_id: 1, entry: '任务一', hash: 'h', uuid: 'u' }),
    makeEventLine(6, 'Tasker.Task.Starting', { task_id: 2, entry: '任务二', hash: 'h2', uuid: 'u2' }),
    makeEventLine(7, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: '节点B' }),
    makeEventLine(8, 'Node.PipelineNode.Failed', { task_id: 2, node_id: 201, name: '节点B' }),
    makeEventLine(9, 'Tasker.Task.Failed', { task_id: 2, entry: '任务二', hash: 'h2', uuid: 'u2' }),
  ].join('\n')

const contentSource = (content: string) => [
  { content, sourceKey: 'maa.log', sourcePath: 'maa.log', inputIndex: 0 },
]

/** 按字符切片模拟分块来源。 */
const chunkedSource = (content: string, size: number) => [
  {
    sourceKey: 'maa.log',
    sourcePath: 'maa.log',
    inputIndex: 0,
    size: content.length,
    loadChunks: async function* () {
      for (let start = 0; start < content.length; start += size) {
        yield content.slice(start, start + size)
      }
    },
  },
]

const stripSkeletonFlags = (tasks: TaskInfo[]) =>
  tasks.map((task) => {
    const { _skeleton: _ignored, ...rest } = task
    return rest
  })

describe('iterateTaskDetails (generator form)', () => {
  it('yields skeletons, event batches, then tasks in order and returns the summary', async () => {
    const log = buildLog()
    const gen = iterateTaskDetails({ sources: chunkedSource(log, 33), eventBatchSize: 4 })
    const kinds: string[] = []
    const streamed: TaskInfo[] = []
    const eventBatches: number[] = []
    let summary: Awaited<ReturnType<typeof iterateTaskDetails>> extends AsyncGenerator<
      never,
      infer TReturn
    >
      ? TReturn
      : never

    while (true) {
      const next = await gen.next()
      if (next.done) {
        summary = next.value
        break
      }
      const item = next.value
      kinds.push(item.type)
      if (item.type === 'skeletons') expect(item.skeletons).toHaveLength(2)
      else if (item.type === 'events') eventBatches.push(item.events.length)
      else streamed.push(item.task)
    }

    const aggregated = await analyzeLogSources({ sources: contentSource(log) })
    expect(kinds[0]).toBe('skeletons')
    expect(kinds.filter((kind) => kind === 'events').length).toBeGreaterThan(1)
    expect(kinds.at(-1)).toBe('task')
    expect(eventBatches.every((size) => size <= 4)).toBe(true)
    expect(summary!.totalEvents).toBe(aggregated.events.length)
    expect(JSON.stringify(stripSkeletonFlags(streamed))).toBe(
      JSON.stringify(stripSkeletonFlags(aggregated.tasks)),
    )
  })

  it('can be closed early without throwing', async () => {
    const gen = iterateTaskDetails({ sources: contentSource(buildLog()) })
    await gen.next()
    await gen.next()
    const closed = await gen.return(undefined as never)
    expect(closed.done).toBe(true)
  })
})

describe('streamTaskDetails', () => {
  it('streams every task detail in execution order and matches the aggregated output', async () => {
    const log = buildLog()
    const streamed: TaskInfo[] = []
    const sources = contentSource(log)

    const summary = await streamTaskDetails({ sources }, ({ skeleton, task }) => {
      expect(skeleton._skeleton).toBe(true)
      expect(skeleton.task_execution_id).toBeTruthy()
      expect(task._skeleton).toBeFalsy()
      expect(task.task_execution_id).toBe(skeleton.task_execution_id)
      streamed.push(task)
    })

    const aggregated = await analyzeLogSources({ sources })

    expect(summary.skeletons).toHaveLength(2)
    expect(streamed).toHaveLength(2)
    expect(summary.skipped).toEqual([])
    expect(summary.totalEvents).toBe(aggregated.events.length)
    expect(summary.warnings).toEqual(aggregated.warnings)

    // 顺序与整树投影一致
    expect(streamed.map((task) => task.entry)).toEqual(
      aggregated.tasks.map((task) => task.entry),
    )
    // 每任务详情与整树投影逐字段一致（骨架标志除外）
    expect(JSON.stringify(stripSkeletonFlags(streamed))).toBe(
      JSON.stringify(stripSkeletonFlags(aggregated.tasks)),
    )
    // 骨架的顺序/身份与详情一致
    expect(summary.skeletons.map((task) => task.task_execution_id)).toEqual(
      streamed.map((task) => task.task_execution_id),
    )
  })

  it('supports chunked sources without changing the result', async () => {
    const log = buildLog()
    const fromChunks: TaskInfo[] = []
    const summary = await streamTaskDetails({ sources: chunkedSource(log, 37) }, ({ task }) => {
      fromChunks.push(task)
    })

    const aggregated = await analyzeLogSources({ sources: contentSource(log) })

    expect(summary.skeletons).toHaveLength(2)
    expect(summary.skipped).toEqual([])
    expect(JSON.stringify(stripSkeletonFlags(fromChunks))).toBe(
      JSON.stringify(stripSkeletonFlags(aggregated.tasks)),
    )
  })

  it('streams the full event list in batches (task.events is only a subset)', async () => {
    const log = buildLog().replaceAll('task_id":1', 'task_id":11')
    const batches: number[] = []
    const streamedEvents: unknown[] = []
    const summary = await streamTaskDetails(
      {
        sources: contentSource(log),
        eventBatchSize: 2,
        onEvents: (batch) => {
          batches.push(batch.length)
          streamedEvents.push(...batch)
        },
      },
      () => {},
    )

    const aggregated = await analyzeLogSources({ sources: contentSource(log) })
    expect(summary.totalEvents).toBe(aggregated.events.length)
    expect(summary.taskEventCount).toBeLessThanOrEqual(summary.totalEvents)
    // 每批不大于 batchSize，只有最后一批可能更少
    for (const size of batches) expect(size).toBeLessThanOrEqual(2)
    expect(streamedEvents).toHaveLength(aggregated.events.length)
    expect(JSON.stringify(streamedEvents)).toBe(JSON.stringify(aggregated.events))
  })

  it('taps raw text chunks during the same parse for line-level scanners', async () => {
    const log = buildLog()
    const chunks: string[] = []
    const order: string[] = []
    const summary = await streamTaskDetails(
      {
        sources: chunkedSource(log, 31),
        onChunk: ({ chunk }) => {
          chunks.push(chunk)
          order.push('chunk')
        },
      },
      () => order.push('task'),
    )

    expect(chunks.join('')).toBe(log)
    expect(order[0]).toBe('chunk')
    expect(order.at(-1)).toBe('task')
    expect(summary.skeletons).toHaveLength(2)

    // 整段内容来源也应走同一条钩子（单块）
    const whole: string[] = []
    await streamTaskDetails(
      {
        sources: contentSource(log),
        onChunk: ({ chunk }) => {
          whole.push(chunk)
        },
      },
      () => {},
    )
    expect(whole.join('')).toBe(log)
  })

  it('reports parse progress and includes task events in each detail', async () => {
    const log = buildLog()
    const progress: number[] = []
    const eventCounts: number[] = []
    const summary = await streamTaskDetails(
      {
        sources: contentSource(log),
        onProgress: (value) => progress.push(value.percentage),
      },
      ({ task }) => {
        eventCounts.push(task.events.length)
        for (const event of task.events) expect(event.timestamp).toBeTruthy()
      },
    )

    expect(progress.at(-1)).toBe(100)
    expect(eventCounts).toEqual([5, 4])
    expect(summary.totalEvents).toBe(9)
    expect(summary.taskEventCount).toBe(9)
    expect(summary.meta.schemaVersion).toBeTruthy()
    expect(summary.meta.parserVersion).toBeTruthy()
  })
})
