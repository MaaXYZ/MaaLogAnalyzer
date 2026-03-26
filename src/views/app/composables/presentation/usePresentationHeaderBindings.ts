import { computed, h, type Ref } from 'vue'
import { BulbOutlined, BulbFilled, InfoCircleOutlined, SettingOutlined } from '@vicons/antd'
import type { DropdownMixedOption } from 'naive-ui/es/dropdown/src/interface'
import { useHeaderBarBindings } from '../useHeaderBarBindings'
import type {
  UseAppPresentationBindingsOptions,
} from './types'

interface UsePresentationHeaderBindingsOptions {
  propsIsDark: Ref<boolean>
  onToggleTheme: () => void
  isMobile: UseAppPresentationBindingsOptions['isMobile']
  isVscodeLaunchEmbed: boolean
  showProcessThreadFilters: boolean
  viewMode: UseAppPresentationBindingsOptions['viewMode']
  viewModeOptions: UseAppPresentationBindingsOptions['viewModeOptions']
  currentViewLabel: UseAppPresentationBindingsOptions['currentViewLabel']
  handleViewModeSelect: (key: string) => void
  selectedProcessId: UseAppPresentationBindingsOptions['selectedProcessId']
  selectedThreadId: UseAppPresentationBindingsOptions['selectedThreadId']
  processIdOptions: UseAppPresentationBindingsOptions['processIdOptions']
  threadIdOptions: UseAppPresentationBindingsOptions['threadIdOptions']
  clearFilters: () => void
  showTaskDrawer: UseAppPresentationBindingsOptions['showTaskDrawer']
  showSettingsModal: UseAppPresentationBindingsOptions['showSettingsModal']
  showAboutModal: UseAppPresentationBindingsOptions['showAboutModal']
}

export const usePresentationHeaderBindings = (options: UsePresentationHeaderBindingsOptions) => {
  const isDark = computed(() => options.propsIsDark.value)

  const mobileMenuOptions = computed<DropdownMixedOption[]>(() => [
    ...options.viewModeOptions.value.map(opt => ({
      type: 'option' as const,
      label: opt.label,
      key: `view-${opt.key}`,
      icon: opt.icon,
    })),
    { type: 'divider' as const, key: 'd1' },
    { type: 'option' as const, label: '设置', key: 'settings', icon: () => h(SettingOutlined) },
    { type: 'option' as const, label: '关于', key: 'about', icon: () => h(InfoCircleOutlined) },
    ...(!options.isVscodeLaunchEmbed
      ? [{
          type: 'option' as const,
          label: isDark.value ? '浅色模式' : '深色模式',
          key: 'theme',
          icon: () => h(isDark.value ? BulbOutlined : BulbFilled),
        }]
      : []),
  ])

  const handleMobileMenuSelect = (key: string) => {
    if (key.startsWith('view-')) {
      options.handleViewModeSelect(key.replace('view-', ''))
    } else if (key === 'settings') {
      options.showSettingsModal.value = true
    } else if (key === 'about') {
      options.showAboutModal.value = true
    } else if (key === 'theme') {
      options.onToggleTheme()
    }
  }

  const {
    headerBarProps,
    headerBarEventHandlers,
  } = useHeaderBarBindings({
    isMobile: options.isMobile,
    currentViewLabel: options.currentViewLabel,
    viewMode: options.viewMode,
    viewModeOptions: options.viewModeOptions,
    mobileMenuOptions,
    showProcessThreadFilters: options.showProcessThreadFilters,
    selectedProcessId: options.selectedProcessId,
    selectedThreadId: options.selectedThreadId,
    processIdOptions: options.processIdOptions,
    threadIdOptions: options.threadIdOptions,
    isVscodeLaunchEmbed: options.isVscodeLaunchEmbed,
    isDark,
    showTaskDrawer: options.showTaskDrawer,
    showSettingsModal: options.showSettingsModal,
    showAboutModal: options.showAboutModal,
    handleMobileMenuSelect,
    handleViewModeSelect: options.handleViewModeSelect,
    clearFilters: options.clearFilters,
    toggleTheme: options.onToggleTheme,
  })

  return {
    headerBarProps,
    headerBarEventHandlers,
  }
}
