import { describe, expect, it } from 'vitest'
import { LogParser } from '../core/logParser'
import { createAnalyzerToolHandlers } from '../service/toolHandlers'

const formatTimestamp = (eventIndex: number): string => {
  const second = Math.floor(eventIndex / 1000)
  const millisecond = eventIndex % 1000
  return `2026-04-14 10:00:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}`
}

const makeEventLine = (
  eventIndex: number,
  message: string,
  details: Record<string, unknown>,
): string => {
  return `[${formatTimestamp(eventIndex)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const sourceAContent = [
  makeEventLine(1, 'Tasker.Task.Starting', {
    task_id: 1,
    entry: 'MainTask',
    hash: 'hash-1',
    uuid: 'uuid-1',
  }),
  makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: 'MainNode' }),
  makeEventLine(3, 'Node.NextList.Starting', {
    task_id: 1,
    name: 'MainNode',
    list: [{ name: 'CandidateA', anchor: true, jump_back: false }],
  }),
].join('\n')

const sourceBContent = [
  makeEventLine(4, 'Node.NextList.Succeeded', {
    task_id: 1,
    name: 'MainNode',
    list: [{ name: 'CandidateA', anchor: true, jump_back: false }],
  }),
  makeEventLine(5, 'Node.PipelineNode.Succeeded', { task_id: 1, node_id: 101, name: 'MainNode' }),
  makeEventLine(6, 'Tasker.Task.Succeeded', {
    task_id: 1,
    entry: 'MainTask',
    hash: 'hash-1',
    uuid: 'uuid-1',
  }),
].join('\n')

describe('LogParser multi-source parsing', () => {
  it('captures source refs and raw lines across multiple inputs', async () => {
    const parser = new LogParser()

    await parser.parseInputs(
      [
        { content: sourceAContent, sourceKey: 'a.log' },
        { content: sourceBContent, sourceKey: 'b.log' },
      ],
      undefined,
      {
        storeRawLines: true,
      },
    )

    const artifacts = parser.getParseArtifactsSnapshot()
    expect(artifacts.events).toHaveLength(6)
    expect(artifacts.events[0]?.source).toMatchObject({
      sourceKey: 'a.log',
      inputIndex: 0,
      line: 1,
    })
    expect(artifacts.events[5]?.source).toMatchObject({
      sourceKey: 'b.log',
      inputIndex: 1,
      line: 3,
    })
    expect(artifacts.rawLines?.sources.get('a.log')?.lines).toHaveLength(3)
    expect(artifacts.rawLines?.sources.get('b.log')?.lines[1]).toContain(
      'Node.PipelineNode.Succeeded',
    )
  })

  it('assigns deterministic unique keys when source keys collide', async () => {
    const parser = new LogParser()

    await parser.parseInputs(
      [
        { content: sourceAContent, sourceKey: 'duplicate.log' },
        { content: sourceBContent, sourceKey: 'duplicate.log' },
        { content: '', sourceKey: 'duplicate.log#2' },
        { content: '', sourceKey: '', sourcePath: 'fallback.log' },
      ],
      undefined,
      {
        storeRawLines: true,
      },
    )

    const artifacts = parser.getParseArtifactsSnapshot()
    expect(artifacts.events[0]?.source.sourceKey).toBe('duplicate.log')
    expect(artifacts.events[5]?.source.sourceKey).toBe('duplicate.log#3')
    expect([...artifacts.rawLines!.sources.keys()]).toEqual([
      'duplicate.log',
      'duplicate.log#3',
      'duplicate.log#2',
      'fallback.log',
    ])
  })
})

describe('Analyzer tool handlers', () => {
  it('supports session queries over timeline, next list, parent chain, and raw lines', async () => {
    const handlers = createAnalyzerToolHandlers({
      async resolve_input(input) {
        if (input.path === '/logs/a.log') {
          return { content: sourceAContent, source_key: 'a.log', source_path: '/logs/a.log' }
        }
        if (input.path === '/logs/b.log') {
          return { content: sourceBContent, source_key: 'b.log', source_path: '/logs/b.log' }
        }
        return null
      },
    })

    const parsed = await handlers.parse_log_bundle({
      session_id: 's-1',
      inputs: [
        { path: '/logs/a.log', kind: 'file' },
        { path: '/logs/b.log', kind: 'file' },
      ],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data).toMatchObject({
      session_id: 's-1',
      task_count: 1,
      event_count: 6,
    })

    const overview = await handlers.get_task_overview({
      session_id: 's-1',
      task_id: 1,
    })
    expect(overview.ok).toBe(true)
    if (overview.ok) {
      expect(overview.data.task).toMatchObject({
        task_id: 1,
        entry: 'MainTask',
        status: 'success',
      })
      expect(overview.data.summary.node_count).toBe(1)
    }

    const timeline = await handlers.get_node_timeline({
      session_id: 's-1',
      task_id: 1,
      node_id: 101,
    })
    expect(timeline.ok).toBe(true)
    if (timeline.ok) {
      expect(timeline.data.timeline).toHaveLength(4)
      expect(timeline.data.timeline[0]).toMatchObject({
        scope_id: 'pipeline_node:1:101:seq2',
        occurrence_index: 1,
        source_key: 'a.log',
        line: 2,
      })
    }

    const history = await handlers.get_next_list_history({
      session_id: 's-1',
      task_id: 1,
      node_id: 101,
    })
    expect(history.ok).toBe(true)
    if (history.ok) {
      expect(history.data.history).toHaveLength(1)
      expect(history.data.history[0]).toMatchObject({
        scope_id: 'next_list:1:0:seq3',
        occurrence_index: 1,
        outcome: 'succeeded',
      })
      expect(history.data.history[0]?.candidates[0]).toMatchObject({
        name: 'CandidateA',
        anchor: true,
        jump_back: false,
      })
    }

    const parentChain = await handlers.get_parent_chain({
      session_id: 's-1',
      task_id: 1,
      node_id: 101,
    })
    expect(parentChain.ok).toBe(true)
    if (parentChain.ok) {
      expect(parentChain.data.chain).toEqual([
        {
          scope_id: 'pipeline_node:1:101:seq2',
          scope_kind: 'pipeline_node',
          task_id: 1,
          node_id: 101,
          name: 'MainNode',
          occurrence_index: 1,
          relation: 'self',
        },
        {
          scope_id: 'task:1:1:seq1',
          scope_kind: 'task',
          task_id: 1,
          node_id: undefined,
          name: 'MainTask',
          occurrence_index: undefined,
          relation: 'parent',
        },
      ])
    }

    const rawLines = await handlers.get_raw_lines({
      session_id: 's-1',
      task_id: 1,
    })
    expect(rawLines.ok).toBe(true)
    if (rawLines.ok) {
      expect(rawLines.data.lines).toHaveLength(6)
      expect(rawLines.data.lines[0]).toMatchObject({
        source_key: 'a.log',
        line: 1,
      })
      expect(rawLines.data.lines[5]).toMatchObject({
        source_key: 'b.log',
        line: 3,
      })
    }
  })

  it('requires an execution selector when a task id is reused', async () => {
    const repeatedTaskContent = [
      makeEventLine(1, 'Tasker.Task.Starting', {
        task_id: 7,
        entry: 'First',
        hash: 'h1',
        uuid: 'u1',
      }),
      makeEventLine(2, 'Node.PipelineNode.Starting', {
        task_id: 7,
        node_id: 701,
        name: 'FirstNode',
      }),
      makeEventLine(3, 'Node.PipelineNode.Failed', { task_id: 7, node_id: 701, name: 'FirstNode' }),
      makeEventLine(4, 'Tasker.Task.Failed', {
        task_id: 7,
        entry: 'First',
        hash: 'h1',
        uuid: 'u1',
      }),
      makeEventLine(5, 'Tasker.Task.Starting', {
        task_id: 7,
        entry: 'Retry',
        hash: 'h2',
        uuid: 'u2',
      }),
      makeEventLine(6, 'Node.PipelineNode.Starting', {
        task_id: 7,
        node_id: 702,
        name: 'RetryNode',
      }),
      makeEventLine(7, 'Node.PipelineNode.Succeeded', {
        task_id: 7,
        node_id: 702,
        name: 'RetryNode',
      }),
      makeEventLine(8, 'Tasker.Task.Succeeded', {
        task_id: 7,
        entry: 'Retry',
        hash: 'h2',
        uuid: 'u2',
      }),
    ].join('\n')
    const handlers = createAnalyzerToolHandlers({
      async resolve_input() {
        return { content: repeatedTaskContent, source_key: 'repeated.log' }
      },
    })
    await handlers.parse_log_bundle({
      session_id: 's-repeated-task',
      inputs: [{ path: '/logs/repeated.log', kind: 'file' }],
    })

    const ambiguous = await handlers.get_task_overview({
      session_id: 's-repeated-task',
      task_id: 7,
    })
    expect(ambiguous.ok).toBe(false)
    if (!ambiguous.ok) {
      expect(ambiguous.error.code).toBe('AMBIGUOUS_SCOPE_SELECTOR')
    }

    const retry = await handlers.get_task_overview({
      session_id: 's-repeated-task',
      task_id: 7,
      occurrence_index: 2,
    })
    expect(retry.ok).toBe(true)
    if (retry.ok) {
      expect(retry.data.task).toMatchObject({
        task_id: 7,
        entry: 'Retry',
        status: 'success',
        duration_ms: 3,
        occurrence_index: 2,
      })
      expect(retry.data.summary).toEqual({
        node_count: 1,
        failed_node_count: 0,
        reco_failed_count: 0,
      })
    }
  })

  it('keeps every resolved source when metadata is omitted', async () => {
    const handlers = createAnalyzerToolHandlers({
      async resolve_input() {
        return [{ content: sourceAContent }, { content: sourceBContent }]
      },
    })

    const parsed = await handlers.parse_log_bundle({
      session_id: 's-duplicate-source',
      inputs: [{ path: '/logs/debug', kind: 'folder' }],
    })
    expect(parsed.ok).toBe(true)

    const session = handlers.store.get('s-duplicate-source')
    expect(session?.artifacts.events[0]?.source.sourceKey).toBe('/logs/debug')
    expect(session?.artifacts.events[5]?.source.sourceKey).toBe('/logs/debug#2')
    expect([...session!.artifacts.rawLines!.sources.keys()]).toEqual([
      '/logs/debug',
      '/logs/debug#2',
    ])

    const rawLines = await handlers.get_raw_lines({
      session_id: 's-duplicate-source',
      task_id: 1,
    })
    expect(rawLines.ok).toBe(true)
    if (rawLines.ok) {
      expect(rawLines.data.lines).toHaveLength(6)
      expect(new Set(rawLines.data.lines.map((line) => line.source_key))).toEqual(
        new Set(['/logs/debug', '/logs/debug#2']),
      )
    }
  })

  it('passes focus selectors through parse_log_bundle inputs to the resolver', async () => {
    const captured: unknown[] = []
    const handlers = createAnalyzerToolHandlers({
      async resolve_input(input) {
        captured.push(input.focus ?? null)
        return { content: sourceAContent, source_key: 'focused.log', source_path: input.path }
      },
    })

    const parsed = await handlers.parse_log_bundle({
      session_id: 's-focus',
      inputs: [
        {
          path: '/logs/focused',
          kind: 'folder',
          focus: {
            keywords: ['MainTask'],
            started_after: '2026-04-14 10:00:00',
          },
        },
      ],
    })

    expect(parsed.ok).toBe(true)
    expect(captured).toEqual([
      {
        keywords: ['MainTask'],
        started_after: '2026-04-14 10:00:00',
      },
    ])
  })

  it('returns projector-linked image evidences for task and node queries', async () => {
    const failedContent = [
      makeEventLine(1, 'Tasker.Task.Starting', {
        task_id: 7,
        entry: 'FailedTask',
        hash: 'hash-7',
        uuid: 'uuid-7',
      }),
      makeEventLine(2, 'Node.PipelineNode.Starting', {
        task_id: 7,
        node_id: 701,
        name: 'FailedNode',
      }),
      makeEventLine(3, 'Node.Recognition.Starting', {
        task_id: 7,
        reco_id: 1701,
        name: 'RecoNode',
      }),
      makeEventLine(4, 'Node.Recognition.Succeeded', {
        task_id: 7,
        reco_id: 1701,
        name: 'RecoNode',
        reco_details: {
          reco_id: 1701,
          algorithm: 'DirectHit',
          box: [0, 0, 10, 10],
          detail: null,
          name: 'RecoNode',
        },
      }),
      makeEventLine(5, 'Node.Action.Starting', { task_id: 7, action_id: 2701, name: 'RecoNode' }),
      makeEventLine(6, 'Node.Action.Failed', {
        task_id: 7,
        action_id: 2701,
        name: 'RecoNode',
        action_details: {
          action_id: 2701,
          action: 'Click',
          box: [0, 0, 10, 10],
          detail: {},
          name: 'RecoNode',
          success: false,
        },
      }),
      makeEventLine(7, 'Node.PipelineNode.Failed', {
        task_id: 7,
        node_id: 701,
        name: 'FailedNode',
        reco_details: {
          reco_id: 1701,
          algorithm: 'DirectHit',
          box: [0, 0, 10, 10],
          detail: null,
          name: 'RecoNode',
        },
        node_details: {
          action_id: 2701,
          completed: false,
          name: 'RecoNode',
          node_id: 701,
          reco_id: 1701,
        },
      }),
      makeEventLine(8, 'Tasker.Task.Succeeded', {
        task_id: 7,
        entry: 'FailedTask',
        hash: 'hash-7',
        uuid: 'uuid-7',
      }),
    ].join('\n')

    const handlers = createAnalyzerToolHandlers({
      async resolve_input() {
        return { content: failedContent, source_key: 'failed.log', source_path: '/logs/failed.log' }
      },
      create_parser() {
        const parser = new LogParser()
        parser.setErrorImages(
          new Map([['2026.04.14-10.00.00.007_FailedNode', '/images/failed-node.png']]),
        )
        parser.setVisionImages(
          new Map([['2026.04.14-10.00.00.004_RecoNode_1701', '/images/reco-vision.png']]),
        )
        return parser
      },
    })

    const parsed = await handlers.parse_log_bundle({
      session_id: 's-images',
      inputs: [{ path: '/logs/failed.log', kind: 'file' }],
    })
    expect(parsed.ok).toBe(true)

    const timeline = await handlers.get_node_timeline({
      session_id: 's-images',
      task_id: 7,
      node_id: 701,
    })
    expect(timeline.ok).toBe(true)
    if (timeline.ok) {
      expect(
        timeline.data.evidences.some(
          (item) => item.payload.image_path === '/images/failed-node.png',
        ),
      ).toBe(true)
      expect(
        timeline.data.evidences.some(
          (item) => item.payload.image_path === '/images/reco-vision.png',
        ),
      ).toBe(true)
    }
  })

  it('rejects limits that are not non-negative safe integers', async () => {
    const handlers = createAnalyzerToolHandlers()

    for (const limit of [1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const result = await handlers.get_node_timeline({
        session_id: 'missing',
        task_id: 1,
        node_id: 101,
        limit,
      })

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'limit must be a non-negative safe integer',
        },
      })
    }
  })
})
