import { computed, type Ref } from 'vue'
import type { TaskInfo, NodeInfo, UnifiedFlowItem } from '../../../types'
import { useTaskSelection } from './useTaskSelection'
import { useAppUiState } from './useAppUiState'
import { useParsedTaskState } from './useParsedTaskState'

interface UseAppSelectionAndFiltersOptions {
  isMobile: Ref<boolean>
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  pendingScrollNodeId: Ref<number | null>
  buildNodeFlowItems: (node: NodeInfo) => UnifiedFlowItem[]
  buildNodeRecognitionFlowItems: (node: NodeInfo) => UnifiedFlowItem[]
  afterSelect?: () => void
}

export const useAppSelectionAndFilters = (options: UseAppSelectionAndFiltersOptions) => {
  const {
    showTaskDrawer,
    showDetailDrawer,
    showAboutModal,
    showSettingsModal,
    showFileLoadingModal,
    modalWidth,
    modalWidthSmall,
    handleFileLoadingStart,
    handleFileLoadingEnd,
    openMobileDetailDrawer,
  } = useAppUiState({
    isMobile: options.isMobile,
  })

  const {
    hasFlowItemId,
    resetSelectionState,
    handleSelectTask,
    handleSelectNode,
    handleSelectAction,
    handleSelectRecognition,
    handleSelectFlowItem,
  } = useTaskSelection({
    selectedTask: options.selectedTask,
    selectedNode: options.selectedNode,
    selectedFlowItemId: options.selectedFlowItemId,
    pendingScrollNodeId: options.pendingScrollNodeId,
    buildNodeFlowItems: options.buildNodeFlowItems,
    buildNodeRecognitionFlowItems: options.buildNodeRecognitionFlowItems,
    afterSelect: () => {
      options.afterSelect?.()
      openMobileDetailDrawer()
    },
  })

  const handleMobileSelectTask = (task: TaskInfo) => {
    handleSelectTask(task)
    showTaskDrawer.value = false
  }

  const filteredTasks = computed(() => options.tasks.value)
  const refreshAvailableTaskIds = () => {}
  const resetAvailableTaskIds = () => {}

  const {
    resetAnalysisState,
    applyParsedTasks,
  } = useParsedTaskState({
    tasks: options.tasks,
    selectedTask: options.selectedTask,
    selectedNode: options.selectedNode,
    selectedFlowItemId: options.selectedFlowItemId,
    hasFlowItemId,
    resetSelectionState,
    refreshAvailableTaskIds,
    resetAvailableTaskIds,
  })

  return {
    handleSelectTask,
    handleSelectNode,
    handleSelectAction,
    handleSelectRecognition,
    handleSelectFlowItem,
    showTaskDrawer,
    showDetailDrawer,
    showAboutModal,
    showSettingsModal,
    showFileLoadingModal,
    modalWidth,
    modalWidthSmall,
    handleFileLoadingStart,
    handleFileLoadingEnd,
    handleMobileSelectTask,
    filteredTasks,
    refreshAvailableTaskIds,
    resetAvailableTaskIds,
    resetAnalysisState,
    applyParsedTasks,
  }
}
