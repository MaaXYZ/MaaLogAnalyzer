import { computed, type ComputedRef, type Ref } from 'vue'
import type { LogParser } from '../../../utils/logParser'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { BridgeOpenCropRequest } from './useBridgeTaskActions'
import type {
  LoadedSearchTarget,
  ProcessViewEventHandlers,
} from '../components/types'

interface UseMainContentBindingsOptions {
  filteredTasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  loading: Ref<boolean>
  parser: LogParser
  isVscodeLaunchEmbed: boolean
  bridgeRequestTaskDoc: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask: ((task: string) => Promise<void>) | null
  pendingScrollNodeId: Ref<number | null>
  isRealtimeContext: ComputedRef<boolean>
  showRealtimeStatus: boolean
  showReloadControls: boolean
  detailViewCollapsed: Ref<boolean>
  toggleDetailView: () => void
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  bridgeRecognitionImages: Ref<{ raw: string | null; draws: string[] } | null>
  bridgeRecognitionImageRefs: Ref<{ raw: number | null; draws: number[] } | null>
  bridgeRecognitionLoading: Ref<boolean>
  bridgeRecognitionError: Ref<string | null>
  bridgeNodeDefinition: Ref<string | null>
  bridgeNodeDefinitionLoading: Ref<boolean>
  bridgeNodeDefinitionError: Ref<string | null>
  bridgeOpenCrop: ((request: BridgeOpenCropRequest) => Promise<void>) | null
  isDark: ComputedRef<boolean>
  textSearchLoadedTargets: Ref<LoadedSearchTarget[]>
  textSearchLoadedDefaultTargetId: Ref<string>
  hasDeferredTextSearchTargets: Ref<boolean>
  ensureTextSearchTargetsHydrated: (() => Promise<void>) | undefined
  handleSelectTask: (task: TaskInfo) => void
  handleFileUpload: (file: File) => void | Promise<void>
  handleContentUpload: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: Array<{
      path: string
      name: string
      content: string
    }>
  ) => void | Promise<void>
  handleSelectNode: (node: NodeInfo) => void
  handleSelectAction: (node: NodeInfo) => void
  handleSelectRecognition: (node: NodeInfo, attemptIndex: number) => void
  handleSelectFlowItem: (node: NodeInfo, flowItemId: string) => void
  handleFileLoadingStart: () => void
  handleFileLoadingEnd: () => void
  showTaskDrawer: Ref<boolean>
}

export const useMainContentBindings = (options: UseMainContentBindingsOptions) => {
  const processViewBaseProps = computed(() => ({
    tasks: options.filteredTasks.value,
    selectedTask: options.selectedTask.value,
    selectedNode: options.selectedNode.value,
    loading: options.loading.value,
    parser: options.parser,
    isVscodeLaunchEmbed: options.isVscodeLaunchEmbed,
    bridgeRequestTaskDoc: options.bridgeRequestTaskDoc,
    bridgeRevealTask: options.bridgeRevealTask,
    pendingScrollNodeId: options.pendingScrollNodeId.value,
    isRealtimeStreaming: options.isRealtimeContext.value,
    showRealtimeStatus: options.showRealtimeStatus,
    showReloadControls: options.showReloadControls,
  }))

  const processViewMobileProps = computed(() => ({
    ...processViewBaseProps.value,
    isMobile: true,
  }))

  const processViewDesktopProps = computed(() => ({
    ...processViewBaseProps.value,
    detailViewCollapsed: options.detailViewCollapsed.value,
    onExpandDetailView: options.toggleDetailView,
  }))

  const processViewEventHandlers: ProcessViewEventHandlers = {
    'select-task': options.handleSelectTask,
    'upload-file': options.handleFileUpload,
    'upload-content': options.handleContentUpload,
    'select-node': options.handleSelectNode,
    'select-action': options.handleSelectAction,
    'select-recognition': options.handleSelectRecognition,
    'select-flow-item': options.handleSelectFlowItem,
    'file-loading-start': options.handleFileLoadingStart,
    'file-loading-end': options.handleFileLoadingEnd,
    'open-task-drawer': () => { options.showTaskDrawer.value = true },
    'scroll-done': () => { options.pendingScrollNodeId.value = null },
  }

  const detailViewProps = computed(() => ({
    selectedNode: options.selectedNode.value,
    selectedFlowItemId: options.selectedFlowItemId.value,
    bridgeRecognitionImages: options.bridgeRecognitionImages.value,
    bridgeRecognitionImageRefs: options.bridgeRecognitionImageRefs.value,
    bridgeRecognitionLoading: options.bridgeRecognitionLoading.value,
    bridgeRecognitionError: options.bridgeRecognitionError.value,
    isVscodeLaunchEmbed: options.isVscodeLaunchEmbed,
    bridgeNodeDefinition: options.bridgeNodeDefinition.value,
    bridgeNodeDefinitionLoading: options.bridgeNodeDefinitionLoading.value,
    bridgeNodeDefinitionError: options.bridgeNodeDefinitionError.value,
    bridgeOpenCrop: options.bridgeOpenCrop,
  }))

  const textSearchViewProps = computed(() => ({
    isDark: options.isDark.value,
    loadedTargets: options.textSearchLoadedTargets.value,
    loadedDefaultTargetId: options.textSearchLoadedDefaultTargetId.value,
    hasDeferredLoadedTargets: options.hasDeferredTextSearchTargets.value,
    ensureLoadedTargets: options.ensureTextSearchTargetsHydrated,
  }))

  return {
    processViewMobileProps,
    processViewDesktopProps,
    detailViewProps,
    textSearchViewProps,
    processViewEventHandlers,
  }
}
