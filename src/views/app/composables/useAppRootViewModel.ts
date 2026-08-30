import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { version } from '../../../../package.json'
import { getErrorMessage } from '../../../utils/errorHandler'
import { useIsMobile } from '../../../composables/useIsMobile'
import {
  buildNodeFlowItems,
  buildNodeRecognitionFlowItems,
} from '@windsland52/maa-log-parser/node-flow'
import { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION } from '../../../tutorial/steps'
import type { NodeInfo, TaskInfo } from '../../../types'
import { LogParser } from '@windsland52/maa-log-parser'
import { BRIDGE_THEME_UPDATED_EVENT } from '../../../utils/bridgeEvents'
import { isVSCode } from '../../../utils/platform'
import { useHostFileMessageReceiver } from '../../process/composables/fileLoader/useVSCodeBridge'
import { useTextSearchTargets } from './useTextSearchTargets'
import { useTextSearchBridge } from './useTextSearchBridge'
import { provideTextSearchSharedViewModel } from '../../textSearch/composables/viewModel/sharedModel'
import { useAppViewState } from './useAppViewState'
import { useAppSelectionAndFilters } from './useAppSelectionAndFilters'
import { useParserDebugAssets } from './useParserDebugAssets'
import { useMainContentBindings } from './useMainContentBindings'
import { useAppRuntimeOrchestration } from './useAppRuntimeOrchestration'
import type { RealtimeSessionState } from './useRealtimeSession'
import { useAppWorkflowBindings } from './useAppWorkflowBindings'
import { usePresentationHeaderBindings } from './presentation/usePresentationHeaderBindings'
import { usePresentationMainContentBindings } from './presentation/usePresentationMainContentBindings'
import {
  asRecord,
  flattenFlowItems,
  toFiniteNumber,
  toPositiveInteger,
  toTrimmedNonEmptyString,
} from '../utils/valueParsers'

interface UseAppRootViewModelOptions {
  propsIsDark: Ref<boolean>
  onToggleTheme: () => void
}

export const useAppRootViewModel = ({ propsIsDark, onToggleTheme }: UseAppRootViewModelOptions) => {
  const { isMobile } = useIsMobile()
  const {
    isVscodeLaunchEmbed,
    bridgeEnabled,
    tutorialAutoStartEnabled,
    showRealtimeStatus,
    showReloadControls,
    showTextSearchView,
    appEmbedMode,
    viewMode,
    viewModeOptions,
    currentViewLabel,
    handleViewModeSelect,
    splitSize,
    splitVerticalSize,
    detailViewCollapsed,
    toggleDetailView,
    ensureDetailViewExpanded,
  } = useAppViewState()
  const parser = new LogParser()

  const tasks = shallowRef<TaskInfo[]>([])
  const selectedTask = shallowRef<TaskInfo | null>(null)
  const selectedNode = shallowRef<NodeInfo | null>(null)
  const selectedFlowItemId = ref<string | null>(null)
  const loading = ref(false)
  const pendingScrollNodeId = ref<number | null>(null)
  const followLast = ref(true)
  const parseProgress = ref(0)
  const showParsingModal = ref(false)

  const { resetParserDebugAssets } = useParserDebugAssets({ parser })

  const {
    textSearchLoadedTargets,
    textSearchLoadedDefaultTargetId,
    hasDeferredTextSearchTargets,
    setTextSearchLoadedTargets,
    pickPreferredLogTargetId,
    clearDeferredTextSearchTargets,
    ensureTextSearchTargetsHydrated,
    ensureDeferredTargetContent,
    findDeferredTargetWithContent,
    setDeferredTextSearchTargets,
  } = useTextSearchTargets()

  const shouldMaintainRealtimeTextTargets = showTextSearchView

  // 文本搜索 view model 在根部创建唯一一份并 provide：
  // 独立页与分屏共用同一状态（查询/结果/目标同步），懒加载策略也只在这一处生效
  provideTextSearchSharedViewModel({
    loadedTargets: textSearchLoadedTargets as unknown as Ref<
      { id: string; label: string; fileName: string; content: string }[] | undefined
    >,
    loadedDefaultTargetId: textSearchLoadedDefaultTargetId as unknown as Ref<string | undefined>,
    hasDeferredLoadedTargets: hasDeferredTextSearchTargets as unknown as Ref<boolean | undefined>,
    ensureLoadedTargets: ensureTextSearchTargetsHydrated as unknown as Ref<
      (() => Promise<void>) | undefined
    >,
    ensureTargetContentLoaded: ensureDeferredTargetContent,
    findTargetContainingLocate: findDeferredTargetWithContent,
  })

  const syncRealtimeLoadedTarget = (session: RealtimeSessionState) => {
    if (!shouldMaintainRealtimeTextTargets) return
    const targetId = `realtime:${session.sessionId}`
    setTextSearchLoadedTargets(
      [
        {
          id: targetId,
          label: `realtime/${session.sessionId}.log`,
          fileName: `realtime-${session.sessionId}.log`,
          content: (session.lines ?? []).join('\n'),
        },
      ],
      targetId,
    )
  }

  const {
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
    resetAnalysisState,
    applyParsedTasks,
  } = useAppSelectionAndFilters({
    isMobile,
    tasks,
    selectedTask,
    selectedNode,
    selectedFlowItemId,
    pendingScrollNodeId,
    buildNodeFlowItems,
    buildNodeRecognitionFlowItems,
    afterSelect: ensureDetailViewExpanded,
  })

  const {
    stopRealtimeSession,
    realtimeStreaming,
    realtimeParseFailed,
    bridgeRecognitionImages,
    bridgeRecognitionImageRefs,
    bridgeRecognitionLoading,
    bridgeRecognitionError,
    bridgeNodeDefinition,
    bridgeNodeDefinitionLoading,
    bridgeNodeDefinitionError,
    bridgeRequestTaskDoc,
    bridgeRevealTask,
    bridgeOpenCrop,
    handleAppCleanup,
  } = useAppRuntimeOrchestration({
    bridgeEnabled,
    appEmbedMode,
    isVscodeLaunchEmbed,
    bridgeThemeUpdatedEvent: BRIDGE_THEME_UPDATED_EVENT,
    shouldMaintainRealtimeTextTargets,
    parser,
    textSearchLoadedDefaultTargetId,
    selectedNode,
    selectedFlowItemId,
    asRecord,
    toFiniteNumber,
    toPositiveInteger,
    toTrimmedNonEmptyString,
    getErrorMessage,
    buildNodeFlowItems,
    flattenFlowItems,
    applyParsedTasks,
    syncRealtimeLoadedTarget,
    clearDeferredTextSearchTargets,
    setTextSearchLoadedTargets,
    resetParserDebugAssets,
    resetAnalysisState,
  })

  const {
    handleFileUpload,
    handleContentUpload,
    tourActive,
    tourStepIndex,
    tourTargetFound,
    tourTargetRect,
    currentTourSteps,
    currentTourStep,
    currentTourSectionIndex,
    currentTourSectionTotal,
    currentTourSectionTitle,
    currentTourSectionStepIndex,
    currentTourSectionStepTotal,
    resolveCurrentTourTarget,
    handleTourViewportChange,
    handleTourPrev,
    handleTourNext,
    handleTourRetry,
    tutorialLoadingSample,
    openTutorialFromAbout,
    handleTourFinish,
    handleTourSkip,
    tryAutoStartTour,
  } = useAppWorkflowBindings({
    parser,
    loading,
    showParsingModal,
    parseProgress,
    stopRealtimeSession,
    resetAnalysisState,
    resetParserDebugAssets,
    setDeferredTextSearchTargets,
    pickPreferredLogTargetId,
    applyParsedTasks,
    handleFileLoadingStart,
    handleFileLoadingEnd,
    steps: TOUR_STEPS,
    isMobile,
    viewMode,
    showAboutModal,
    getTasksLength: () => tasks.value.length,
    loadTutorialSampleLog: async () => {
      const module = await import('../../../assets/tutorial-sample.log?raw')
      return module.default
    },
    tutorialStorageKey: TOUR_STORAGE_KEY,
    tutorialVersion: TOUR_VERSION,
    tutorialAutoStartEnabled,
  })

  useHostFileMessageReceiver(
    {
      onUploadFile: (file, selectPrimaryLogs) => {
        void handleFileUpload(file, selectPrimaryLogs)
      },
      onUploadContent: (...args) => {
        void handleContentUpload(...args)
      },
      onFileLoadingStart: handleFileLoadingStart,
      onFileLoadingEnd: handleFileLoadingEnd,
    },
    isVSCode,
  )

  const isDark = computed(() => propsIsDark.value)

  // 详情面板 → 文本搜索的原文定位桥
  const { pendingTextSearchRequest, requestTextSearch, consumeTextSearchRequest } =
    useTextSearchBridge()

  const handleSearchNodeInSource = (keyword: string, locate?: string) => {
    requestTextSearch(keyword, locate)
    handleViewModeSelect('search')
  }

  const {
    processViewMobileProps,
    processViewDesktopProps,
    detailViewProps,
    textSearchViewProps,
    processViewEventHandlers,
  } = useMainContentBindings({
    filteredTasks,
    selectedTask,
    loading,
    parser,
    isVscodeLaunchEmbed,
    bridgeRequestTaskDoc,
    bridgeRevealTask,
    pendingScrollNodeId,
    followLast,
    realtimeStreaming,
    realtimeParseFailed,
    showRealtimeStatus,
    showReloadControls,
    detailViewCollapsed,
    toggleDetailView,
    selectedNode,
    selectedFlowItemId,
    bridgeRecognitionImages,
    bridgeRecognitionImageRefs,
    bridgeRecognitionLoading,
    bridgeRecognitionError,
    bridgeNodeDefinition,
    bridgeNodeDefinitionLoading,
    bridgeNodeDefinitionError,
    bridgeOpenCrop,
    isDark,
    textSearchLoadedTargets,
    textSearchLoadedDefaultTargetId,
    hasDeferredTextSearchTargets,
    ensureTextSearchTargetsHydrated,
    handleSelectTask,
    handleSearchNodeInSource,
    pendingTextSearchRequest,
    consumeTextSearchRequest,
    ensureDeferredTargetContent,
    findDeferredTargetWithContent,
    handleFileUpload,
    handleContentUpload,
    handleSelectNode,
    handleSelectAction,
    handleSelectRecognition,
    handleSelectFlowItem,
    handleFileLoadingStart,
    handleFileLoadingEnd,
    showTaskDrawer,
  })

  const { headerBarProps, headerBarEventHandlers } = usePresentationHeaderBindings({
    propsIsDark,
    onToggleTheme,
    isMobile,
    isVscodeLaunchEmbed,
    viewMode,
    viewModeOptions,
    currentViewLabel,
    handleViewModeSelect,
    showTaskDrawer,
    showSettingsModal,
    showAboutModal,
  })

  const { mainContentProps, mainContentEventHandlers } = usePresentationMainContentBindings({
    viewMode,
    isMobile,
    isVscodeLaunchEmbed,
    splitSize,
    splitVerticalSize,
    showTaskDrawer,
    showDetailDrawer,
    filteredTasks,
    tasks,
    selectedTask,
    selectedNode,
    selectedFlowItemId,
    pendingScrollNodeId,
    textSearchViewProps,
    processViewMobileProps,
    processViewDesktopProps,
    processViewEventHandlers,
    detailViewProps,
    onSelectTask: handleSelectTask,
    onUploadFile: handleFileUpload,
    onUploadContent: handleContentUpload,
    onMobileTaskSelect: handleMobileSelectTask,
    onToggleDetailView: toggleDetailView,
  })

  const overlayProps = computed(() => ({
    showSettingsModal: showSettingsModal.value,
    showAboutModal: showAboutModal.value,
    showFileLoadingModal: showFileLoadingModal.value,
    showParsingModal: showParsingModal.value,
    modalWidth: modalWidth.value,
    modalWidthSmall: modalWidthSmall.value,
    parseProgress: parseProgress.value,
    tourActive: tourActive.value,
    currentTourStep: currentTourStep.value,
    tourStepIndex: tourStepIndex.value,
    currentTourStepsLength: currentTourSteps.value.length,
    currentTourSectionTitle: currentTourSectionTitle.value,
    currentTourSectionIndex: currentTourSectionIndex.value,
    currentTourSectionTotal: currentTourSectionTotal.value,
    currentTourSectionStepIndex: currentTourSectionStepIndex.value,
    currentTourSectionStepTotal: currentTourSectionStepTotal.value,
    tourTargetRect: tourTargetRect.value,
    tourTargetFound: tourTargetFound.value,
    isVscodeLaunchEmbed,
    appEmbedMode,
    bridgeEnabled,
    tutorialLoadingSample: tutorialLoadingSample.value,
    version,
  }))

  const overlayEventHandlers = {
    'update:show-settings-modal': (value: boolean) => {
      showSettingsModal.value = value
    },
    'update:show-about-modal': (value: boolean) => {
      showAboutModal.value = value
    },
    'update:show-file-loading-modal': (value: boolean) => {
      showFileLoadingModal.value = value
    },
    'update:show-parsing-modal': (value: boolean) => {
      showParsingModal.value = value
    },
    'tour-prev': handleTourPrev,
    'tour-next': handleTourNext,
    'tour-retry': handleTourRetry,
    'tour-finish': handleTourFinish,
    'tour-skip': handleTourSkip,
    'start-tutorial': openTutorialFromAbout,
  }

  watch(viewMode, () => {
    if (!tourActive.value) return
    void resolveCurrentTourTarget()
  })

  onMounted(() => {
    window.addEventListener('resize', handleTourViewportChange)
    window.addEventListener('scroll', handleTourViewportChange, true)
    tryAutoStartTour()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleTourViewportChange)
    window.removeEventListener('scroll', handleTourViewportChange, true)
    handleAppCleanup()
  })

  return {
    isVscodeLaunchEmbed,
    appEmbedMode,
    headerBarProps,
    headerBarEventHandlers,
    mainContentProps,
    mainContentEventHandlers,
    overlayProps,
    overlayEventHandlers,
  }
}
