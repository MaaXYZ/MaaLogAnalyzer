import { describe, expect, it } from 'vitest'
import type { NestedActionGroup } from '@windsland52/maa-log-parser/types'
import {
  applySubTaskSnapshotStarting,
  applySubTaskSnapshotTerminal,
  getOrCreateSubTaskSnapshot,
  mergeSubTaskActionGroupWithSnapshot,
  type SubTaskSnapshot,
} from '../subtask/snapshotHelpers'

const identity = (value: string) => value

describe('SubTaskSnapshotHelpers', () => {
  it('creates and reuses sub task snapshots by task id', () => {
    const snapshots = new Map<number, SubTaskSnapshot>()
    const first = getOrCreateSubTaskSnapshot(snapshots, 42)
    const second = getOrCreateSubTaskSnapshot(snapshots, 42)

    expect(first).toBe(second)
    expect(first.status).toBe('running')
    expect(first.task_id).toBe(42)
  })

  it('applies starting/terminal snapshot lifecycle fields', () => {
    const snapshot: SubTaskSnapshot = { task_id: 7, status: 'running' }

    applySubTaskSnapshotStarting(
      snapshot,
      { entry: 'SubTask', hash: 'h7', uuid: 'u7' },
      'Tasker.Task.Starting',
      '2026-04-08 00:00:00.100',
      identity
    )
    expect(snapshot.entry).toBe('SubTask')
    expect(snapshot.hash).toBe('h7')
    expect(snapshot.uuid).toBe('u7')
    expect(snapshot.status).toBe('running')
    expect(snapshot.start_message).toBe('Tasker.Task.Starting')
    expect(snapshot.start_details).toEqual({ entry: 'SubTask', hash: 'h7', uuid: 'u7' })

    applySubTaskSnapshotTerminal(
      snapshot,
      { entry: 'SubTask', hash: 'h7', uuid: 'u7' },
      'Tasker.Task.Failed',
      '2026-04-08 00:00:01.200',
      'Failed',
      identity
    )
    expect(snapshot.status).toBe('failed')
    expect(snapshot.end_ts).toBe('2026-04-08 00:00:01.200')
    expect(snapshot.end_message).toBe('Tasker.Task.Failed')
    expect(snapshot.end_details).toEqual({ entry: 'SubTask', hash: 'h7', uuid: 'u7' })
  })

  it('merges nested action group with snapshot and task details', () => {
    const group: NestedActionGroup = {
      task_id: 7,
      name: 'OriginalGroup',
      ts: '2026-04-08 00:00:00.000',
      status: 'running',
      nested_actions: [],
    }
    const snapshot: SubTaskSnapshot = {
      task_id: 7,
      entry: 'SnapshotEntry',
      hash: 'h7',
      uuid: 'u7',
      status: 'succeeded',
      ts: '2026-04-08 00:00:00.100',
      end_ts: '2026-04-08 00:00:01.200',
      start_message: 'Tasker.Task.Starting',
      end_message: 'Tasker.Task.Succeeded',
    }

    const merged = mergeSubTaskActionGroupWithSnapshot(group, snapshot, identity)
    expect(merged.name).toBe('SnapshotEntry')
    expect(merged.ts).toBe('2026-04-08 00:00:00.100')
    expect(merged.end_ts).toBe('2026-04-08 00:00:01.200')
    expect(merged.status).toBe('running')
    expect(merged.task_details).toMatchObject({
      task_id: 7,
      entry: 'SnapshotEntry',
      hash: 'h7',
      uuid: 'u7',
      status: 'succeeded',
    })
  })
})
