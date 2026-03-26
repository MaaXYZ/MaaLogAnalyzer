import { computed, ref, watch, type Ref } from 'vue'
import type { NodeInfo, TaskInfo } from '../../../types'

interface UseAppUiStateOptions {
  isMobile: Ref<boolean>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  onSelectTask: (task: TaskInfo) => void
}

export const useAppUiState = (options: UseAppUiStateOptions) => {
  const showTaskDrawer = ref(false)
  const showDetailDrawer = ref(false)
  const showAboutModal = ref(false)
  const showSettingsModal = ref(false)
  const showFileLoadingModal = ref(false)

  const modalWidth = computed(() => options.isMobile.value ? '90vw' : '600px')
  const modalWidthSmall = computed(() => options.isMobile.value ? '90vw' : '500px')

  const handleFileLoadingStart = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    showFileLoadingModal.value = true
  }

  const handleFileLoadingEnd = () => {
    showFileLoadingModal.value = false
  }

  const handleMobileSelectTask = (task: TaskInfo) => {
    options.onSelectTask(task)
    showTaskDrawer.value = false
  }

  watch(
    [
      options.selectedNode,
      options.selectedFlowItemId,
    ],
    () => {
      if (options.isMobile.value && options.selectedNode.value) {
        showDetailDrawer.value = true
      }
    },
  )

  return {
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
  }
}
