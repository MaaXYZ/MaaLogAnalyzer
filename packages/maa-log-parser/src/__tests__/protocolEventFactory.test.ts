import { describe, expect, it } from 'vitest'
import { parseEventLine } from '../event/line'
import { createProtocolEvent, createSourceRef } from '../protocol/eventFactory'

const identity = (value: string) => value

const createEvent = (message: string, details: Record<string, unknown>) => {
  const line = `[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
  const parsed = parseEventLine(line, 1, {
    internEventToken: identity,
    forceCopyString: identity,
  })

  expect(parsed).toBeTruthy()
  return createProtocolEvent(parsed!, { seq: 1 })
}

const REQUIRED_SCOPE_ID_CASES = [
  {
    message: 'Tasker.Task.Starting',
    details: { task_id: 1 },
    requiredFields: ['task_id'],
  },
  {
    message: 'Node.PipelineNode.Starting',
    details: { task_id: 1, node_id: 2 },
    requiredFields: ['task_id', 'node_id'],
  },
  {
    message: 'Node.RecognitionNode.Starting',
    details: { task_id: 1, node_id: 2 },
    requiredFields: ['task_id', 'node_id'],
  },
  {
    message: 'Node.ActionNode.Starting',
    details: { task_id: 1, node_id: 2 },
    requiredFields: ['task_id', 'node_id'],
  },
  {
    message: 'Node.NextList.Starting',
    details: { task_id: 1 },
    requiredFields: ['task_id'],
  },
  {
    message: 'Node.Recognition.Starting',
    details: { task_id: 1, reco_id: 3 },
    requiredFields: ['task_id', 'reco_id'],
  },
  {
    message: 'Node.Action.Starting',
    details: { task_id: 1, action_id: 4 },
    requiredFields: ['task_id', 'action_id'],
  },
  {
    message: 'Node.WaitFreezes.Starting',
    details: { task_id: 1, wf_id: 5 },
    requiredFields: ['task_id', 'wf_id'],
  },
] as const

const INVALID_SCOPE_IDS: unknown[] = [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']

describe('ProtocolEventFactory', () => {
  it('creates task protocol event with SourceRef metadata', () => {
    const line =
      '[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":1,"entry":"Main","uuid":"u-1","hash":"h-1"}]'
    const parsed = parseEventLine(line, 10, {
      internEventToken: identity,
      forceCopyString: identity,
    })

    expect(parsed).toBeTruthy()
    const protocolEvent = createProtocolEvent(parsed!, {
      seq: 3,
      sourceKey: 'maa.log',
      sourcePath: '/logs/maa.log',
      inputIndex: 0,
    })

    expect(protocolEvent).toEqual({
      kind: 'task',
      seq: 3,
      ts: '2026-04-08 00:01:02.345',
      tsMs: parsed!._timestampMs,
      processId: 'Px1',
      threadId: 'Tx2',
      source: {
        sourceKey: 'maa.log',
        sourcePath: '/logs/maa.log',
        inputIndex: 0,
        line: 10,
      },
      rawMessage: 'Tasker.Task.Starting',
      phase: 'starting',
      rawDetails: {
        task_id: 1,
        entry: 'Main',
        uuid: 'u-1',
        hash: 'h-1',
      },
      taskId: 1,
      entry: 'Main',
      uuid: 'u-1',
      hash: 'h-1',
    })
  })

  it('creates wait_freezes protocol event with parsed details', () => {
    const line =
      '[2026-04-08 00:01:04.000][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Node.WaitFreezes.Succeeded] [details={"task_id":1,"wf_id":9,"name":"WF","phase":"post","roi":[1,2,3,4],"param":{"method":1,"timeout":1000},"reco_ids":[5,6],"elapsed":77,"focus":{"x":1}}]'
    const parsed = parseEventLine(line, 12, {
      internEventToken: identity,
      forceCopyString: identity,
    })

    const protocolEvent = createProtocolEvent(parsed!, {
      seq: 7,
      sourceKey: 'maa.log',
    })

    expect(protocolEvent).toMatchObject({
      kind: 'wait_freezes',
      phase: 'succeeded',
      taskId: 1,
      wfId: 9,
      waitPhase: 'post',
      roi: [1, 2, 3, 4],
      recoIds: [5, 6],
      elapsed: 77,
      source: {
        sourceKey: 'maa.log',
        inputIndex: 0,
        line: 12,
      },
    })
  })

  it.each(REQUIRED_SCOPE_ID_CASES)(
    'rejects $message when a required scope ID is not a positive safe integer',
    ({ message, details, requiredFields }) => {
      expect(createEvent(message, details)).not.toBeNull()

      for (const field of requiredFields) {
        for (const invalidValue of INVALID_SCOPE_IDS) {
          expect(
            createEvent(message, {
              ...details,
              [field]: invalidValue,
            }),
          ).toBeNull()
        }
      }
    },
  )

  it('accepts the largest positive safe integer as a required scope ID', () => {
    expect(
      createEvent('Tasker.Task.Starting', {
        task_id: Number.MAX_SAFE_INTEGER,
      }),
    ).toMatchObject({
      kind: 'task',
      taskId: Number.MAX_SAFE_INTEGER,
    })
  })

  it('normalizes invalid optional node operation IDs without changing nested details', () => {
    expect(
      createEvent('Node.RecognitionNode.Starting', {
        task_id: 1,
        node_id: 2,
        reco_id: 0,
      }),
    ).toMatchObject({
      kind: 'recognition_node',
      recoId: undefined,
    })

    expect(
      createEvent('Node.ActionNode.Starting', {
        task_id: 1,
        node_id: 2,
        action_id: 0,
        node_details: { action_id: 0 },
      }),
    ).toMatchObject({
      kind: 'action_node',
      actionId: undefined,
      nodeDetails: { action_id: 0 },
    })
  })

  it('returns null for unsupported or unknown message phase', () => {
    const line =
      '[2026-04-08 00:01:05.000][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Node.NextList.Custom] [details={"task_id":1}]'
    const parsed = parseEventLine(line, 14, {
      internEventToken: identity,
      forceCopyString: identity,
    })

    expect(parsed).toBeTruthy()
    expect(createProtocolEvent(parsed!, { seq: 8 })).toBeNull()
    expect(createSourceRef(parsed!, { sourcePath: '/logs/maa.log' })).toEqual({
      sourceKey: '/logs/maa.log',
      sourcePath: '/logs/maa.log',
      inputIndex: 0,
      line: 14,
    })
  })
})
