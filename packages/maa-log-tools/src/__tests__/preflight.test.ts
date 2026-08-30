import { describe, expect, it } from 'vitest'
import type { KernelOutput } from '@windsland52/maa-log-kernel/protocol'
import { buildPreflightOutput } from '../cli'

const createOutput = (task: KernelOutput['tasks'][number]): KernelOutput => ({
  meta: {
    schemaVersion: '1.0.0',
    parserVersion: 'test',
    generatedAt: '2026-07-26T00:00:00.000Z',
  },
  tasks: [task],
  events: [{} as KernelOutput['events'][number]],
  stats: { nodes: [], recognitionActions: [] },
  warnings: ['Events were parsed but no task lifecycle was assembled.'],
})

describe('preflight task lifecycle semantics', () => {
  it('does not treat a synthetic resource projection as a task lifecycle', () => {
    const output = buildPreflightOutput(
      createOutput({
        task_id: 0,
        entry: '[Global] Resource.Loading',
        hash: '',
        uuid: 'synthetic:resource_loading:1:seq1',
        start_time: '2026-07-26T00:00:00.000Z',
        status: 'succeeded',
        nodes: [],
        events: [],
      }),
    )

    expect(output).toMatchObject({
      status: 'unsupported',
      reason: 'no_task_lifecycle',
      taskCount: 0,
      eventCount: 1,
    })
  })

  it('continues to accept real task lifecycle projections', () => {
    const output = buildPreflightOutput(
      createOutput({
        task_id: 1,
        entry: 'MainTask',
        hash: 'hash',
        uuid: 'task-uuid',
        start_time: '2026-07-26T00:00:00.000Z',
        status: 'succeeded',
        nodes: [],
        events: [],
      }),
    )

    expect(output).toMatchObject({
      status: 'supported',
      reason: 'notify_events_parsed',
      taskCount: 1,
    })
  })
})
