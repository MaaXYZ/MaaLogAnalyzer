import { describe, expect, it } from 'vitest'
import { LogParser } from '../core/logParser'
import { parseEventLine } from '../event/line'

const identity = (value: string) => value

describe('EventLine', () => {
  it('parses valid OnEventNotify line with normalized timestamp and dedup signature', () => {
    const line =
      '[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":1,"entry":"Main"}]'
    const parsed = parseEventLine(line, 10, {
      internEventToken: identity,
      forceCopyString: identity,
    })

    expect(parsed).toBeTruthy()
    expect(parsed?.timestamp).toBe('2026-04-08 00:01:02.345')
    expect(parsed?._lineNumber).toBe(10)
    expect(parsed?.processId).toBe('Px1')
    expect(parsed?.threadId).toBe('Tx2')
    expect(parsed?.message).toBe('Tasker.Task.Starting')
    expect(parsed?.details.task_id).toBe(1)
    expect(parsed?._dedupSignature.startsWith('Tasker.Task.Starting|')).toBe(true)
  })

  it('returns null for non-event line or malformed details json', () => {
    const nonEvent = parseEventLine('plain line', 1, {
      internEventToken: identity,
      forceCopyString: identity,
    })
    expect(nonEvent).toBeNull()

    const malformed = parseEventLine(
      '[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={bad-json}]',
      2,
      {
        internEventToken: identity,
        forceCopyString: identity,
      },
    )
    expect(malformed).toBeNull()
  })

  it.each(['null', '[]', '42', 'true', '"text"'])(
    'returns null when details is not an object: %s',
    (details) => {
      const parsed = parseEventLine(
        `[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details=${details}]`,
        3,
        {
          internEventToken: identity,
          forceCopyString: identity,
        },
      )

      expect(parsed).toBeNull()
    },
  )

  it('skips invalid details without partially committing an event', async () => {
    const lines = [
      '[2026-04-08 00:01:02.001][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":1,"entry":"Main"}]',
      '[2026-04-08 00:01:02.002][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Node.PipelineNode.Starting] [details=null]',
      '[2026-04-08 00:01:02.003][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Succeeded] [details={"task_id":1,"entry":"Main"}]',
    ]
    const parser = new LogParser()

    await parser.parseFile(lines.join('\n'), undefined, { yieldControl: null })

    expect(parser.getEventsSnapshot().map((event) => event.message)).toEqual([
      'Tasker.Task.Starting',
      'Tasker.Task.Succeeded',
    ])
    expect(parser.getProtocolEventsSnapshot()).toHaveLength(2)
    expect(parser.getTasksSnapshot()).toMatchObject([
      { task_id: 1, status: 'succeeded', nodes: [] },
    ])
  })
})

describe('realtime dedup retention', () => {
  type BucketProbe = {
    recentEventsBySignature: Map<string, Map<string, { timestamps: number[]; head: number }>>
  }

  /** 历史里仍然存活的**出现次数**（不是签名个数）——封顶的是它。 */
  const getRetainedOccurrences = (parser: LogParser): number => {
    let total = 0
    for (const bucket of (parser as unknown as BucketProbe).recentEventsBySignature.values()) {
      for (const log of bucket.values()) total += log.timestamps.length - log.head
    }
    return total
  }

  it('does not retain signatures that have no finite timestamp', () => {
    const parser = new LogParser()
    parser.appendRealtimeLines(
      Array.from(
        { length: 100 },
        (_, index) =>
          `[not-a-timestamp][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":${index + 1},"entry":"Task"}]`,
      ),
    )

    expect(parser.getEventsSnapshot()).toHaveLength(100)
    expect(getRetainedOccurrences(parser)).toBe(0)
  })

  it('bounds retained occurrences even when timestamps do not advance', () => {
    const parser = new LogParser()
    parser.appendRealtimeLines(
      Array.from(
        { length: 16_500 },
        (_, index) =>
          `[2026-07-26 12:00:00.000][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":${index + 1},"entry":"Task"}]`,
      ),
    )

    expect(getRetainedOccurrences(parser)).toBeLessThanOrEqual(16_384)
  })

  it('keeps the cross-source lookup bounded for a hot repeated signature', () => {
    // 单来源下桶里只有自己一个来源，查找必须直接跳过 ——
    // 早期实现每行扫全桶，40 批 × 1000 行的实时追加实测从 ~0.2s 退化到 ~16s。
    // 预算按「固定路径 ~0.3s、退回到逐条扫描 ~16s」定，只用来拦住那一类改动。
    const parser = new LogParser()
    const batches: string[][] = []
    for (let batch = 0; batch < 40; batch += 1) {
      batches.push(
        Array.from(
          { length: 1000 },
          (_, index) =>
            `[2026-07-26 12:00:${String(batch).padStart(2, '0')}.${String(index % 1000).padStart(3, '0')}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Node.NextList.Starting] [details={"task_id":1,"name":"Loop"}]`,
        ),
      )
    }

    const startedAt = performance.now()
    for (const batch of batches) parser.appendRealtimeLines(batch)
    const elapsed = performance.now() - startedAt

    expect(parser.getEventsSnapshot()).toHaveLength(40_000)
    expect(elapsed).toBeLessThan(4000)
  })
})
