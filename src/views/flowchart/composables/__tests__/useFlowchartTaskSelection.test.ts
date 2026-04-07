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
    const selectedTask = ref<TaskInfo | null>(null)
    const onSelectTask = vi.fn((task: TaskInfo) => {
      selectedTask.value = task
    })

    const selection = useFlowchartTaskSelection({
      tasks,
      selectedTask,
      onSelectTask,
    })

    await nextTick()
    expect(selection.selectedTaskIndex.value).toBe(0)
    expect(selection.selectedTask.value?.task_id).toBe(task1.task_id)
    expect(selectedTask.value?.task_id).toBe(task1.task_id)
    expect(onSelectTask).toHaveBeenCalledTimes(1)

    selection.handleUserTaskSelect(2)
    await nextTick()
    expect(selection.selectedTaskIndex.value).toBe(2)
    expect(selection.selectedTask.value?.task_id).toBe(task3.task_id)

    tasks.value = [task3, task1, task2]
    await nextTick()

    expect(selection.selectedTaskIndex.value).toBe(0)
    expect(selection.selectedTask.value?.task_id).toBe(task3.task_id)
    expect(onSelectTask).toHaveBeenCalledTimes(2)
    expect(onSelectTask).toHaveBeenLastCalledWith(task3)
  })

  it('prioritizes external selectedTask when it is resolvable', async () => {
    const task1 = makeTask({ taskId: 1, entry: 'Task1', uuid: 'u-1', startTime: '2026-04-07 10:00:00.001' })
    const task2 = makeTask({ taskId: 2, entry: 'Task2', uuid: 'u-2', startTime: '2026-04-07 10:00:00.002' })
    const task3 = makeTask({ taskId: 3, entry: 'Task3', uuid: 'u-3', startTime: '2026-04-07 10:00:00.003' })
    const tasks = ref<TaskInfo[]>([task1, task2, task3])
    const selectedTask = ref<TaskInfo | null>(null)

    const selection = useFlowchartTaskSelection({
      tasks,
      selectedTask,
      onSelectTask: (task) => {
        selectedTask.value = task
      },
    })

    await nextTick()
    selection.handleUserTaskSelect(2)
    await nextTick()
    expect(selection.selectedTask.value?.task_id).toBe(task3.task_id)

    selectedTask.value = task2
    await nextTick()
    expect(selection.selectedTaskIndex.value).toBe(1)
    expect(selection.selectedTask.value?.task_id).toBe(task2.task_id)
  })

  it('ignores out-of-range manual task index updates', async () => {
    const task1 = makeTask({ taskId: 1, entry: 'Task1', uuid: 'u-1', startTime: '2026-04-07 10:00:00.001' })
    const task2 = makeTask({ taskId: 2, entry: 'Task2', uuid: 'u-2', startTime: '2026-04-07 10:00:00.002' })
    const tasks = ref<TaskInfo[]>([task1, task2])
    const selectedTask = ref<TaskInfo | null>(null)
    const onSelectTask = vi.fn((task: TaskInfo) => {
      selectedTask.value = task
    })

    const selection = useFlowchartTaskSelection({
      tasks,
      selectedTask,
      onSelectTask,
    })

    await nextTick()
    selection.handleUserTaskSelect(99)
    await nextTick()

    expect(selection.selectedTaskIndex.value).toBe(0)
    expect(selection.selectedTask.value?.task_id).toBe(task1.task_id)
    expect(onSelectTask).toHaveBeenCalledTimes(1)
    expect(onSelectTask).toHaveBeenLastCalledWith(task1)
  })

  it('falls back to first task when external selectedTask becomes unresolvable', async () => {
    const task1 = makeTask({ taskId: 1, entry: 'Task1', uuid: 'u-1', startTime: '2026-04-07 10:00:00.001' })
    const task2 = makeTask({ taskId: 2, entry: 'Task2', uuid: 'u-2', startTime: '2026-04-07 10:00:00.002' })
    const task3 = makeTask({ taskId: 3, entry: 'Task3', uuid: 'u-3', startTime: '2026-04-07 10:00:00.003' })
    const tasks = ref<TaskInfo[]>([task1, task2, task3])
    const selectedTask = ref<TaskInfo | null>(task3)
    const onSelectTask = vi.fn((task: TaskInfo) => {
      selectedTask.value = task
    })

    const selection = useFlowchartTaskSelection({
      tasks,
      selectedTask,
      onSelectTask,
    })

    await nextTick()
    expect(selection.selectedTask.value?.task_id).toBe(task3.task_id)

    tasks.value = [task1, task2]
    await nextTick()

    expect(selection.selectedTaskIndex.value).toBe(0)
    expect(selection.selectedTask.value?.task_id).toBe(task1.task_id)
    expect(onSelectTask).toHaveBeenCalledTimes(1)
    expect(onSelectTask).toHaveBeenLastCalledWith(task1)
  })
})
