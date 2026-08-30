import { describe, expect, it } from 'vitest'
import { projectTasksFromTrace } from '../projector/taskProjector'
import type { ScopeNode } from '../trace/scopeTypes'

const taskScope = (
  taskId: number,
  seq: number,
  start: string,
  end: string,
  nodeId: number,
  waitFreezesScopes: ScopeNode[],
): ScopeNode => ({
  id: `task.${taskId}.seq${seq}`,
  kind: 'task',
  status: 'succeeded',
  ts: start,
  endTs: end,
  seq,
  endSeq: seq + 99,
  taskId,
  payload: {
    taskId,
    entry: `Task${taskId}`,
    hash: `hash-${taskId}`,
    uuid: `uuid-${taskId}`,
    source: { sourceKey: `source-${taskId}` },
  },
  children: [
    {
      id: `pipeline.${nodeId}.seq${seq + 1}`,
      kind: 'pipeline_node',
      status: 'succeeded',
      ts: start,
      endTs: end,
      seq: seq + 1,
      endSeq: seq + 98,
      taskId,
      payload: {
        taskId,
        nodeId,
        name: 'SharedNode',
        source: { sourceKey: `source-${taskId}` },
      },
      children: waitFreezesScopes,
    },
  ],
})

const waitFreezesScope = (
  taskId: number,
  nodeId: number,
  wfId: number,
  seq: number,
  start: string,
  end: string,
): ScopeNode => ({
  id: `wait-freezes.${taskId}.${nodeId}.${wfId}.seq${seq}`,
  kind: 'wait_freezes',
  status: 'succeeded',
  ts: start,
  endTs: end,
  seq,
  endSeq: seq + 1,
  taskId,
  payload: {
    taskId,
    wfId,
    name: 'SharedNode',
    waitPhase: 'post',
    source: { sourceKey: `source-${taskId}` },
  },
  children: [],
})

describe('wait_freezes image projection', () => {
  it('isolates same-name images by trace occurrence and returns them chronologically', () => {
    const firstWait = waitFreezesScope(
      1,
      101,
      11,
      3,
      '2026-04-07 10:00:00.120',
      '2026-04-07 10:00:00.180',
    )
    const repeatedWait = waitFreezesScope(
      1,
      101,
      12,
      5,
      '2026-04-07 10:00:00.220',
      '2026-04-07 10:00:00.280',
    )
    const otherTaskWait = waitFreezesScope(
      2,
      201,
      21,
      103,
      '2026-04-07 10:00:00.320',
      '2026-04-07 10:00:00.380',
    )
    const root: ScopeNode = {
      id: 'trace-root',
      kind: 'trace_root',
      status: 'running',
      ts: '2026-04-07 10:00:00.100',
      endTs: '2026-04-07 10:00:00.500',
      seq: 0,
      endSeq: 200,
      payload: {},
      children: [
        taskScope(1, 1, '2026-04-07 10:00:00.100', '2026-04-07 10:00:00.299', 101, [
          firstWait,
          repeatedWait,
        ]),
        taskScope(2, 101, '2026-04-07 10:00:00.300', '2026-04-07 10:00:00.499', 201, [
          otherTaskWait,
        ]),
      ],
    }
    const waitFreezesImages = new Map([
      ['2026.04.07-10.00.00.350_SharedNode_wait_freezes', '/images/task-2.jpg'],
      ['2026.04.07-10.00.00.260_SharedNode_wait_freezes', '/images/repeat-late.jpg'],
      ['2026.04.07-10.00.00.230_SharedNode_wait_freezes', '/images/repeat-early.jpg'],
      ['2026.04.07-10.00.00.170_SharedNode_wait_freezes', '/images/first-late.jpg'],
      ['2026.04.07-10.00.00.130_SharedNode_wait_freezes', '/images/first-early.jpg'],
    ])

    const tasks = projectTasksFromTrace(root, { waitFreezesImages })
    const firstTaskFlow = tasks[0]?.nodes[0]?.node_flow ?? []
    const secondTaskFlow = tasks[1]?.nodes[0]?.node_flow ?? []

    expect(firstTaskFlow[0]?.wait_freezes_details?.images).toEqual([
      '/images/first-early.jpg',
      '/images/first-late.jpg',
    ])
    expect(firstTaskFlow[1]?.wait_freezes_details?.images).toEqual([
      '/images/repeat-early.jpg',
      '/images/repeat-late.jpg',
    ])
    expect(secondTaskFlow[0]?.wait_freezes_details?.images).toEqual(['/images/task-2.jpg'])
  })

  it('assigns an image to only the latest matching occurrence when task windows overlap', () => {
    const earlierWait = waitFreezesScope(
      1,
      101,
      11,
      3,
      '2026-04-07 10:00:00.120',
      '2026-04-07 10:00:00.360',
    )
    const laterWait = waitFreezesScope(
      2,
      201,
      21,
      103,
      '2026-04-07 10:00:00.220',
      '2026-04-07 10:00:00.380',
    )
    const root: ScopeNode = {
      id: 'trace-root',
      kind: 'trace_root',
      status: 'running',
      ts: '2026-04-07 10:00:00.100',
      endTs: '2026-04-07 10:00:00.500',
      seq: 0,
      endSeq: 200,
      payload: {},
      children: [
        taskScope(1, 1, '2026-04-07 10:00:00.100', '2026-04-07 10:00:00.400', 101, [earlierWait]),
        taskScope(2, 101, '2026-04-07 10:00:00.200', '2026-04-07 10:00:00.499', 201, [laterWait]),
      ],
    }

    const tasks = projectTasksFromTrace(root, {
      waitFreezesImages: new Map([
        ['2026.04.07-10.00.00.250_SharedNode_wait_freezes', '/images/overlap.jpg'],
      ]),
    })

    expect(tasks[0]?.nodes[0]?.node_flow?.[0]?.wait_freezes_details?.images).toBeUndefined()
    expect(tasks[1]?.nodes[0]?.node_flow?.[0]?.wait_freezes_details?.images).toEqual([
      '/images/overlap.jpg',
    ])
  })
})
