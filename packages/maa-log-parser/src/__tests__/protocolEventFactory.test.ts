import { describe, expect, it } from 'vitest'
import { parseEventLine } from '../event/line'
import {
  createProtocolEvent,
  createSourceRef,
} from '../protocol/eventFactory'

const identity = (value: string) => value

describe('ProtocolEventFactory', () => {
  it('creates task protocol event with SourceRef metadata', () => {
    const line = '[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":1,"entry":"Main","uuid":"u-1","hash":"h-1"}]'
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
    const line = '[2026-04-08 00:01:04.000][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Node.WaitFreezes.Succeeded] [details={"task_id":1,"wf_id":9,"name":"WF","phase":"post","roi":[1,2,3,4],"param":{"method":1,"timeout":1000},"reco_ids":[5,6],"elapsed":77,"focus":{"x":1}}]'
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

  it('returns null for unsupported or unknown message phase', () => {
    const line = '[2026-04-08 00:01:05.000][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Node.NextList.Custom] [details={"task_id":1}]'
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
