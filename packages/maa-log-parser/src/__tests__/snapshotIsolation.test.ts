import { describe, expect, it } from 'vitest'

import { LogParser } from '../core/logParser'

const eventLine = (
  milliseconds: number,
  message: string,
  details: Record<string, unknown>,
): string =>
  `[2026-07-26 12:00:00.${String(milliseconds).padStart(3, '0')}]` +
  '[INF][Px1][Tx2][test] !!!OnEventNotify!!! ' +
  `[handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`

describe('LogParser snapshot isolation', () => {
  it('deep-clones event and protocol snapshots', async () => {
    const parser = new LogParser()
    await parser.parseFile(
      eventLine(1, 'Tasker.Task.Starting', {
        task_id: 1,
        entry: 'Main',
        nested: { value: 'original' },
      }),
      undefined,
      { yieldControl: null },
    )

    const events = parser.getEventsSnapshot()
    events.splice(0, 1)
    expect(parser.getEventsSnapshot()).toHaveLength(1)

    const legacyEvents = parser.getEvents()
    const legacyNested = legacyEvents[0].details.nested as { value: string }
    legacyNested.value = 'changed'
    expect(parser.getEventsSnapshot()[0].details.nested.value).toBe('original')

    const protocol = parser.getProtocolEventsSnapshot()
    const protocolNested = protocol[0].rawDetails.nested as { value: string }
    protocolNested.value = 'changed'
    const nextProtocolNested = parser.getProtocolEventsSnapshot()[0].rawDetails.nested as {
      value: string
    }
    expect(nextProtocolNested.value).toBe('original')
  })

  it('builds trace and artifact snapshots from isolated protocol events', async () => {
    const parser = new LogParser()
    await parser.parseFile(
      eventLine(1, 'Tasker.Task.Starting', {
        task_id: 1,
        entry: 'Main',
        nested: { value: 'original' },
      }),
      undefined,
      { yieldControl: null },
    )

    const trace = parser.getTraceSnapshot()
    const tracePayload = trace.children[0].payload as Record<string, unknown>
    tracePayload.entry = 'changed'
    const artifacts = parser.getParseArtifactsSnapshot()
    const artifactNested = artifacts.events[0].rawDetails.nested as { value: string }
    artifactNested.value = 'changed'

    expect((parser.getTraceSnapshot().children[0].payload as Record<string, unknown>).entry).toBe(
      'Main',
    )
    const nextArtifactNested = parser.getParseArtifactsSnapshot().events[0].rawDetails.nested as {
      value: string
    }
    expect(nextArtifactNested.value).toBe('original')
  })

  it('freezes cached task projections without losing cache identity', async () => {
    const parser = new LogParser()
    await parser.parseFile(
      [
        eventLine(1, 'Tasker.Task.Starting', { task_id: 1, entry: 'Main' }),
        eventLine(2, 'Tasker.Task.Succeeded', { task_id: 1, entry: 'Main' }),
      ].join('\n'),
      undefined,
      { yieldControl: null },
    )

    const first = parser.getTasksSnapshot()[0]
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.nodes)).toBe(true)
    expect(() => {
      first.entry = 'changed'
    }).toThrow()

    const second = parser.getTasksSnapshot()[0]
    expect(second).toBe(first)
    expect(second.entry).toBe('Main')
  })
})
