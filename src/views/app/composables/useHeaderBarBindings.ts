import { computed, type ComputedRef, type Ref } from 'vue'
import type { ViewModeOptionLike } from './presentation/types'

interface UseHeaderBarBindingsOptions {
  isMobile: Ref<boolean>
  currentViewLabel: Ref<string>
  viewMode: Ref<string>
  viewModeOptions: Ref<ViewModeOptionLike[]>
  mobileMenuOptions: Ref<Array<Record<string, unknown>>>
  isVscodeLaunchEmbed: boolean
  isDark: ComputedRef<boolean>
  showTaskDrawer: Ref<boolean>
  showSettingsModal: Ref<boolean>
  showAboutModal: Ref<boolean>
  handleMobileMenuSelect: (key: string) => void
  handleViewModeSelect: (key: string) => void
  toggleTheme: () => void
}

export const useHeaderBarBindings = (options: UseHeaderBarBindingsOptions) => {
  const headerBarProps = computed(() => ({
    isMobile: options.isMobile.value,
    currentViewLabel: options.currentViewLabel.value,
    viewMode: options.viewMode.value,
    viewModeOptions: options.viewModeOptions.value,
    mobileMenuOptions: options.mobileMenuOptions.value,
    isVscodeLaunchEmbed: options.isVscodeLaunchEmbed,
    isDark: options.isDark.value,
  }))

  const headerBarEventHandlers = {
    'open-task-drawer': () => {
      options.showTaskDrawer.value = true
    },
    'select-mobile-menu': options.handleMobileMenuSelect,
    'select-view-mode': options.handleViewModeSelect,
    'open-settings': () => {
      options.showSettingsModal.value = true
    },
    'open-about': () => {
      options.showAboutModal.value = true
    },
    'toggle-theme': options.toggleTheme,
  }

  return {
    headerBarProps,
    headerBarEventHandlers,
  }
}
