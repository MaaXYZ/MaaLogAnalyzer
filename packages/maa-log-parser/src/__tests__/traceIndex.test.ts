import { describe, expect, it } from 'vitest'
import {
  createQueryHelpers,
  findNodeExecution,
  getNextListHistory,
  getNodeTimeline,
} from '../query/helpers'
import { buildTraceIndex } from '../query/traceIndex'
import { createScopeId } from '../trace/scopeId'
import type { ProtocolEvent } from '../protocol/types'
import type { ScopeNode } from '../trace/scopeTypes'

const makeTaskEvent = (seq: number, line: number): ProtocolEvent => ({
  kind: 'task',
  seq,
  ts: `2026-04-08 00:00:0${seq}.000`,
  tsMs: seq,
  processId: 'Px1',
  threadId: 'Tx1',
  source: {
    sourceKey: 'maa.log',
    inputIndex: 0,
    line,
  },
  rawMessage: 'Tasker.Task.Starting',
  phase: 'starting',
  rawDetails: { task_id: 1 },
  taskId: 1,
})

describe('TraceIndex', () => {
  it('builds deterministic scope ids from payload identity', () => {
    expect(createScopeId('pipeline_node', { taskId: 12, nodeId: 38 }, 42)).toBe(
      'pipeline_node:12:38:seq42',
    )
    expect(createScopeId('next_list', { taskId: 12 }, 43)).toBe(
      'next_list:12:0:seq43',
    )
    expect(createScopeId('controller_action', { ctrlId: 7 }, 6)).toBe(
      'controller_action:0:7:seq6',
    )
  })

  it('indexes pipeline executions and resolves parent chain by unique locator', () => {
    const recognition: ScopeNode = {
      id: createScopeId('recognition', { taskId: 1, recoId: 501 }, 5),
      kind: 'recognition',
      status: 'succeeded',
      ts: '2026-04-08 00:00:05.000',
      endTs: '2026-04-08 00:00:05.500',
      seq: 5,
      endSeq: 5,
      taskId: 1,
      payload: { taskId: 1, recoId: 501, name: 'RecoA' },
      children: [],
    }

    const nextList: ScopeNode = {
      id: createScopeId('next_list', { taskId: 1 }, 4),
      kind: 'next_list',
      status: 'succeeded',
      ts: '2026-04-08 00:00:04.000',
      endTs: '2026-04-08 00:00:04.500',
      seq: 4,
      endSeq: 5,
      taskId: 1,
      payload: { taskId: 1, name: 'MainNode' },
      children: [recognition],
    }

    const pipeline1: ScopeNode = {
      id: createScopeId('pipeline_node', { taskId: 1, nodeId: 101 }, 3),
      kind: 'pipeline_node',
      status: 'succeeded',
      ts: '2026-04-08 00:00:03.000',
      endTs: '2026-04-08 00:00:06.000',
      seq: 3,
      endSeq: 6,
      taskId: 1,
      payload: { taskId: 1, nodeId: 101, name: 'MainNode' },
      children: [nextList],
    }

    const pipeline2: ScopeNode = {
      id: createScopeId('pipeline_node', { taskId: 1, nodeId: 101 }, 10),
      kind: 'pipeline_node',
      status: 'failed',
      ts: '2026-04-08 00:00:10.000',
      endTs: '2026-04-08 00:00:12.000',
      seq: 10,
      endSeq: 12,
      taskId: 1,
      payload: { taskId: 1, nodeId: 101, name: 'MainNode' },
      children: [],
    }

    const task: ScopeNode = {
      id: createScopeId('task', { taskId: 1 }, 2),
      kind: 'task',
      status: 'succeeded',
      ts: '2026-04-08 00:00:02.000',
      endTs: '2026-04-08 00:00:12.000',
      seq: 2,
      endSeq: 12,
      taskId: 1,
      payload: { taskId: 1, entry: 'Main' },
      children: [pipeline1, pipeline2],
    }

    const root: ScopeNode = {
      id: createScopeId('trace_root', {}, 1),
      kind: 'trace_root',
      status: 'running',
      ts: '2026-04-08 00:00:01.000',
      seq: 1,
      payload: {},
      children: [task],
    }

    const events: ProtocolEvent[] = [
      makeTaskEvent(3, 30),
      makeTaskEvent(4, 31),
      makeTaskEvent(5, 32),
      makeTaskEvent(6, 33),
      makeTaskEvent(10, 40),
      makeTaskEvent(12, 41),
    ]

    const index = buildTraceIndex(root, events)
    const helpers = createQueryHelpers(index)

    const nodeExecutions = helpers.findNodeExecutions(1, 101)
    expect(nodeExecutions.map((item) => item.occurrenceIndex)).toEqual([1, 2])

    const secondExecution = findNodeExecution(index, {
      taskId: 1,
      nodeId: 101,
      occurrenceIndex: 2,
    })
    expect(secondExecution).toEqual({
      ok: true,
      value: expect.objectContaining({
        pipelineScopeId: pipeline2.id,
        occurrenceIndex: 2,
      }),
    })

    expect(
      helpers.findScopesByLocator({ kind: 'recognition', taskId: 1, localId: 501 })
        .map((scope) => scope.id),
    ).toEqual([recognition.id])

    const chain = helpers.getParentChain({ scopeId: pipeline2.id })
    expect(chain).toEqual({
      ok: true,
      value: [pipeline2, task, root],
    })

    const scopeEvents = helpers.getScopeEvents(pipeline1.id)
    expect(scopeEvents).toEqual({
      ok: true,
      value: events.slice(0, 4),
    })
  })

  it('builds node timeline and next_list history from indexed node executions', () => {
    const recognition: ScopeNode = {
      id: createScopeId('recognition', { taskId: 1, recoId: 501 }, 5),
      kind: 'recognition',
      status: 'succeeded',
      ts: '2026-04-08 00:00:05.000',
      endTs: '2026-04-08 00:00:06.000',
      seq: 5,
      endSeq: 6,
      taskId: 1,
      payload: {
        taskId: 1,
        recoId: 501,
        name: 'RecoA',
        startEvent: {
          kind: 'recognition',
          seq: 5,
          ts: '2026-04-08 00:00:05.000',
          tsMs: 5,
          processId: 'Px1',
          threadId: 'Tx1',
          source: { sourceKey: 'maa.log', inputIndex: 0, line: 5 },
          rawMessage: 'Node.Recognition.Starting',
          phase: 'starting',
          rawDetails: { task_id: 1, reco_id: 501, name: 'RecoA' },
          taskId: 1,
          recoId: 501,
          name: 'RecoA',
        } satisfies ProtocolEvent,
        latestEvent: {
          kind: 'recognition',
          seq: 6,
          ts: '2026-04-08 00:00:06.000',
          tsMs: 6,
          processId: 'Px1',
          threadId: 'Tx1',
          source: { sourceKey: 'maa.log', inputIndex: 0, line: 6 },
          rawMessage: 'Node.Recognition.Succeeded',
          phase: 'succeeded',
          rawDetails: { task_id: 1, reco_id: 501, name: 'RecoA' },
          taskId: 1,
          recoId: 501,
          name: 'RecoA',
        } satisfies ProtocolEvent,
      },
      children: [],
    }

    const nextList: ScopeNode = {
      id: createScopeId('next_list', { taskId: 1 }, 4),
      kind: 'next_list',
      status: 'succeeded',
      ts: '2026-04-08 00:00:04.000',
      endTs: '2026-04-08 00:00:07.000',
      seq: 4,
      endSeq: 7,
      taskId: 1,
      payload: {
        taskId: 1,
        name: 'MainNode',
        list: [
          { name: 'RecoA', anchor: true, jumpBack: false },
          { name: 'RecoB', anchor: false, jumpBack: true },
        ],
        startEvent: {
          kind: 'next_list',
          seq: 4,
          ts: '2026-04-08 00:00:04.000',
          tsMs: 4,
          processId: 'Px1',
          threadId: 'Tx1',
          source: { sourceKey: 'maa.log', inputIndex: 0, line: 4 },
          rawMessage: 'Node.NextList.Starting',
          phase: 'starting',
          rawDetails: { task_id: 1, name: 'MainNode' },
          taskId: 1,
          name: 'MainNode',
          list: [
            { name: 'RecoA', anchor: true, jumpBack: false },
            { name: 'RecoB', anchor: false, jumpBack: true },
          ],
        } satisfies ProtocolEvent,
        latestEvent: {
          kind: 'next_list',
          seq: 7,
          ts: '2026-04-08 00:00:07.000',
          tsMs: 7,
          processId: 'Px1',
          threadId: 'Tx1',
          source: { sourceKey: 'maa.log', inputIndex: 0, line: 7 },
          rawMessage: 'Node.NextList.Succeeded',
          phase: 'succeeded',
          rawDetails: { task_id: 1, name: 'MainNode' },
          taskId: 1,
          name: 'MainNode',
        } satisfies ProtocolEvent,
      },
      children: [recognition],
    }

    const pipeline: ScopeNode = {
      id: createScopeId('pipeline_node', { taskId: 1, nodeId: 101 }, 3),
      kind: 'pipeline_node',
      status: 'succeeded',
      ts: '2026-04-08 00:00:03.000',
      endTs: '2026-04-08 00:00:08.000',
      seq: 3,
      endSeq: 8,
      taskId: 1,
      payload: { taskId: 1, nodeId: 101, name: 'MainNode' },
      children: [nextList],
    }

    const task: ScopeNode = {
      id: createScopeId('task', { taskId: 1 }, 2),
      kind: 'task',
      status: 'succeeded',
      ts: '2026-04-08 00:00:02.000',
      endTs: '2026-04-08 00:00:09.000',
      seq: 2,
      endSeq: 9,
      taskId: 1,
      payload: { taskId: 1, entry: 'Main' },
      children: [pipeline],
    }

    const root: ScopeNode = {
      id: createScopeId('trace_root', {}, 1),
      kind: 'trace_root',
      status: 'running',
      ts: '2026-04-08 00:00:01.000',
      seq: 1,
      payload: {},
      children: [task],
    }

    const events: ProtocolEvent[] = [
      {
        kind: 'pipeline_node',
        seq: 3,
        ts: '2026-04-08 00:00:03.000',
        tsMs: 3,
        processId: 'Px1',
        threadId: 'Tx1',
        source: { sourceKey: 'maa.log', inputIndex: 0, line: 3 },
        rawMessage: 'Node.PipelineNode.Starting',
        phase: 'starting',
        rawDetails: { task_id: 1, node_id: 101, name: 'MainNode' },
        taskId: 1,
        nodeId: 101,
        name: 'MainNode',
      },
      {
        kind: 'next_list',
        seq: 4,
        ts: '2026-04-08 00:00:04.000',
        tsMs: 4,
        processId: 'Px1',
        threadId: 'Tx1',
        source: { sourceKey: 'maa.log', inputIndex: 0, line: 4 },
        rawMessage: 'Node.NextList.Starting',
        phase: 'starting',
        rawDetails: { task_id: 1, name: 'MainNode' },
        taskId: 1,
        name: 'MainNode',
        list: [
          { name: 'RecoA', anchor: true, jumpBack: false },
          { name: 'RecoB', anchor: false, jumpBack: true },
        ],
      },
      {
        kind: 'recognition',
        seq: 5,
        ts: '2026-04-08 00:00:05.000',
        tsMs: 5,
        processId: 'Px1',
        threadId: 'Tx1',
        source: { sourceKey: 'maa.log', inputIndex: 0, line: 5 },
        rawMessage: 'Node.Recognition.Starting',
        phase: 'starting',
        rawDetails: { task_id: 1, reco_id: 501, name: 'RecoA' },
        taskId: 1,
        recoId: 501,
        name: 'RecoA',
      },
      {
        kind: 'recognition',
        seq: 6,
        ts: '2026-04-08 00:00:06.000',
        tsMs: 6,
        processId: 'Px1',
        threadId: 'Tx1',
        source: { sourceKey: 'maa.log', inputIndex: 0, line: 6 },
        rawMessage: 'Node.Recognition.Succeeded',
        phase: 'succeeded',
        rawDetails: { task_id: 1, reco_id: 501, name: 'RecoA' },
        taskId: 1,
        recoId: 501,
        name: 'RecoA',
      },
      {
        kind: 'next_list',
        seq: 7,
        ts: '2026-04-08 00:00:07.000',
        tsMs: 7,
        processId: 'Px1',
        threadId: 'Tx1',
        source: { sourceKey: 'maa.log', inputIndex: 0, line: 7 },
        rawMessage: 'Node.NextList.Succeeded',
        phase: 'succeeded',
        rawDetails: { task_id: 1, name: 'MainNode' },
        taskId: 1,
        name: 'MainNode',
      },
      {
        kind: 'pipeline_node',
        seq: 8,
        ts: '2026-04-08 00:00:08.000',
        tsMs: 8,
        processId: 'Px1',
        threadId: 'Tx1',
        source: { sourceKey: 'maa.log', inputIndex: 0, line: 8 },
        rawMessage: 'Node.PipelineNode.Succeeded',
        phase: 'succeeded',
        rawDetails: { task_id: 1, node_id: 101, name: 'MainNode' },
        taskId: 1,
        nodeId: 101,
        name: 'MainNode',
      },
    ]

    const index = buildTraceIndex(root, events)

    const timeline = getNodeTimeline(index, { taskId: 1, nodeId: 101 })
    expect(timeline).toEqual({
      ok: true,
      value: [
        expect.objectContaining({ scopeKind: 'pipeline_node', scopeId: pipeline.id, seq: 3 }),
        expect.objectContaining({ scopeKind: 'next_list', scopeId: nextList.id, seq: 4 }),
        expect.objectContaining({ scopeKind: 'recognition', scopeId: recognition.id, seq: 5 }),
        expect.objectContaining({ scopeKind: 'recognition', scopeId: recognition.id, seq: 6 }),
        expect.objectContaining({ scopeKind: 'next_list', scopeId: nextList.id, seq: 7 }),
        expect.objectContaining({ scopeKind: 'pipeline_node', scopeId: pipeline.id, seq: 8 }),
      ],
    })

    const history = getNextListHistory(index, { taskId: 1, nodeId: 101 })
    expect(history).toEqual({
      ok: true,
      value: [
        {
          scopeId: nextList.id,
          occurrenceIndex: 1,
          sourceKey: 'maa.log',
          line: 4,
          candidates: [
            { name: 'RecoA', anchor: true, jumpBack: false },
            { name: 'RecoB', anchor: false, jumpBack: true },
          ],
          outcome: 'succeeded',
        },
      ],
    })
  })
})
