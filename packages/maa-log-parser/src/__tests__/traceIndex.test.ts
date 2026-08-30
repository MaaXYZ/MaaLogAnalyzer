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

const makeProtocolEvent = (params: {
  kind: ProtocolEvent['kind']
  seq: number
  phase: ProtocolEvent['phase']
  taskId: number
  nodeId?: number
  name?: string
}): ProtocolEvent =>
  ({
    kind: params.kind,
    seq: params.seq,
    ts: `2026-04-08 00:00:${String(params.seq).padStart(2, '0')}.000`,
    tsMs: params.seq,
    processId: `Px${params.taskId}`,
    threadId: `Tx${params.taskId}`,
    source: {
      sourceKey: `task-${params.taskId}.log`,
      inputIndex: params.taskId - 1,
      line: params.seq,
    },
    rawMessage: `${params.kind}.${params.phase}`,
    phase: params.phase,
    rawDetails: {
      task_id: params.taskId,
      node_id: params.nodeId,
      name: params.name,
    },
    taskId: params.taskId,
    nodeId: params.nodeId,
    name: params.name,
  }) as ProtocolEvent

describe('TraceIndex', () => {
  it('builds deterministic scope ids from payload identity', () => {
    expect(createScopeId('pipeline_node', { taskId: 12, nodeId: 38 }, 42)).toBe(
      'pipeline_node:12:38:seq42',
    )
    expect(createScopeId('next_list', { taskId: 12 }, 43)).toBe('next_list:12:0:seq43')
    expect(createScopeId('controller_action', { ctrlId: 7 }, 6)).toBe('controller_action:0:7:seq6')
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

    const nextList2: ScopeNode = {
      id: createScopeId('next_list', { taskId: 1 }, 11),
      kind: 'next_list',
      status: 'failed',
      ts: '2026-04-08 00:00:11.000',
      endTs: '2026-04-08 00:00:11.000',
      seq: 11,
      endSeq: 11,
      taskId: 1,
      payload: { taskId: 1, name: 'MainNode', list: [] },
      children: [],
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
      children: [nextList2],
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
      helpers
        .findScopesByLocator({ kind: 'recognition', taskId: 1, localId: 501 })
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

    expect(getNodeTimeline(index, { taskId: 1, nodeId: 101 }, 1)).toEqual({
      ok: true,
      value: [expect.objectContaining({ occurrenceIndex: 1, seq: 3 })],
    })
    expect(getNextListHistory(index, { taskId: 1, nodeId: 101 }, 1)).toEqual({
      ok: true,
      value: [expect.objectContaining({ occurrenceIndex: 1, scopeId: nextList.id })],
    })
    expect(getNodeTimeline(index, { taskId: 1, nodeId: 101 }, 1.5)).toEqual({
      ok: false,
      error: 'invalid_locator',
      message: 'limit must be a non-negative safe integer',
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

  it('keeps scope events inside the actual subtree when sibling tasks overlap', () => {
    const nextList: ScopeNode = {
      id: createScopeId('next_list', { taskId: 1 }, 3),
      kind: 'next_list',
      status: 'succeeded',
      ts: '2026-04-08 00:00:03.000',
      endTs: '2026-04-08 00:00:08.000',
      seq: 3,
      endSeq: 8,
      taskId: 1,
      payload: { taskId: 1, name: 'MainNode' },
      children: [],
    }
    const targetPipeline: ScopeNode = {
      id: createScopeId('pipeline_node', { taskId: 1, nodeId: 101 }, 2),
      kind: 'pipeline_node',
      status: 'succeeded',
      ts: '2026-04-08 00:00:02.000',
      endTs: '2026-04-08 00:00:09.000',
      seq: 2,
      endSeq: 9,
      taskId: 1,
      payload: { taskId: 1, nodeId: 101, name: 'MainNode' },
      children: [nextList],
    }
    const targetTask: ScopeNode = {
      id: createScopeId('task', { taskId: 1 }, 1),
      kind: 'task',
      status: 'succeeded',
      ts: '2026-04-08 00:00:01.000',
      endTs: '2026-04-08 00:00:10.000',
      seq: 1,
      endSeq: 10,
      taskId: 1,
      payload: { taskId: 1, entry: 'Main' },
      children: [targetPipeline],
    }
    const siblingPipeline: ScopeNode = {
      id: createScopeId('pipeline_node', { taskId: 2, nodeId: 202 }, 5),
      kind: 'pipeline_node',
      status: 'succeeded',
      ts: '2026-04-08 00:00:05.000',
      endTs: '2026-04-08 00:00:06.000',
      seq: 5,
      endSeq: 6,
      taskId: 2,
      payload: { taskId: 2, nodeId: 202, name: 'SiblingNode' },
      children: [],
    }
    const siblingTask: ScopeNode = {
      id: createScopeId('task', { taskId: 2 }, 4),
      kind: 'task',
      status: 'succeeded',
      ts: '2026-04-08 00:00:04.000',
      endTs: '2026-04-08 00:00:07.000',
      seq: 4,
      endSeq: 7,
      taskId: 2,
      payload: { taskId: 2, entry: 'Sibling' },
      children: [siblingPipeline],
    }
    const root: ScopeNode = {
      id: createScopeId('trace_root', {}, 0),
      kind: 'trace_root',
      status: 'running',
      ts: '2026-04-08 00:00:00.000',
      seq: 0,
      payload: {},
      children: [targetTask, siblingTask],
    }
    const events = [
      makeProtocolEvent({ kind: 'task', seq: 1, phase: 'starting', taskId: 1 }),
      makeProtocolEvent({
        kind: 'pipeline_node',
        seq: 2,
        phase: 'starting',
        taskId: 1,
        nodeId: 101,
        name: 'MainNode',
      }),
      makeProtocolEvent({
        kind: 'next_list',
        seq: 3,
        phase: 'starting',
        taskId: 1,
        name: 'MainNode',
      }),
      makeProtocolEvent({ kind: 'task', seq: 4, phase: 'starting', taskId: 2 }),
      makeProtocolEvent({
        kind: 'pipeline_node',
        seq: 5,
        phase: 'starting',
        taskId: 2,
        nodeId: 202,
        name: 'SiblingNode',
      }),
      makeProtocolEvent({
        kind: 'pipeline_node',
        seq: 6,
        phase: 'succeeded',
        taskId: 2,
        nodeId: 202,
        name: 'SiblingNode',
      }),
      makeProtocolEvent({ kind: 'task', seq: 7, phase: 'succeeded', taskId: 2 }),
      makeProtocolEvent({
        kind: 'next_list',
        seq: 8,
        phase: 'succeeded',
        taskId: 1,
        name: 'MainNode',
      }),
      makeProtocolEvent({
        kind: 'pipeline_node',
        seq: 9,
        phase: 'succeeded',
        taskId: 1,
        nodeId: 101,
        name: 'MainNode',
      }),
      makeProtocolEvent({ kind: 'task', seq: 10, phase: 'succeeded', taskId: 1 }),
    ]
    const index = buildTraceIndex(root, events)

    expect(createQueryHelpers(index).getScopeEvents(targetPipeline.id)).toEqual({
      ok: true,
      value: [events[1], events[2], events[7], events[8]],
    })
    expect(
      getNodeTimeline(index, {
        taskId: 1,
        nodeId: 101,
        scopeId: targetPipeline.id,
      }),
    ).toEqual({
      ok: true,
      value: [
        expect.objectContaining({ seq: 2, scopeId: targetPipeline.id }),
        expect.objectContaining({ seq: 3, scopeId: nextList.id }),
        expect.objectContaining({ seq: 8, scopeId: nextList.id }),
        expect.objectContaining({ seq: 9, scopeId: targetPipeline.id }),
      ],
    })
  })

  it('includes completed and running descendants in a running scope query', () => {
    const recognition: ScopeNode = {
      id: createScopeId('recognition', { taskId: 1, recoId: 301 }, 3),
      kind: 'recognition',
      status: 'succeeded',
      ts: '2026-04-08 00:00:03.000',
      endTs: '2026-04-08 00:00:04.000',
      seq: 3,
      endSeq: 4,
      taskId: 1,
      payload: { taskId: 1, recoId: 301, name: 'Reco' },
      children: [],
    }
    const action: ScopeNode = {
      id: createScopeId('action', { taskId: 1, actionId: 401 }, 5),
      kind: 'action',
      status: 'running',
      ts: '2026-04-08 00:00:05.000',
      seq: 5,
      taskId: 1,
      payload: { taskId: 1, actionId: 401, name: 'Action' },
      children: [],
    }
    const pipeline: ScopeNode = {
      id: createScopeId('pipeline_node', { taskId: 1, nodeId: 101 }, 2),
      kind: 'pipeline_node',
      status: 'running',
      ts: '2026-04-08 00:00:02.000',
      seq: 2,
      taskId: 1,
      payload: { taskId: 1, nodeId: 101, name: 'RunningNode' },
      children: [recognition, action],
    }
    const root: ScopeNode = {
      id: createScopeId('trace_root', {}, 1),
      kind: 'trace_root',
      status: 'running',
      ts: '2026-04-08 00:00:01.000',
      seq: 1,
      payload: {},
      children: [pipeline],
    }
    const events = [
      makeProtocolEvent({
        kind: 'pipeline_node',
        seq: 2,
        phase: 'starting',
        taskId: 1,
        nodeId: 101,
        name: 'RunningNode',
      }),
      makeProtocolEvent({
        kind: 'recognition',
        seq: 3,
        phase: 'starting',
        taskId: 1,
        name: 'Reco',
      }),
      makeProtocolEvent({
        kind: 'recognition',
        seq: 4,
        phase: 'succeeded',
        taskId: 1,
        name: 'Reco',
      }),
      makeProtocolEvent({ kind: 'action', seq: 5, phase: 'starting', taskId: 1, name: 'Action' }),
    ]
    const index = buildTraceIndex(root, events)

    expect(createQueryHelpers(index).getScopeEvents(pipeline.id)).toEqual({
      ok: true,
      value: events,
    })
  })
})
