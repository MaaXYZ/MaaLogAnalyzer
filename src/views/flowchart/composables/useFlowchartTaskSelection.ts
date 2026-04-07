import { computed, h, watch, type Ref } from 'vue'
import type { VNodeChild } from 'vue'
import type { SelectOption } from 'naive-ui'
import type { TaskInfo } from '../../../types'
import { findTaskIndex, isSameTask } from '../../../utils/taskIdentity'

type FlowchartTaskOption = SelectOption & {
  status: TaskInfo['status']
}

interface UseFlowchartTaskSelectionOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null | undefined>
  onSelectTask: (task: TaskInfo) => void
}

export const useFlowchartTaskSelection = (options: UseFlowchartTaskSelectionOptions) => {
  const taskOptions = computed<FlowchartTaskOption[]>(() =>
    options.tasks.value.map((task, index) => ({
      label: `#${index + 1} ${task.entry}`,
      value: index,
      status: task.status,
    }))
  )

  const selectedTaskIndex = computed<number | null>(() => {
    const tasks = options.tasks.value
    if (tasks.length === 0) return null
    const externalTask = options.selectedTask.value
    if (!externalTask) return 0
    const index = findTaskIndex(tasks, externalTask)
    return index >= 0 ? index : 0
  })

  const selectedTask = computed<TaskInfo | null>(() =>
    selectedTaskIndex.value != null ? options.tasks.value[selectedTaskIndex.value] ?? null : null
  )

  const renderTaskLabel = (option: FlowchartTaskOption): VNodeChild => {
    const color = option.status === 'succeeded' ? '#18a058' : option.status === 'failed' ? '#d03050' : '#f0a020'
    const label = typeof option.label === 'string' ? option.label : ''
    return h('span', { style: 'display: flex; align-items: center; gap: 6px' }, [
      h('span', {
        style: `width: 8px; height: 8px; border-radius: 50%; background: ${color}; flex-shrink: 0`,
      }),
      h('span', {
        style: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap',
      }, label),
    ])
  }

  // 受控选择：父层 selectedTask 作为单一来源；
  // 若为空/不在当前任务列表中，则主动回写首任务，避免 Process/Flowchart 状态分叉。
  watch(
    [options.tasks, options.selectedTask],
    ([tasks, externalTask]) => {
      if (tasks.length === 0) return
      const externalIndex = externalTask ? findTaskIndex(tasks, externalTask) : -1
      if (externalIndex >= 0) return

      const fallbackTask = tasks[0]
      if (!externalTask || !isSameTask(externalTask, fallbackTask)) {
        options.onSelectTask(fallbackTask)
      }
    },
    { immediate: true },
  )

  const handleUserTaskSelect = (index: number | null) => {
    if (index == null) return
    if (index < 0 || index >= options.tasks.value.length) return
    const task = options.tasks.value[index]
    if (!task) return
    const currentIndex = selectedTaskIndex.value
    if (currentIndex === index) return
    options.onSelectTask(task)
  }

  return {
    selectedTaskIndex,
    taskOptions,
    selectedTask,
    renderTaskLabel,
    handleUserTaskSelect,
  }
}
