import { computed, h, ref, watch, type Ref } from 'vue'
import type { VNodeChild } from 'vue'
import type { SelectOption } from 'naive-ui'
import type { TaskInfo } from '../../../types'

type FlowchartTaskOption = SelectOption & {
  status: TaskInfo['status']
}

interface UseFlowchartTaskSelectionOptions {
  tasks: Ref<TaskInfo[]>
  initialTask: Ref<TaskInfo | null | undefined>
  onSelectTask: (task: TaskInfo) => void
}

const findTaskIndex = (tasks: TaskInfo[], task: TaskInfo): number => {
  // 1) 优先使用对象引用，避免重复 task_id 时跳到同 id 的第一个任务
  const byRef = tasks.findIndex(t => t === task)
  if (byRef >= 0) return byRef

  // 2) uuid 在大多数日志中唯一，作为第二匹配条件
  if (task.uuid) {
    const byUuid = tasks.findIndex(t => t.uuid === task.uuid)
    if (byUuid >= 0) return byUuid
  }

  // 3) 回退到复合键，减少仅 task_id 匹配的歧义
  return tasks.findIndex(t =>
    t.task_id === task.task_id
    && t.start_time === task.start_time
    && t.entry === task.entry
  )
}

export const useFlowchartTaskSelection = (options: UseFlowchartTaskSelectionOptions) => {
  const selectedTaskIndex = ref<number | null>(null)

  const taskOptions = computed<FlowchartTaskOption[]>(() =>
    options.tasks.value.map((task, index) => ({
      label: `#${index + 1} ${task.entry}`,
      value: index,
      status: task.status,
    }))
  )

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

  // 同步任务列表与外部 initialTask：
  // - 优先对齐父组件传入的任务
  // - 无法对齐时才回退到第一个任务
  watch(
    [options.tasks, options.initialTask],
    ([tasks, initialTask]) => {
      if (tasks.length === 0) {
        selectedTaskIndex.value = null
        return
      }

      if (initialTask) {
        const index = findTaskIndex(tasks, initialTask)
        if (index >= 0) {
          selectedTaskIndex.value = index
          return
        }
      }

      if (selectedTaskIndex.value == null || selectedTaskIndex.value >= tasks.length) {
        selectedTaskIndex.value = 0
      }
    },
    { immediate: true },
  )

  const handleUserTaskSelect = (index: number | null) => {
    if (index == null) return
    selectedTaskIndex.value = index
    const task = options.tasks.value[index]
    if (task) options.onSelectTask(task)
  }

  return {
    selectedTaskIndex,
    taskOptions,
    selectedTask,
    renderTaskLabel,
    handleUserTaskSelect,
  }
}
