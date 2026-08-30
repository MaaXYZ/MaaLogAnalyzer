import { describe, expect, it } from 'vitest'
import type { TaskInfo } from '../../../../../types'
import { buildFollowTasksFingerprint } from '../fingerprint'

const makeTask = (startEventIndex: number): TaskInfo => ({
  task_id: 1,
  entry: 'Same numeric id',
  hash: `hash-${startEventIndex}`,
  uuid: `uuid-${startEventIndex}`,
  start_time: `2026-07-26 12:00:${startEventIndex}.000`,
  status: 'running',
  nodes: [],
  events: [],
  _startEventIndex: startEventIndex,
})

describe('buildFollowTasksFingerprint', () => {
  it('distinguishes task executions that reuse the same numeric id', () => {
    expect(buildFollowTasksFingerprint([makeTask(10)])).not.toBe(
      buildFollowTasksFingerprint([makeTask(20)]),
    )
  })
})
