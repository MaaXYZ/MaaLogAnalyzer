import type { ComputedRef, Ref, VNodeChild } from 'vue'
import type { NodeInfo, TaskInfo } from '../../../../types'
import type { TourStep } from '../../../../tutorial/types'
import type { PrimaryLogSelectionOption } from '../../../../utils/logFileDiscovery'
import type {
  DetailViewForwardProps,
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
  TextSearchViewForwardProps,
  UploadContentHandler,
} from '../../components/types'

export interface ViewModeOptionLike extends Record<string, unknown> {
  label: string
  key: string
  icon?: () => VNodeChild
}

export interface UseAppPresentationBindingsOptions {
  propsIsDark: Ref<boolean>
  onToggleTheme: () => void
  isMobile: Ref<boolean>
  isVscodeLaunchEmbed: boolean
  viewMode: Ref<string>
  viewModeOptions: Ref<ViewModeOptionLike[]>
  currentViewLabel: Ref<string>
  handleViewModeSelect: (key: string) => void
  showTaskDrawer: Ref<boolean>
  showDetailDrawer: Ref<boolean>
  showSettingsModal: Ref<boolean>
  showAboutModal: Ref<boolean>
  showFileLoadingModal: Ref<boolean>
  showParsingModal: Ref<boolean>
  splitSize: Ref<number>
  splitVerticalSize: Ref<number>
  filteredTasks: Ref<TaskInfo[]>
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  pendingScrollNodeId: Ref<number | null>
  textSearchViewProps: ComputedRef<TextSearchViewForwardProps>
  processViewMobileProps: ComputedRef<ProcessViewForwardProps>
  processViewDesktopProps: ComputedRef<ProcessViewForwardProps>
  processViewEventHandlers: ProcessViewEventHandlers
  detailViewProps: ComputedRef<DetailViewForwardProps>
  onSelectTask: (task: TaskInfo) => void
  onUploadFile: (
    file: File | File[],
    selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
  ) => void | Promise<void>
  onUploadContent: UploadContentHandler
  onMobileTaskSelect: (task: TaskInfo) => void
  onToggleDetailView: () => void
  modalWidth: Ref<string>
  modalWidthSmall: Ref<string>
  parseProgress: Ref<number>
  tourActive: Ref<boolean>
  currentTourStep: Ref<TourStep | null>
  tourStepIndex: Ref<number>
  currentTourStepsLength: () => number
  currentTourSectionTitle: Ref<string>
  currentTourSectionIndex: Ref<number>
  currentTourSectionTotal: Ref<number>
  currentTourSectionStepIndex: Ref<number>
  currentTourSectionStepTotal: Ref<number>
  tourTargetRect: Ref<{
    top: number
    left: number
    width: number
    height: number
  } | null>
  tourTargetFound: Ref<boolean>
  appEmbedMode: string
  bridgeEnabled: boolean
  tutorialLoadingSample: Ref<boolean>
  version: string
  handleTourPrev: () => void
  handleTourNext: () => void
  handleTourRetry: () => void
  handleTourFinish: () => void
  handleTourSkip: () => void
  openTutorialFromAbout: () => void
}
