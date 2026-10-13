<script setup lang="ts">
import { ref, watch } from 'vue'
import { NCard } from 'naive-ui'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import type { TaskInfo, NodeInfo } from '../types'
import type { LogParser } from '@windsland52/maa-log-parser'
import type { LoadedTextFile } from './process/utils/fileLoadingHelpers'
import type { PrimaryLogFile, PrimaryLogSelectionOption } from '../utils/logFileDiscovery'
import { useProcessViewController } from './process/composables/useProcessViewController'
import { useHotkeys } from '../composables/useHotkeys'
import { buildSearchHitBindings } from '../utils/hotkeys'
import { useNodeNavigationHotkeys } from './process/composables/useNodeNavigationHotkeys'
import { resolveTaskNavStepIndex } from './process/utils/taskNavStep'
import {
  isHotkeyPanelRendered,
  useActiveHotkeyPanel,
  useHotkeyPanelTracking,
} from './process/composables/hotkeyPanel'
import ProcessMobileToolbar from './process/components/ProcessMobileToolbar.vue'
import ProcessContentSection from './process/components/ProcessContentSection.vue'
import PrimaryLogSelectionModal from './process/components/PrimaryLogSelectionModal.vue'
import type { NodeNavMode } from './process/composables/useNodeNavSearch'

const props = defineProps<{
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode?: NodeInfo | null
  selectedFlowItemId?: string | null
  loading: boolean
  parser: LogParser
  detailViewCollapsed?: boolean
  onExpandDetailView?: () => void
  isMobile?: boolean
  pendingScrollNodeId?: number | null
  followLast?: boolean
  isRealtimeStreaming?: boolean
  realtimeParseFailed?: boolean
  showRealtimeStatus?: boolean
  showReloadControls?: boolean
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
}>()

const emit = defineEmits<{
  'select-task': [task: TaskInfo]
  'locate-failure': [index: number, nodeId: number]
  'upload-file': [
    file: File | File[],
    selectPrimaryLogs?: (
      options: PrimaryLogSelectionOption[],
    ) => Promise<PrimaryLogSelectionOption[] | null>,
  ]
  'upload-content': [
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: PrimaryLogFile[],
  ]
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'file-loading-start': []
  'file-loading-end': []
  'open-task-drawer': []
  'scroll-done': []
  'update:follow-last': [value: boolean]
}>()

const followLastModel = ref(props.followLast ?? true)

watch(
  () => props.followLast,
  (value) => {
    if (typeof value === 'boolean') followLastModel.value = value
  },
  { flush: 'sync' },
)

watch(
  followLastModel,
  (value) => {
    if (value !== props.followLast) emit('update:follow-last', value)
  },
  { flush: 'sync' },
)

let resolvePrimaryLogSelection: ((options: PrimaryLogSelectionOption[] | null) => void) | null =
  null
const showPrimaryLogSelection = ref(false)
const primaryLogSelectionOptions = ref<PrimaryLogSelectionOption[]>([])

const selectPrimaryLogs = (options: PrimaryLogSelectionOption[]) => {
  if (options.length <= 1) {
    return Promise.resolve(options)
  }
  primaryLogSelectionOptions.value = options
  showPrimaryLogSelection.value = true
  return new Promise<PrimaryLogSelectionOption[] | null>((resolve) => {
    resolvePrimaryLogSelection = resolve
  })
}

const handlePrimaryLogSelectionConfirm = (options: PrimaryLogSelectionOption[]) => {
  showPrimaryLogSelection.value = false
  resolvePrimaryLogSelection?.(options)
  resolvePrimaryLogSelection = null
  primaryLogSelectionOptions.value = []
}

const handlePrimaryLogSelectionCancel = () => {
  showPrimaryLogSelection.value = false
  resolvePrimaryLogSelection?.(null)
  resolvePrimaryLogSelection = null
  primaryLogSelectionOptions.value = []
}

const {
  settings,
  isInTauri,
  isInVSCode,
  isRealtimeStreaming,
  showRealtimeStatus,
  showReloadControls,
  taskListCollapsed,
  taskListSize,
  nodeNavCollapsed,
  nodeNavSize,
  toggleTaskList,
  toggleNodeNav,
  activeTaskIndex,
  followLast,
  currentNodes,
  handleTabChange,
  toggleFollowLast,
  stopFollowOnScrollUp,
  scrollToNode,
  safeScrollToItem,
  nodeNavSearchText,
  normalizedNodeNavSearchText,
  nodeNavFailedOnly,
  nodeNavMode,
  setNodeNavMode,
  toggleNodeNavFailedOnly,
  nodeNavItems,
  nodeNavEmptyDescription,
  nodeNavFailedCount,
  folderInputRef,
  fileInputRef,
  reloadOptions,
  handleDrop,
  handleDragOver,
  handleFolderChange,
  handleFileInputChange,
  handleReloadSelect,
  handleTauriOpen,
  handleTauriOpenFolder,
  handleVSCodeOpen,
  handleVSCodeOpenFolder,
  handleNodeClick,
  handleActionClick,
  handleRecognitionClick,
  handleFlowItemClick,
  handleVirtualScrollerMounted,
  setTaskListPanelRef,
  setNodeNavPanelRef,
} = useProcessViewController({
  props,
  followLast: followLastModel,
  selectPrimaryLogs,
  emitters: {
    onSelectTask: (task) => emit('select-task', task),
    onUploadFile: (file, requestedSelectPrimaryLogs) =>
      emit('upload-file', file, requestedSelectPrimaryLogs ?? selectPrimaryLogs),
    onUploadContent: (
      content,
      errorImages,
      visionImages,
      waitFreezesImages,
      textFiles,
      primaryLogFiles,
    ) => {
      emit(
        'upload-content',
        content,
        errorImages,
        visionImages,
        waitFreezesImages,
        textFiles,
        primaryLogFiles,
      )
    },
    onSelectNode: (node: NodeInfo) => emit('select-node', node),
    onSelectAction: (node: NodeInfo) => emit('select-action', node),
    onSelectRecognition: (node: NodeInfo, attemptIndex: number) => {
      emit('select-recognition', node, attemptIndex)
    },
    onSelectFlowItem: (node: NodeInfo, flowItemId: string) => {
      emit('select-flow-item', node, flowItemId)
    },
    onFileLoadingStart: () => emit('file-loading-start'),
    onFileLoadingEnd: () => emit('file-loading-end'),
    onScrollDone: () => emit('scroll-done'),
  },
})

// j/↓ 下一个节点、k/↑ 上一个节点。两个面板的列表顺序不同（时间线按执行顺序、
// 导航列表按当前模式），所以跟随“最后交互过的面板”；记录见 hotkeyPanel.ts
useHotkeyPanelTracking()
const activeHotkeyPanel = useActiveHotkeyPanel()
const isTimelineHotkeyPanel = () =>
  activeHotkeyPanel.value !== 'node-nav' || !isHotkeyPanelRendered('node-nav')

const { step: stepTimelineNode } = useNodeNavigationHotkeys({
  items: currentNodes,
  isCurrent: (node) => props.selectedNode != null && node.node_id === props.selectedNode.node_id,
  enabled: isTimelineHotkeyPanel,
  onSelect: (node, index, delta) => {
    if (delta < 0) {
      stopFollowOnScrollUp()
    }
    handleNodeClick(node)
    void scrollToNode(index)
  },
})

// 有搜索词时 n/N 在命中里前后跳（时间线列表同样被这个搜索词过滤）
useHotkeys({
  enabled: () => isTimelineHotkeyPanel() && Boolean(normalizedNodeNavSearchText.value),
  bindings: () => buildSearchHitBindings(stepTimelineNode),
})

// f 切换“仅失败/仅异常”（与漏斗、弹窗筛选同一个开关）；Esc 先关筛选、再清空搜索
useHotkeys({
  enabled: () => nodeNavItems.value.length > 0 || Boolean(nodeNavSearchText.value),
  bindings: () => [
    { key: 'f', run: () => toggleNodeNavFailedOnly() },
    {
      key: 'Escape',
      allowInEditable: true,
      run: () => {
        if (nodeNavFailedOnly.value) {
          toggleNodeNavFailedOnly()
          return
        }
        if (nodeNavSearchText.value) {
          nodeNavSearchText.value = ''
        }
      },
    },
  ],
})

// [ / ] 切换任务（顺序同任务列表，两端夹住）。Shift 变体一并注册，
// 兼容 [ ] 需要 Shift 或位于其他键位的布局
const stepTask = (delta: number) => {
  const index = resolveTaskNavStepIndex(props.tasks.length, activeTaskIndex.value, delta)
  if (index == null) return
  handleTabChange(index)
}

useHotkeys({
  enabled: () => props.tasks.length > 1,
  bindings: () => [
    { key: '[', shift: false, run: () => stepTask(-1) },
    { key: '[', shift: true, run: () => stepTask(-1) },
    { key: ']', shift: false, run: () => stepTask(1) },
    { key: ']', shift: true, run: () => stepTask(1) },
  ],
})

void folderInputRef
void fileInputRef
</script>

<template>
  <n-card
    class="analysis-root-card"
    data-tour="analysis-process-root"
    :bordered="false"
    style="height: 100%; overflow: visible"
    content-style="display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: visible"
  >
    <!-- 移动端工具栏 -->
    <process-mobile-toolbar
      v-if="isMobile && tasks.length > 0"
      :selected-task-entry="selectedTask?.entry || ''"
      :show-realtime-status="showRealtimeStatus || props.isVscodeLaunchEmbed === true"
      :is-realtime-streaming="isRealtimeStreaming"
      :realtime-parse-failed="props.realtimeParseFailed === true"
      :follow-last="followLast"
      :show-reload-controls="showReloadControls"
      :reload-options="reloadOptions"
      @open-task-drawer="emit('open-task-drawer')"
      @toggle-follow="toggleFollowLast"
      @reload-select="handleReloadSelect"
    />

    <process-content-section
      :tasks="tasks"
      :selected-task="selectedTask"
      :selected-node="selectedNode"
      :selected-flow-item-id="props.selectedFlowItemId ?? null"
      :is-mobile="isMobile"
      :settings-display-mode="settings.displayMode"
      :detail-view-collapsed="!!detailViewCollapsed"
      :show-detail-button="!!onExpandDetailView"
      :is-vscode-launch-embed="props.isVscodeLaunchEmbed"
      :bridge-request-task-doc="props.bridgeRequestTaskDoc"
      :bridge-reveal-task="props.bridgeRevealTask"
      :is-in-tauri="isInTauri"
      :is-in-v-s-code="isInVSCode"
      :show-reload-controls="showReloadControls"
      :reload-options="reloadOptions"
      :current-nodes="currentNodes"
      :show-realtime-status="showRealtimeStatus"
      :is-realtime-streaming="isRealtimeStreaming"
      :realtime-parse-failed="props.realtimeParseFailed === true"
      :follow-last="followLast"
      :pending-scroll-node-id="pendingScrollNodeId"
      :task-list-collapsed="taskListCollapsed"
      :node-nav-collapsed="nodeNavCollapsed"
      :task-list-size="taskListSize"
      :node-nav-size="nodeNavSize"
      :active-task-index="activeTaskIndex"
      :node-nav-items="nodeNavItems"
      :node-nav-search-text="nodeNavSearchText"
      :normalized-node-nav-search-text="normalizedNodeNavSearchText"
      :node-nav-failed-only="nodeNavFailedOnly"
      :node-nav-failed-count="nodeNavFailedCount"
      :node-nav-mode="nodeNavMode"
      :node-nav-empty-description="nodeNavEmptyDescription"
      :set-task-list-panel-ref="setTaskListPanelRef"
      :set-node-nav-panel-ref="setNodeNavPanelRef"
      :on-tauri-open="handleTauriOpen"
      :on-tauri-open-folder="handleTauriOpenFolder"
      :on-v-s-code-open="handleVSCodeOpen"
      :on-v-s-code-open-folder="handleVSCodeOpenFolder"
      :on-drop="handleDrop"
      :on-drag-over="handleDragOver"
      :on-reload-select="handleReloadSelect"
      :on-scroller-mounted="handleVirtualScrollerMounted"
      :on-select-node="handleNodeClick"
      :on-select-action="handleActionClick"
      :on-select-recognition="handleRecognitionClick"
      :on-select-flow-item="handleFlowItemClick"
      :on-update-task-list-size="(value) => (taskListSize = value)"
      :on-update-node-nav-size="(value) => (nodeNavSize = value)"
      :on-toggle-task-list="toggleTaskList"
      :on-toggle-node-nav="toggleNodeNav"
      :on-expand-detail="() => onExpandDetailView?.()"
      :on-select-task-index="handleTabChange"
      :on-locate-task-failure="(index, nodeId) => emit('locate-failure', index, nodeId)"
      :on-toggle-follow="toggleFollowLast"
      :on-update-node-nav-search-text="(value) => (nodeNavSearchText = value)"
      :on-update-node-nav-mode="(value: NodeNavMode) => setNodeNavMode(value)"
      :on-toggle-node-nav-failed-only="toggleNodeNavFailedOnly"
      :on-select-node-nav="scrollToNode"
      :on-manual-scroll-up="stopFollowOnScrollUp"
      :safe-scroll-to-item="safeScrollToItem"
    />

    <primary-log-selection-modal
      :show="showPrimaryLogSelection"
      :options="primaryLogSelectionOptions"
      @confirm="handlePrimaryLogSelectionConfirm"
      @cancel="handlePrimaryLogSelectionCancel"
    />

    <!-- Web 环境下的全局隐藏文件选择输入框 -->
    <input
      v-if="!isInTauri"
      ref="fileInputRef"
      type="file"
      multiple
      accept=".log,.txt,.jsonl,.zip"
      style="display: none"
      @change="handleFileInputChange"
    />
    <input
      v-if="!isInTauri"
      ref="folderInputRef"
      type="file"
      webkitdirectory
      style="display: none"
      @change="handleFolderChange"
    />
  </n-card>
</template>

<style scoped>
/* Fix Naive UI scrollbar container background in light mode */
:deep(.n-scrollbar-container) {
  background-color: transparent !important;
}

:deep(.n-scrollbar-content) {
  background-color: transparent !important;
}

:deep(.n-card__content) {
  background-color: transparent !important;
}

:deep(.analysis-root-card.n-card) {
  background-color: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
</style>
