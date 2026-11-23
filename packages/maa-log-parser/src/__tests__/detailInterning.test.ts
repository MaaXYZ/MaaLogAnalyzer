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

const recoDetails = {
  reco_id: 42,
  algorithm: 'And',
  box: null,
  name: 'SharedReco',
  detail: {
    all: [
      { box: [0, 0, 1, 1], score: 0.9 },
      { box: [1, 1, 1, 1], score: 0.8 },
    ],
    filtered: [{ box: [0, 0, 1, 1], score: 0.9 }],
    best: { box: [0, 0, 1, 1], score: 0.9 },
  },
}

const actionDetails = {
  action_id: 500,
  action: 'Click',
  box: [1, 2, 3, 4],
  name: 'SharedAction',
  success: true,
  detail: { point: [2, 3], contact: 0 },
}

const buildLog = (): string =>
  [
    makeEventLine(1, 'Tasker.Task.Starting', {
      task_id: 1,
      entry: 'MainTask',
      hash: 'h',
      uuid: 'u',
    }),
    makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: 'NodeA' }),
    // 同一次识别被两条事件重复携带（内容逐字节一致、reco_id 相同）
    makeEventLine(3, 'Node.Recognition.Starting', {
      task_id: 1,
      reco_id: 42,
      name: 'NodeA',
      reco_details: recoDetails,
    }),
    makeEventLine(4, 'Node.Recognition.Succeeded', {
      task_id: 1,
      reco_id: 42,
      name: 'NodeA',
      reco_details: recoDetails,
    }),
    makeEventLine(5, 'Node.Action.Starting', {
      task_id: 1,
      action_id: 500,
      name: 'NodeA',
      action_details: actionDetails,
    }),
    makeEventLine(6, 'Node.Action.Succeeded', {
      task_id: 1,
      action_id: 500,
      name: 'NodeA',
      action_details: actionDetails,
    }),
    makeEventLine(7, 'Node.PipelineNode.Succeeded', { task_id: 1, node_id: 101, name: 'NodeA' }),
    makeEventLine(8, 'Tasker.Task.Succeeded', {
      task_id: 1,
      entry: 'MainTask',
      hash: 'h',
      uuid: 'u',
    }),
  ].join('\n')

interface Internals {
  protocolEvents: Array<{
    recoDetails?: unknown
    actionDetails?: unknown
    rawDetails?: Record<string, unknown>
  }>
}

const parse = async (internDuplicateDetails: boolean) => {
  const parser = new LogParser()
  await parser.parseFile(buildLog(), undefined, { internDuplicateDetails })
  const internals = parser as unknown as Internals
  return {
    parser,
    events: internals.protocolEvents,
  }
}

describe('duplicate detail interning', () => {
  it('shares one object tree for identical (processId, reco_id) details', async () => {
    const { events } = await parse(true)
    const recoEvents = events.filter((event) => event.recoDetails)
    expect(recoEvents).toHaveLength(2)
    expect(recoEvents[0]?.recoDetails).toBe(recoEvents[1]?.recoDetails)
  })

  it('points rawDetails.reco_details at the shared object (otherwise nothing is saved)', async () => {
    const { events } = await parse(true)
    const recoEvents = events.filter((event) => event.recoDetails)
    for (const event of recoEvents) {
      expect(event.rawDetails?.reco_details).toBe(event.recoDetails)
    }
  })

  it('shares action details by (processId, action_id) as well', async () => {
    const { events } = await parse(true)
    const actionEvents = events.filter((event) => event.actionDetails)
    expect(actionEvents).toHaveLength(2)
    expect(actionEvents[0]?.actionDetails).toBe(actionEvents[1]?.actionDetails)
    for (const event of actionEvents) {
      expect(event.rawDetails?.action_details).toBe(event.actionDetails)
    }
  })

  it('keeps separate objects when interning is disabled', async () => {
    const { events } = await parse(false)
    const recoEvents = events.filter((event) => event.recoDetails)
    expect(recoEvents[0]?.recoDetails).not.toBe(recoEvents[1]?.recoDetails)
  })

  it('produces byte-identical projected output with and without interning', async () => {
    const withInterning = await parse(true)
    const withoutInterning = await parse(false)
    expect(JSON.stringify(withInterning.parser.getTasksSnapshot())).toBe(
      JSON.stringify(withoutInterning.parser.getTasksSnapshot()),
    )
  })
})
