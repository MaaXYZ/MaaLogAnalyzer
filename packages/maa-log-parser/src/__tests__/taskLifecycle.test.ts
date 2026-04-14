import { describe, expect, it, vi } from 'vitest'
import { parseMaaMessageMeta } from '../event/meta'
import {
  handleTaskLifecycleMetaEvent,
  resolveEventTaskId,
  resolveTaskLifecycleEventDetails,
  type TaskLifecycleMetaEventContext,
} from '../task/lifecycle'

describe('TaskLifecycle', () => {
  it('parses lifecycle details and task id with numeric guard', () => {
    expect(resolveEventTaskId({ task_id: 123 })).toBe(123)
    expect(resolveEventTaskId({ task_id: '123' })).toBeUndefined()

    expect(resolveTaskLifecycleEventDetails({
      task_id: 7,
      entry: 'MainTask',
      hash: 'h-7',
      uuid: 'u-7',
    })).toEqual({
      task_id: 7,
      entry: 'MainTask',
      hash: 'h-7',
      uuid: 'u-7',
    })
  })

  it('dispatches sub task starting/terminal events and keeps root task internal only', () => {
    const pushActiveTask = vi.fn()
    const popActiveTask = vi.fn()
    const setSubTaskParent = vi.fn()
    const onSubTaskStarting = vi.fn()
    const onSubTaskTerminal = vi.fn()

    const context: TaskLifecycleMetaEventContext = {
      rootTaskId: 1,
      peekActiveTask: () => 1,
      pushActiveTask,
      popActiveTask,
      setSubTaskParent,
      onSubTaskStarting,
      onSubTaskTerminal,
    }

    handleTaskLifecycleMetaEvent(
      context,
      parseMaaMessageMeta('Tasker.Task.Starting'),
      2,
      { task_id: 2 },
      'Tasker.Task.Starting',
      '2026-04-08 01:00:00.001',
    )

    expect(setSubTaskParent).toHaveBeenCalledWith(2, 1)
    expect(pushActiveTask).toHaveBeenCalledWith(2)
    expect(onSubTaskStarting).toHaveBeenCalledTimes(1)
    expect(onSubTaskStarting).toHaveBeenCalledWith(
      2,
      { task_id: 2 },
      'Tasker.Task.Starting',
      '2026-04-08 01:00:00.001',
    )

    handleTaskLifecycleMetaEvent(
      context,
      parseMaaMessageMeta('Tasker.Task.Succeeded'),
      2,
      { task_id: 2 },
      'Tasker.Task.Succeeded',
      '2026-04-08 01:00:00.002',
    )

    expect(popActiveTask).toHaveBeenCalledWith(2)
    expect(onSubTaskTerminal).toHaveBeenCalledTimes(1)
    expect(onSubTaskTerminal.mock.calls[0][0]).toBe(2)
    expect(onSubTaskTerminal.mock.calls[0][4]).toBe('Succeeded')

    // Root task lifecycle should update active stack but should not invoke sub-task callbacks.
    handleTaskLifecycleMetaEvent(
      context,
      parseMaaMessageMeta('Tasker.Task.Starting'),
      1,
      { task_id: 1 },
      'Tasker.Task.Starting',
      '2026-04-08 01:00:00.003',
    )
    expect(onSubTaskStarting).toHaveBeenCalledTimes(1)
  })

  it('ignores non-task lifecycle messages and unknown phases', () => {
    const onSubTaskStarting = vi.fn()
    const context: TaskLifecycleMetaEventContext = {
      rootTaskId: 1,
      peekActiveTask: () => 1,
      pushActiveTask: vi.fn(),
      popActiveTask: vi.fn(),
      setSubTaskParent: vi.fn(),
      onSubTaskStarting,
      onSubTaskTerminal: vi.fn(),
    }

    handleTaskLifecycleMetaEvent(
      context,
      parseMaaMessageMeta('Node.NextList.Starting'),
      2,
      { task_id: 2 },
      'Node.NextList.Starting',
      '2026-04-08 01:00:00.100',
    )
    handleTaskLifecycleMetaEvent(
      context,
      parseMaaMessageMeta('Tasker.Task.Custom'),
      2,
      { task_id: 2 },
      'Tasker.Task.Custom',
      '2026-04-08 01:00:00.101',
    )

    expect(onSubTaskStarting).not.toHaveBeenCalled()
  })
})
