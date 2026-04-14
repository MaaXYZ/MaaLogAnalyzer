import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { version } from '../../../../package.json'
import { getErrorMessage } from '../../../utils/errorHandler'
import { useIsMobile } from '../../../composables/useIsMobile'
import { buildNodeFlowItems, buildNodeRecognitionFlowItems } from '@windsland52/maa-log-parser/node-flow'
import { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION } from '../../../tutorial/steps'
import type { NodeInfo, TaskInfo } from '../../../types'
import { LogParser } from '@windsland52/maa-log-parser'
import { BRIDGE_THEME_UPDATED_EVENT } from '../../../utils/bridgeEvents'
import { useTextSearchTargets } from './useTextSearchTargets'
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

export const useAppRootViewModel = ({
  propsIsDark,
  onToggleTheme,
}: UseAppRootViewModelOptions) => {
  const { isMobile } = useIsMobile()
  const {
    isVscodeLaunchEmbed,
    bridgeEnabled,
    tutorialAutoStartEnabled,
    showProcessThreadFilters,
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
  } = useAppViewState()
  const parser = new LogParser()

  const tasks = shallowRef<TaskInfo[]>([])
  const selectedTask = shallowRef<TaskInfo | null>(null)
  const selectedNode = shallowRef<NodeInfo | null>(null)
  const selectedFlowItemId = ref<string | null>(null)
  const loading = ref(false)
  const pendingScrollNodeId = ref<number | null>(null)
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
    setDeferredTextSearchTargets,
  } = useTextSearchTargets()

  const shouldMaintainRealtimeTextTargets = showTextSearchView

  const syncRealtimeLoadedTarget = (session: RealtimeSessionState) => {
    if (!shouldMaintainRealtimeTextTargets) return
    const targetId = `realtime:${session.sessionId}`
    setTextSearchLoadedTargets(
      [{
        id: targetId,
        label: `realtime/${session.sessionId}.log`,
        fileName: `realtime-${session.sessionId}.log`,
        content: (session.lines ?? []).join('\n'),
      }],
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
    selectedProcessId,
    selectedThreadId,
    filteredTasks,
    processIdOptions,
    threadIdOptions,
    clearFilters,
    clearRuntimeFilters,
    resetAnalysisState,
    applyParsedTasks,
  } = useAppSelectionAndFilters({
    isMobile,
    parser,
    tasks,
    selectedTask,
    selectedNode,
    selectedFlowItemId,
    pendingScrollNodeId,
    buildNodeFlowItems,
    buildNodeRecognitionFlowItems,
  })

  const {
    stopRealtimeSession,
    isRealtimeContext,
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
    selectedProcessId,
    selectedThreadId,
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
    clearRuntimeFilters,
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

  const isDark = computed(() => propsIsDark.value)

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
    isRealtimeContext,
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

  const {
    headerBarProps,
    headerBarEventHandlers,
  } = usePresentationHeaderBindings({
    propsIsDark,
    onToggleTheme,
    isMobile,
    isVscodeLaunchEmbed,
    showProcessThreadFilters,
    viewMode,
    viewModeOptions,
    currentViewLabel,
    handleViewModeSelect,
    selectedProcessId,
    selectedThreadId,
    processIdOptions,
    threadIdOptions,
    clearFilters,
    showTaskDrawer,
    showSettingsModal,
    showAboutModal,
  })

  const {
    mainContentProps,
    mainContentEventHandlers,
  } = usePresentationMainContentBindings({
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
    'update:show-settings-modal': (value: boolean) => { showSettingsModal.value = value },
    'update:show-about-modal': (value: boolean) => { showAboutModal.value = value },
    'update:show-file-loading-modal': (value: boolean) => { showFileLoadingModal.value = value },
    'update:show-parsing-modal': (value: boolean) => { showParsingModal.value = value },
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
