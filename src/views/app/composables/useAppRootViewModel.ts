import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { version } from '../../../../package.json'
import { getErrorMessage } from '../../../utils/errorHandler'
import { useHotkeys } from '../../../composables/useHotkeys'
import { useIsMobile } from '../../../composables/useIsMobile'
import {
  buildNodeFlowItems,
  buildNodeRecognitionFlowItems,
} from '@windsland52/maa-log-parser/node-flow'
import { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION } from '../../../tutorial/steps'
import type { NodeInfo, TaskInfo, TaskSummary } from '../../../types'
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

  // 数字 1..N 直接切视图，顺序与顶栏标签一致（输入框里不生效由热键层保证）
  useHotkeys({
    enabled: () => viewModeOptions.value.length > 1,
    bindings: () =>
      viewModeOptions.value.slice(0, 9).map((option, index) => ({
        key: String(index + 1),
        run: () => handleViewModeSelect(option.key),
      })),
  })

  const tasks = shallowRef<TaskInfo[]>([])
  const selectedTask = shallowRef<TaskInfo | null>(null)
  // 骨架任务 → 完整任务：Worker 会话在解析完成后仍常驻，选中骨架时向它按需取详情。
  const taskDetailLoader = shallowRef<((task: TaskInfo) => Promise<TaskInfo | null>) | null>(null)
  const pendingTaskDetailKeys = new Set<string>()
  const selectedNode = shallowRef<NodeInfo | null>(null)
  const selectedFlowItemId = ref<string | null>(null)
  const loading = ref(false)
  const pendingScrollNodeId = ref<number | null>(null)
  const followLast = ref(true)
  const parseProgress = ref(0)
  const showParsingModal = ref(false)
  // 解析进行中的任务瘦摘要：边解析边上屏，解析完成后由 applyParsedTasks 用完整任务树替换。
  const parseTaskSummaries = shallowRef<TaskSummary[]>([])
  const parseInputsProgress = ref({ parsedInputs: 0, totalInputs: 0 })

  // 每点开一个任务就把它换成完整 TaskInfo（含 node_flow/识别/动作）。大日志上单个任务
  // 可达 300MB 级，来回切几个就会把主线程内存推回去，所以只缓存最近 N 个，其余降级回骨架。
  const TASK_DETAIL_CACHE_LIMIT = 2
  /** 已加载过详情的任务 → 它原来的骨架（降级时用来还原，避免为了省内存反而丢掉列表信息）。 */
  const skeletonByTaskKey = new Map<string, TaskInfo>()
  /** LRU：最近使用的任务 key 在最前。 */
  const taskDetailLru: string[] = []

  const taskKeyOf = (task: TaskInfo | null | undefined): string | null =>
    task?.task_execution_id ?? null

  const touchTaskDetail = (key: string) => {
    const index = taskDetailLru.indexOf(key)
    if (index >= 0) taskDetailLru.splice(index, 1)
    taskDetailLru.unshift(key)
  }

  const replaceTaskInList = (key: string, nextTask: TaskInfo) => {
    const index = tasks.value.findIndex((item) => taskKeyOf(item) === key)
    if (index < 0) return
    const next = tasks.value.slice()
    next[index] = nextTask
    tasks.value = next
  }

  /** 超出缓存上限时，把最久未用的非选中任务降级回骨架，释放它占的明细内存。 */
  const enforceTaskDetailCacheLimit = () => {
    while (taskDetailLru.length > TASK_DETAIL_CACHE_LIMIT) {
      const evictKey = taskDetailLru[taskDetailLru.length - 1]
      if (!evictKey) break
      // 选中任务永不降级：详情面板/流程图正在用它。
      if (taskKeyOf(selectedTask.value) === evictKey) break
      const skeleton = skeletonByTaskKey.get(evictKey)
      taskDetailLru.pop()
      if (!skeleton) continue
      skeletonByTaskKey.delete(evictKey)
      replaceTaskInList(evictKey, skeleton)
    }
  }

  const ensureSelectedTaskDetail = async (task: TaskInfo | null) => {
    const key = taskKeyOf(task)
    if (!key || !task) return

    // 已完整加载的任务：只更新 LRU 顺序（可能在别的任务之后又被切回来）。
    if (!task._skeleton) {
      if (skeletonByTaskKey.has(key)) {
        touchTaskDetail(key)
        enforceTaskDetailCacheLimit()
      }
      return
    }

    const loader = taskDetailLoader.value
    if (!loader || pendingTaskDetailKeys.has(key)) return
    pendingTaskDetailKeys.add(key)
    try {
      const detail = await loader(task)
      if (!detail) return
      // 加载期间可能已经换了一份日志：确认这个 key 仍是当前列表里的骨架，避免把旧日志的
      // 详情塞进新列表（scope id 由序号派生，跨日志有可能撞号）。
      const stillCurrent = tasks.value.some(
        (item) => taskKeyOf(item) === key && item._skeleton === true,
      )
      if (!stillCurrent) return
      // 记下骨架，供之后超限时还原；再替换选中项与列表项。
      skeletonByTaskKey.set(key, task)
      if (selectedTask.value?.task_execution_id === key) {
        selectedTask.value = detail
      }
      replaceTaskInList(key, detail)
      touchTaskDetail(key)
      enforceTaskDetailCacheLimit()
    } catch (error) {
      // 详情取失败不影响已上屏的骨架；用户切换任务时会再试。
      console.warn('[log-loading] 任务详情加载失败:', error)
    } finally {
      pendingTaskDetailKeys.delete(key)
    }
  }

  watch(selectedTask, (task) => {
    void ensureSelectedTaskDetail(task)
  })

  const { resetParserDebugAssets } = useParserDebugAssets({ parser })

  const {
    textSearchLoadedTargets,
    textSearchLoadedDefaultTargetId,
    deferredTextSearchTargets,
    deferredTextSearchDefaultTargetId,
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
    onTaskSummaries: (summaries, progress) => {
      parseTaskSummaries.value = summaries
      parseInputsProgress.value = progress
    },
    setTaskDetailLoader: (loader) => {
      taskDetailLoader.value = loader
      if (!loader) {
        // 换日志/解析失败：旧任务的骨架与 LRU 记录都不再有意义。
        skeletonByTaskKey.clear()
        taskDetailLru.length = 0
        pendingTaskDetailKeys.clear()
      }
    },
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

  // 首次解析出数据后，趁空闲预热流程图：FlowchartView 是异步组件，进去还要再等
  // ELK 的 chunk 下载与 worker 启动，画布会空白几秒。预热把这些提前到空闲时间，
  // 又不会给没打开过日志的首屏增加下载量。
  let flowchartWarmedUp = false
  const warmUpFlowchart = () => {
    void import('../../FlowchartView.vue')
    void import('../../../utils/flowchartBuilder').then(({ preloadFlowchartLayout }) =>
      preloadFlowchartLayout(),
    )
  }
  watch(
    () => tasks.value.length,
    (taskCount) => {
      if (flowchartWarmedUp || taskCount === 0) return
      flowchartWarmedUp = true
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warmUpFlowchart, { timeout: 3000 })
        return
      }
      window.setTimeout(warmUpFlowchart, 500)
    },
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

  // 顶栏要显示「当前在看哪份日志」：主日志的显示名与完整路径从已加载（或待加载）的搜索目标里取。
  // 取不到（例如 VS Code iframe 复用宿主数据）就留空，顶栏不显示这一段，不要瞎猜。
  const loadedLogTarget = computed(() => {
    const loaded = textSearchLoadedTargets.value ?? []
    if (loaded.length > 0) {
      return loaded.find((target) => target.id === textSearchLoadedDefaultTargetId.value) ?? loaded[0]
    }
    const deferred = deferredTextSearchTargets.value ?? []
    if (deferred.length > 0) {
      return (
        deferred.find((target) => target.id === deferredTextSearchDefaultTargetId.value) ??
        deferred[0]
      )
    }
    return null
  })

  const loadedLogName = computed(
    () => loadedLogTarget.value?.fileName || loadedLogTarget.value?.label || '',
  )

  const loadedLogPath = computed(() => {
    const label = loadedLogTarget.value?.label || ''
    // label 常常就是同名文件（没走目录选择），这时别在 tooltip 里重复一遍
    return label && label !== loadedLogTarget.value?.fileName ? label : ''
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
    loadedLogName,
    loadedLogPath,
  })

  const { mainContentProps, mainContentEventHandlers } = usePresentationMainContentBindings({
    viewMode,
    isMobile,
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
    parseTaskSummaries: parseTaskSummaries.value,
    parseInputsProgress: parseInputsProgress.value,
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
