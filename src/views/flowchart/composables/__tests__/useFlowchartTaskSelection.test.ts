import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { TaskInfo } from '../../../../types'
import { useFlowchartTaskSelection } from '../useFlowchartTaskSelection'

const makeTask = (params: {
  taskId: number
  entry: string
  uuid: string
  startTime: string
}): TaskInfo => ({
  task_id: params.taskId,
  entry: params.entry,
  hash: `h-${params.taskId}`,
  uuid: params.uuid,
  start_time: params.startTime,
  status: 'succeeded',
  nodes: [],
  events: [],
})

describe('useFlowchartTaskSelection', () => {
  it('remaps selection by task identity when task list order changes', async () => {
    const task1 = makeTask({ taskId: 1, entry: 'Task1', uuid: 'u-1', startTime: '2026-04-07 10:00:00.001' })
    const task2 = makeTask({ taskId: 2, entry: 'Task2', uuid: 'u-2', startTime: '2026-04-07 10:00:00.002' })
    const task3 = makeTask({ taskId: 3, entry: 'Task3', uuid: 'u-3', startTime: '2026-04-07 10:00:00.003' })
    const tasks = ref<TaskInfo[]>([task1, task2, task3])
    const initialTask = ref<TaskInfo | null>(null)
    const onSelectTask = vi.fn()

    const selection = useFlowchartTaskSelection({
      tasks,
      initialTask,
      onSelectTask,
    })

    await nextTick()
    expect(selection.selectedTaskIndex.value).toBe(0)
    expect(selection.selectedTask.value?.task_id).toBe(task1.task_id)

    selection.handleUserTaskSelect(2)
    await nextTick()
    expect(selection.selectedTaskIndex.value).toBe(2)
    expect(selection.selectedTask.value?.task_id).toBe(task3.task_id)

    tasks.value = [task3, task1, task2]
    await nextTick()

    expect(selection.selectedTaskIndex.value).toBe(0)
    expect(selection.selectedTask.value?.task_id).toBe(task3.task_id)
    expect(onSelectTask).toHaveBeenCalledTimes(1)
    expect(onSelectTask).toHaveBeenLastCalledWith(task3)
  })

  it('prioritizes external initialTask when it is resolvable', async () => {
    const task1 = makeTask({ taskId: 1, entry: 'Task1', uuid: 'u-1', startTime: '2026-04-07 10:00:00.001' })
    const task2 = makeTask({ taskId: 2, entry: 'Task2', uuid: 'u-2', startTime: '2026-04-07 10:00:00.002' })
    const task3 = makeTask({ taskId: 3, entry: 'Task3', uuid: 'u-3', startTime: '2026-04-07 10:00:00.003' })
    const tasks = ref<TaskInfo[]>([task1, task2, task3])
    const initialTask = ref<TaskInfo | null>(null)

    const selection = useFlowchartTaskSelection({
      tasks,
      initialTask,
      onSelectTask: vi.fn(),
    })

    await nextTick()
    selection.handleUserTaskSelect(2)
    await nextTick()
    expect(selection.selectedTask.value?.task_id).toBe(task3.task_id)

    initialTask.value = task2
    await nextTick()
    expect(selection.selectedTaskIndex.value).toBe(1)
    expect(selection.selectedTask.value?.task_id).toBe(task2.task_id)
  })

  it('ignores out-of-range manual task index updates', async () => {
    const task1 = makeTask({ taskId: 1, entry: 'Task1', uuid: 'u-1', startTime: '2026-04-07 10:00:00.001' })
    const task2 = makeTask({ taskId: 2, entry: 'Task2', uuid: 'u-2', startTime: '2026-04-07 10:00:00.002' })
    const tasks = ref<TaskInfo[]>([task1, task2])
    const initialTask = ref<TaskInfo | null>(null)
    const onSelectTask = vi.fn()

    const selection = useFlowchartTaskSelection({
      tasks,
      initialTask,
      onSelectTask,
    })

    await nextTick()
    selection.handleUserTaskSelect(99)
    await nextTick()

    expect(selection.selectedTaskIndex.value).toBe(0)
    expect(selection.selectedTask.value?.task_id).toBe(task1.task_id)
    expect(onSelectTask).not.toHaveBeenCalled()
  })
})
