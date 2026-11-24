import { describe, expect, it } from 'vitest'
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
): string =>
  `[${formatTimestamp(eventIndex)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`

const buildLog = (): string =>
  [
    makeEventLine(1, 'Tasker.Task.Starting', {
      task_id: 1,
      entry: '主任务🎯',
      hash: 'h',
      uuid: 'u',
    }),
    makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(3, 'Node.Recognition.Starting', {
      task_id: 1,
      reco_id: 42,
      name: '节点A',
      reco_details: {
        reco_id: 42,
        algorithm: 'And',
        box: null,
        name: 'SharedReco',
        detail: { all: [{ box: [0, 0, 1, 1], score: 0.9 }] },
      },
    }),
    makeEventLine(4, 'Node.Recognition.Succeeded', {
      task_id: 1,
      reco_id: 42,
      name: '节点A',
      reco_details: {
        reco_id: 42,
        algorithm: 'And',
        box: null,
        name: 'SharedReco',
        detail: { all: [{ box: [0, 0, 1, 1], score: 0.9 }] },
      },
    }),
    makeEventLine(5, 'Node.PipelineNode.Succeeded', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(6, 'Tasker.Task.Succeeded', {
      task_id: 1,
      entry: '主任务🎯',
      hash: 'h',
      uuid: 'u',
    }),
    makeEventLine(7, 'Tasker.Task.Starting', {
      task_id: 2,
      entry: 'Second',
      hash: 'h2',
      uuid: 'u2',
    }),
    makeEventLine(8, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: 'N2' }),
    makeEventLine(9, 'Node.PipelineNode.Failed', { task_id: 2, node_id: 201, name: 'N2' }),
    makeEventLine(10, 'Tasker.Task.Failed', {
      task_id: 2,
      entry: 'Second',
      hash: 'h2',
      uuid: 'u2',
    }),
  ].join('\n')

/** 按固定字符数切块；块边界会落在行中间、多字节字符之间也照样合法（块是字符串）。 */
const chunkify = async function* (text: string, chunkSize: number): AsyncIterable<string> {
  const size = Math.max(1, Math.floor(chunkSize))
  for (let start = 0; start < text.length; start += size) {
    yield text.slice(start, start + size)
  }
}

const parseWhole = async (content: string) => {
  // 与 chunked 路径使用同一套 source 元数据，否则比较会被 source 字段本身的差异干扰
  const parser = new LogParser()
  await parser.parseInputs([
    {
      content,
      sourceKey: 'chunked.log',
      sourcePath: 'chunked.log',
      inputIndex: 0,
    },
  ])
  return parser
}

const parseChunked = async (content: string, chunkSize: number) => {
  const parser = new LogParser()
  await parser.parseInputs([
    {
      size: content.length,
      sourceKey: 'chunked.log',
      sourcePath: 'chunked.log',
      inputIndex: 0,
      loadChunks: () => chunkify(content, chunkSize),
    } as never,
  ])
  return parser
}

const snapshot = (parser: LogParser) =>
  JSON.stringify({
    tasks: parser.getTasksSnapshot(),
    events: parser.getEventsSnapshot(),
  })

describe('chunked source input', () => {
  for (const chunkSize of [1, 7, 64, 1000]) {
    it(`matches whole-content parse when chunked at ${chunkSize} chars`, async () => {
      const content = buildLog()
      const whole = await parseWhole(content)
      const chunked = await parseChunked(content, chunkSize)
      expect(snapshot(chunked)).toBe(snapshot(whole))
    })
  }

  it('keeps task events attributed to the right source and line numbers', async () => {
    const content = buildLog()
    const chunked = await parseChunked(content, 13)
    const tasks = chunked.getTasksSnapshot()
    expect(tasks.map((task) => task.entry)).toEqual(['主任务🎯', 'Second'])
    expect(tasks[0]?.events[0]?.source?.line).toBe(1)
    const firstTaskEvents = tasks[0]?.events ?? []
    expect(firstTaskEvents[firstTaskEvents.length - 1]?.source?.line).toBe(6)
    expect(tasks[1]?.events[0]?.source?.line).toBe(7)
    const secondTaskEvents = tasks[1]?.events ?? []
    expect(secondTaskEvents[secondTaskEvents.length - 1]?.source?.line).toBe(10)
  })

  it('handles empty chunk streams and empty lines', async () => {
    const parser = new LogParser()
    await parser.parseInputs([
      { size: 0, sourceKey: 'empty', loadChunks: () => chunkify('', 10) } as never,
    ])
    expect(parser.getTasksSnapshot()).toHaveLength(0)

    const withBlankLines = '\n\n' + buildLog() + '\n\n'
    const whole = await parseWhole(withBlankLines)
    const chunked = await parseChunked(withBlankLines, 5)
    expect(snapshot(chunked)).toBe(snapshot(whole))
  })

  it('mixes chunked and whole inputs in one batch', async () => {
    const first = buildLog()
    const second = buildLog().split('task_id":1').join('task_id":11')
    const whole = new LogParser()
    await whole.parseInputs([
      { content: first, sourceKey: 'a.log', sourcePath: 'a.log', inputIndex: 0 },
      { content: second, sourceKey: 'b.log', sourcePath: 'b.log', inputIndex: 1 },
    ])

    const mixed = new LogParser()
    await mixed.parseInputs([
      {
        size: first.length,
        sourceKey: 'a.log',
        sourcePath: 'a.log',
        inputIndex: 0,
        loadChunks: () => chunkify(first, 100),
      } as never,
      { content: second, sourceKey: 'b.log', sourcePath: 'b.log', inputIndex: 1 },
    ])

    expect(snapshot(mixed)).toBe(snapshot(whole))
  })
})
