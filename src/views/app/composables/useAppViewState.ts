import { computed, h, ref, watch } from 'vue'
import {
  FileSearchOutlined,
  BarChartOutlined,
  ColumnHeightOutlined,
  DashboardOutlined,
  ApartmentOutlined,
  RobotOutlined,
} from '@vicons/antd'
import { resolveEmbedProfile } from '../../../embed/profiles'
import { EMBED_MODE_VSCODE_LAUNCH, parseEmbedMode } from '../../../utils/embedMode'

type ViewMode = 'analysis' | 'search' | 'statistics' | 'flowchart' | 'ai' | 'split'

const APP_LAYOUT_STORAGE_KEY = 'maa-log-analyzer-app-layout'

interface AppLayoutState {
  analysisSplitSize?: number
  splitVerticalSize?: number
}

const clampLayoutValue = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const readAppLayoutState = (): AppLayoutState => {
  try {
    const raw = localStorage.getItem(APP_LAYOUT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as AppLayoutState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveAppLayoutState = (state: AppLayoutState) => {
  try {
    localStorage.setItem(APP_LAYOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore write errors
  }
}

export const useAppViewState = () => {
  const embedMode = typeof window !== 'undefined' ? parseEmbedMode(window.location.search) : null
  const embedProfile = resolveEmbedProfile(embedMode)
  const isEmbeddedContext = typeof window !== 'undefined' && window.parent !== window
  const hasEmbedQueryFlag = typeof window !== 'undefined' && /(?:[?#&])embed=/.test(window.location.href)

  const isVscodeLaunchEmbed = embedProfile.mode === EMBED_MODE_VSCODE_LAUNCH
  const bridgeEnabled = embedProfile.bridgeEnabled
  const tutorialAutoStartEnabled = embedProfile.ui.autoStartTutorial && !isEmbeddedContext && !hasEmbedQueryFlag
  const showProcessThreadFilters = embedProfile.ui.showProcessThreadFilters
  const showRealtimeStatus = embedProfile.ui.showRealtimeStatus
  const showReloadControls = embedProfile.ui.showReloadControls
  const showTextSearchView = embedProfile.ui.showTextSearchView
  const showSplitView = embedProfile.ui.showSplitView
  const appEmbedMode = embedProfile.mode

  const allViewModeOptions = [
    {
      label: '日志分析',
      key: 'analysis' as ViewMode,
      icon: () => h(BarChartOutlined),
    },
    {
      label: '文本搜索',
      key: 'search' as ViewMode,
      icon: () => h(FileSearchOutlined),
    },
    {
      label: '节点统计',
      key: 'statistics' as ViewMode,
      icon: () => h(DashboardOutlined),
    },
    {
      label: '流程图',
      key: 'flowchart' as ViewMode,
      icon: () => h(ApartmentOutlined),
    },
    {
      label: 'AI 分析',
      key: 'ai' as ViewMode,
      icon: () => h(RobotOutlined),
    },
    {
      label: '分屏模式',
      key: 'split' as ViewMode,
      icon: () => h(ColumnHeightOutlined),
    },
  ]

  const viewMode = ref<ViewMode>('analysis')

  const isViewModeEnabled = (mode: ViewMode): boolean => {
    if (mode === 'search') return showTextSearchView
    if (mode === 'split') return showSplitView
    return true
  }

  const viewModeOptions = computed(() => allViewModeOptions.filter(option => isViewModeEnabled(option.key)))

  const currentViewLabel = computed(() => {
    const option = allViewModeOptions.find(opt => opt.key === viewMode.value)
    return option?.label || '视图'
  })

  const handleViewModeSelect = (key: string) => {
    viewMode.value = key as ViewMode
  }

  const appLayoutState = readAppLayoutState()
  const splitSize = ref(clampLayoutValue(appLayoutState.analysisSplitSize, 0.4, 1, 0.65))
  const splitVerticalSize = ref(clampLayoutValue(appLayoutState.splitVerticalSize, 0.2, 0.8, 0.5))
  const detailViewCollapsed = ref(false)
  const detailViewSavedSize = ref(0.6)

  const toggleDetailView = () => {
    if (detailViewCollapsed.value) {
      splitSize.value = detailViewSavedSize.value
      detailViewCollapsed.value = false
    } else {
      detailViewSavedSize.value = splitSize.value
      splitSize.value = 1
      detailViewCollapsed.value = true
    }
  }

  watch([splitSize, detailViewCollapsed, splitVerticalSize], ([currentSplitSize, collapsed, currentVerticalSize]) => {
    const prev = readAppLayoutState()
    const next: AppLayoutState = {
      ...prev,
      splitVerticalSize: clampLayoutValue(currentVerticalSize, 0.2, 0.8, 0.5),
    }

    if (!collapsed) {
      next.analysisSplitSize = clampLayoutValue(currentSplitSize, 0.4, 1, 0.65)
    }

    saveAppLayoutState(next)
  })

  return {
    isVscodeLaunchEmbed,
    bridgeEnabled,
    tutorialAutoStartEnabled,
    showProcessThreadFilters,
    showRealtimeStatus,
    showReloadControls,
    showTextSearchView,
    showSplitView,
    appEmbedMode,
    viewMode,
    viewModeOptions,
    currentViewLabel,
    handleViewModeSelect,
    splitSize,
    splitVerticalSize,
    detailViewCollapsed,
    toggleDetailView,
  }
}
