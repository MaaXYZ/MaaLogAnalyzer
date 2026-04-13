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
  makeEventLine(1, 'Tasker.Task.Starting', { task_id: 1, entry: 'MainTask', hash: 'hash-1', uuid: 'uuid-1' }),
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
  makeEventLine(6, 'Tasker.Task.Succeeded', { task_id: 1, entry: 'MainTask', hash: 'hash-1', uuid: 'uuid-1' }),
].join('\n')

describe('LogParser multi-source parsing', () => {
  it('captures source refs and raw lines across multiple inputs', async () => {
    const parser = new LogParser()

    await parser.parseInputs([
      { content: sourceAContent, sourceKey: 'a.log' },
      { content: sourceBContent, sourceKey: 'b.log' },
    ], undefined, {
      storeRawLines: true,
    })

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
    expect(artifacts.rawLines?.sources.get('b.log')?.lines[1]).toContain('Node.PipelineNode.Succeeded')
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
})
