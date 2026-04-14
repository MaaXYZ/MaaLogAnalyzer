import { describe, expect, it } from 'vitest'
import type { NestedActionGroup, RecognitionAttempt } from '@windsland52/maa-log-parser/types'
import { createRecognitionAttemptHelpers } from '../recognition/helpers'
import { cloneNestedActionGroup } from '../recognition/scopeHelpers'
import { nestSubTaskActionGroups } from '../subtask/nestingHelpers'

const toTimestampMs = (value?: string): number => {
  if (!value) return Number.POSITIVE_INFINITY
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

const createGroup = (
  taskId: number,
  ts: string,
  actionType = 'Click'
): NestedActionGroup => {
  return {
    task_id: taskId,
    name: `Task-${taskId}`,
    ts,
    status: 'success',
    nested_actions: [{
      node_id: taskId * 10 + 1,
      name: `Action-${taskId}`,
      ts,
      end_ts: ts,
      status: 'success',
      action_details: {
        action_id: taskId * 100 + 1,
        action: actionType,
        box: [0, 0, 1, 1],
        detail: {},
        name: `Action-${taskId}`,
        success: true,
        ts,
        end_ts: ts,
      },
    }],
  }
}

describe('SubTaskNestingHelpers', () => {
  it('nests sub task into explicit parent task and prefers Custom action node', () => {
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { cloneRecognitionAttempt } = createRecognitionAttemptHelpers(recognitionOrderMeta)

    const parent: NestedActionGroup = {
      task_id: 1,
      name: 'Parent',
      ts: '2026-04-08 00:00:00.000',
      status: 'success',
      nested_actions: [
        {
          node_id: 11,
          name: 'Normal',
          ts: '2026-04-08 00:00:00.000',
          end_ts: '2026-04-08 00:00:10.000',
          status: 'success',
          action_details: {
            action_id: 11,
            action: 'Click',
            box: [0, 0, 1, 1],
            detail: {},
            name: 'Normal',
            success: true,
            ts: '2026-04-08 00:00:00.000',
            end_ts: '2026-04-08 00:00:10.000',
          },
        },
        {
          node_id: 12,
          name: 'Custom',
          ts: '2026-04-08 00:00:00.100',
          end_ts: '2026-04-08 00:00:10.100',
          status: 'success',
          action_details: {
            action_id: 12,
            action: 'Custom',
            box: [0, 0, 1, 1],
            detail: {},
            name: 'Custom',
            success: true,
            ts: '2026-04-08 00:00:00.100',
            end_ts: '2026-04-08 00:00:10.100',
          },
        },
      ],
    }

    const child = createGroup(2, '2026-04-08 00:00:05.000')
    const roots = nestSubTaskActionGroups({
      groups: [parent, child],
      rootTaskId: 100,
      subTaskParentByTaskId: new Map([[2, 1]]),
      toTimestampMs,
      cloneGroup: (group) => cloneNestedActionGroup(group, cloneRecognitionAttempt),
    })

    expect(roots).toHaveLength(1)
    expect(roots[0].task_id).toBe(1)
    expect(roots[0].nested_actions[1].child_tasks?.[0].task_id).toBe(2)
  })

  it('falls back to timeline nesting when explicit parent is missing', () => {
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { cloneRecognitionAttempt } = createRecognitionAttemptHelpers(recognitionOrderMeta)

    const groupA = createGroup(10, '2026-04-08 00:00:00.000', 'Custom')
    groupA.nested_actions[0].action_details!.end_ts = '2026-04-08 00:00:20.000'
    groupA.nested_actions[0].end_ts = '2026-04-08 00:00:20.000'
    const groupB = createGroup(20, '2026-04-08 00:00:10.000')

    const roots = nestSubTaskActionGroups({
      groups: [groupA, groupB],
      rootTaskId: 999,
      subTaskParentByTaskId: new Map(),
      toTimestampMs,
      cloneGroup: (group) => cloneNestedActionGroup(group, cloneRecognitionAttempt),
    })

    expect(roots).toHaveLength(1)
    expect(roots[0].task_id).toBe(10)
    expect(roots[0].nested_actions[0].child_tasks?.[0].task_id).toBe(20)
  })

  it('treats running parent action as open-ended for explicit parent nesting', () => {
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { cloneRecognitionAttempt } = createRecognitionAttemptHelpers(recognitionOrderMeta)

    const parent = createGroup(50, '2026-04-08 00:00:00.000', 'Custom')
    parent.status = 'running'
    parent.nested_actions[0].status = 'running'
    parent.nested_actions[0].end_ts = parent.nested_actions[0].ts
    parent.nested_actions[0].action_details!.end_ts = parent.nested_actions[0].ts

    const child = createGroup(51, '2026-04-08 00:00:10.000')

    const roots = nestSubTaskActionGroups({
      groups: [parent, child],
      rootTaskId: 999,
      subTaskParentByTaskId: new Map([[51, 50]]),
      toTimestampMs,
      cloneGroup: (group) => cloneNestedActionGroup(group, cloneRecognitionAttempt),
    })

    expect(roots).toHaveLength(1)
    expect(roots[0].task_id).toBe(50)
    expect(roots[0].nested_actions[0].child_tasks?.[0].task_id).toBe(51)
  })

  it('treats running parent action as open-ended for timeline fallback nesting', () => {
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { cloneRecognitionAttempt } = createRecognitionAttemptHelpers(recognitionOrderMeta)

    const parent = createGroup(60, '2026-04-08 00:00:00.000', 'Custom')
    parent.status = 'running'
    parent.nested_actions[0].status = 'running'
    parent.nested_actions[0].end_ts = parent.nested_actions[0].ts
    parent.nested_actions[0].action_details!.end_ts = parent.nested_actions[0].ts

    const child = createGroup(61, '2026-04-08 00:00:10.000')

    const roots = nestSubTaskActionGroups({
      groups: [parent, child],
      rootTaskId: 999,
      subTaskParentByTaskId: new Map(),
      toTimestampMs,
      cloneGroup: (group) => cloneNestedActionGroup(group, cloneRecognitionAttempt),
    })

    expect(roots).toHaveLength(1)
    expect(roots[0].task_id).toBe(60)
    expect(roots[0].nested_actions[0].child_tasks?.[0].task_id).toBe(61)
  })

  it('keeps unnestable groups as roots and sorts root order by timestamp', () => {
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { cloneRecognitionAttempt } = createRecognitionAttemptHelpers(recognitionOrderMeta)

    const early = createGroup(31, '2026-04-08 00:00:01.000')
    const late = createGroup(32, '2026-04-08 00:00:03.000')

    const roots = nestSubTaskActionGroups({
      groups: [late, early],
      rootTaskId: 1,
      subTaskParentByTaskId: new Map(),
      toTimestampMs,
      cloneGroup: (group) => cloneNestedActionGroup(group, cloneRecognitionAttempt),
    })

    expect(roots.map((group) => group.task_id)).toEqual([31, 32])
  })
})
