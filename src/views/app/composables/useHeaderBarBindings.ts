import { computed, type ComputedRef, type Ref } from 'vue'
import type { ViewModeOptionLike } from './presentation/types'

interface UseHeaderBarBindingsOptions {
  isMobile: Ref<boolean>
  currentViewLabel: Ref<string>
  viewMode: Ref<string>
  viewModeOptions: Ref<ViewModeOptionLike[]>
  mobileMenuOptions: Ref<Array<Record<string, unknown>>>
  showProcessThreadFilters: boolean
  selectedProcessId: Ref<string>
  selectedThreadId: Ref<string>
  processIdOptions: Ref<Array<Record<string, unknown>>>
  threadIdOptions: Ref<Array<Record<string, unknown>>>
  isVscodeLaunchEmbed: boolean
  isDark: ComputedRef<boolean>
  showTaskDrawer: Ref<boolean>
  showSettingsModal: Ref<boolean>
  showAboutModal: Ref<boolean>
  handleMobileMenuSelect: (key: string) => void
  handleViewModeSelect: (key: string) => void
  clearFilters: () => void
  toggleTheme: () => void
}

export const useHeaderBarBindings = (options: UseHeaderBarBindingsOptions) => {
  const headerBarProps = computed(() => ({
    isMobile: options.isMobile.value,
    currentViewLabel: options.currentViewLabel.value,
    viewMode: options.viewMode.value,
    viewModeOptions: options.viewModeOptions.value,
    mobileMenuOptions: options.mobileMenuOptions.value,
    showProcessThreadFilters: options.showProcessThreadFilters,
    selectedProcessId: options.selectedProcessId.value,
    selectedThreadId: options.selectedThreadId.value,
    processIdOptions: options.processIdOptions.value,
    threadIdOptions: options.threadIdOptions.value,
    isVscodeLaunchEmbed: options.isVscodeLaunchEmbed,
    isDark: options.isDark.value,
  }))

  const headerBarEventHandlers = {
    'open-task-drawer': () => { options.showTaskDrawer.value = true },
    'select-mobile-menu': options.handleMobileMenuSelect,
    'select-view-mode': options.handleViewModeSelect,
    'update:selected-process-id': (value: string) => { options.selectedProcessId.value = value },
    'update:selected-thread-id': (value: string) => { options.selectedThreadId.value = value },
    'clear-filters': options.clearFilters,
    'open-settings': () => { options.showSettingsModal.value = true },
    'open-about': () => { options.showAboutModal.value = true },
    'toggle-theme': options.toggleTheme,
  }

  return {
    headerBarProps,
    headerBarEventHandlers,
  }
}
