import { computed, ref, type Ref } from 'vue'

interface UseAppUiStateOptions {
  isMobile: Ref<boolean>
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

  const openMobileDetailDrawer = () => {
    if (options.isMobile.value) {
      showDetailDrawer.value = true
    }
  }

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
    openMobileDetailDrawer,
  }
}
