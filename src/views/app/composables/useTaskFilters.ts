import { computed, ref, watch, type Ref } from 'vue'
import type { TaskInfo } from '../../../types'
import type { LogParser } from '../../../utils/logParser'
import { isSameTask } from '../../../utils/taskIdentity'

interface UseTaskFiltersOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  parser: Pick<LogParser, 'getTaskProcessId' | 'getTaskThreadId' | 'getProcessIds' | 'getThreadIds'>
  onSelectTask: (task: TaskInfo) => void
  onClearSelection: () => void
}

export const useTaskFilters = (options: UseTaskFiltersOptions) => {
  const selectedProcessId = ref<string>('')
  const selectedThreadId = ref<string>('')
  const availableProcessIds = ref<string[]>([])
  const availableThreadIds = ref<string[]>([])

  const clearRuntimeFilters = () => {
    selectedProcessId.value = ''
    selectedThreadId.value = ''
  }

  const clearFilters = () => {
    clearRuntimeFilters()
  }

  const filteredTasks = computed(() => {
    return options.tasks.value.filter(task => {
      if (selectedProcessId.value !== '') {
        const processId = options.parser.getTaskProcessId(task.task_id)
        if (processId !== selectedProcessId.value) return false
      }
      if (selectedThreadId.value !== '') {
        const threadId = options.parser.getTaskThreadId(task.task_id)
        if (threadId !== selectedThreadId.value) return false
      }
      return true
    })
  })

  const processIdOptions = computed(() => {
    let validProcessIds = availableProcessIds.value

    if (selectedThreadId.value !== '') {
      validProcessIds = validProcessIds.filter(processId => {
        return options.tasks.value.some(task => {
          const taskProcessId = options.parser.getTaskProcessId(task.task_id)
          const taskThreadId = options.parser.getTaskThreadId(task.task_id)
          return taskProcessId === processId && taskThreadId === selectedThreadId.value
        })
      })
    }

    return [
      { label: '全部进程', value: '' },
      ...validProcessIds.map(id => ({
        label: `进程: ${id}`,
        value: id,
      })),
    ]
  })

  const threadIdOptions = computed(() => {
    let validThreadIds = availableThreadIds.value

    if (selectedProcessId.value !== '') {
      validThreadIds = validThreadIds.filter(threadId => {
        return options.tasks.value.some(task => {
          const taskProcessId = options.parser.getTaskProcessId(task.task_id)
          const taskThreadId = options.parser.getTaskThreadId(task.task_id)
          return taskThreadId === threadId && taskProcessId === selectedProcessId.value
        })
      })
    }

    return [
      { label: '全部线程', value: '' },
      ...validThreadIds.map(id => ({
        label: `线程: ${id}`,
        value: id,
      })),
    ]
  })

  const refreshAvailableTaskIds = () => {
    availableProcessIds.value = options.parser.getProcessIds()
    availableThreadIds.value = options.parser.getThreadIds()
  }

  const resetAvailableTaskIds = () => {
    availableProcessIds.value = []
    availableThreadIds.value = []
  }

  watch(filteredTasks, (newTasks) => {
    const selectedTask = options.selectedTask.value
    if (!selectedTask) return

    if (!newTasks.find(task => isSameTask(task, selectedTask))) {
      if (newTasks.length > 0) {
        options.onSelectTask(newTasks[0])
      } else {
        options.onClearSelection()
      }
    }
  })

  return {
    selectedProcessId,
    selectedThreadId,
    availableProcessIds,
    availableThreadIds,
    filteredTasks,
    processIdOptions,
    threadIdOptions,
    clearFilters,
    clearRuntimeFilters,
    refreshAvailableTaskIds,
    resetAvailableTaskIds,
  }
}
