import { ref, watch, type Ref } from 'vue'
import { layoutResetGeneration, PROCESS_LAYOUT_STORAGE_KEY } from '../../../utils/layoutPersistence'

interface ProcessLayoutState {
  taskListCollapsed?: boolean
  taskListSize?: number
  taskListSavedSize?: number
  nodeNavCollapsed?: boolean
  nodeNavSize?: number
  nodeNavSavedSize?: number
}

const clampLayoutSize = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export const isPersistedLayoutCollapsed = (value: unknown) => value === true

const readProcessLayoutState = (): ProcessLayoutState => {
  try {
    const raw = localStorage.getItem(PROCESS_LAYOUT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ProcessLayoutState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveProcessLayoutState = (state: ProcessLayoutState) => {
  try {
    localStorage.setItem(PROCESS_LAYOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore write errors
  }
}

const getNodeNavDefaultSize = (
  taskCollapsed: boolean,
  detailCollapsed: boolean,
  displayMode: string,
) => {
  if (taskCollapsed && detailCollapsed) {
    return displayMode === 'detailed' ? 0.12 : 0.2
  }
  return displayMode === 'detailed' ? 0.2 : 0.35
}

export const useProcessLayout = (options: {
  detailViewCollapsed: Ref<boolean | undefined>
  displayMode: Ref<string>
}) => {
  const processLayoutState = readProcessLayoutState()

  const taskListCollapsed = ref(isPersistedLayoutCollapsed(processLayoutState.taskListCollapsed))
  const taskListSize = ref(
    taskListCollapsed.value ? 0 : clampLayoutSize(processLayoutState.taskListSize, 0, 0.4, 0.25),
  )
  const taskListSavedSize = ref(
    clampLayoutSize(processLayoutState.taskListSavedSize, 0.05, 0.4, 0.25),
  )

  const nodeNavCollapsed = ref(isPersistedLayoutCollapsed(processLayoutState.nodeNavCollapsed))
  const nodeNavSize = ref(
    nodeNavCollapsed.value ? 0 : clampLayoutSize(processLayoutState.nodeNavSize, 0, 0.4, 0.2),
  )
  const nodeNavSavedSize = ref(clampLayoutSize(processLayoutState.nodeNavSavedSize, 0.05, 0.4, 0.2))

  const toggleTaskList = () => {
    if (taskListCollapsed.value) {
      taskListSize.value = taskListSavedSize.value
      taskListCollapsed.value = false
    } else {
      taskListSavedSize.value = taskListSize.value
      taskListSize.value = 0
      taskListCollapsed.value = true
    }
  }

  const toggleNodeNav = () => {
    if (nodeNavCollapsed.value) {
      nodeNavSize.value = nodeNavSavedSize.value
      nodeNavCollapsed.value = false
    } else {
      nodeNavSavedSize.value = nodeNavSize.value
      nodeNavSize.value = 0
      nodeNavCollapsed.value = true
    }
  }

  watch(options.detailViewCollapsed, (detailCollapsed) => {
    if (!taskListCollapsed.value) {
      if (detailCollapsed) {
        taskListSize.value = 0.15
        taskListSavedSize.value = 0.15
      } else {
        taskListSize.value = 0.25
        taskListSavedSize.value = 0.25
      }
    }
  })

  watch(
    [taskListCollapsed, options.detailViewCollapsed, options.displayMode],
    ([taskCollapsed, detailCollapsed, displayMode]) => {
      if (!nodeNavCollapsed.value) {
        const size = getNodeNavDefaultSize(!!taskCollapsed, !!detailCollapsed, displayMode)
        nodeNavSize.value = size
        nodeNavSavedSize.value = size
      }
    },
  )

  watch(
    [
      taskListCollapsed,
      taskListSize,
      taskListSavedSize,
      nodeNavCollapsed,
      nodeNavSize,
      nodeNavSavedSize,
    ],
    ([taskCollapsed, taskSize, taskSaved, navCollapsed, navSize, navSaved]) => {
      saveProcessLayoutState({
        taskListCollapsed: taskCollapsed,
        taskListSize: clampLayoutSize(taskSize, 0, 0.4, 0.25),
        taskListSavedSize: clampLayoutSize(taskSaved, 0.05, 0.4, 0.25),
        nodeNavCollapsed: navCollapsed,
        nodeNavSize: clampLayoutSize(navSize, 0, 0.4, 0.2),
        nodeNavSavedSize: clampLayoutSize(navSaved, 0.05, 0.4, 0.2),
      })
    },
  )

  watch(layoutResetGeneration, () => {
    const navSize = getNodeNavDefaultSize(false, false, options.displayMode.value)
    taskListCollapsed.value = false
    taskListSize.value = 0.25
    taskListSavedSize.value = 0.25
    nodeNavCollapsed.value = false
    nodeNavSize.value = navSize
    nodeNavSavedSize.value = navSize
  })

  return {
    taskListCollapsed,
    taskListSize,
    nodeNavCollapsed,
    nodeNavSize,
    toggleTaskList,
    toggleNodeNav,
  }
}
