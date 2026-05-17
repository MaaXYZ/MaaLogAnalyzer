<script setup lang="ts">
import { ref } from 'vue'
import {
  NCard
} from 'naive-ui'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import type { TaskInfo, NodeInfo } from '../types'
import type { LogParser } from '@windsland52/maa-log-parser'
import type { LoadedTextFile } from './process/utils/fileLoadingHelpers'
import type { LoadedPrimaryLogFile, PrimaryLogSelectionOption } from '../utils/logFileDiscovery'
import { useProcessViewController } from './process/composables/useProcessViewController'
import ProcessMobileToolbar from './process/components/ProcessMobileToolbar.vue'
import ProcessContentSection from './process/components/ProcessContentSection.vue'
import PrimaryLogSelectionModal from './process/components/PrimaryLogSelectionModal.vue'
import type { NodeNavMode } from './process/composables/useNodeNavSearch'

const props = defineProps<{
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode?: NodeInfo | null
  loading: boolean
  parser: LogParser
  detailViewCollapsed?: boolean
  onExpandDetailView?: () => void
  isMobile?: boolean
  pendingScrollNodeId?: number | null
  isRealtimeStreaming?: boolean
  showRealtimeStatus?: boolean
  showReloadControls?: boolean
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
}>()

const emit = defineEmits<{
  'select-task': [task: TaskInfo]
  'upload-file': [file: File, selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>]
  'upload-content': [content: string, errorImages?: Map<string, string>, visionImages?: Map<string, string>, waitFreezesImages?: Map<string, string>, textFiles?: LoadedTextFile[], primaryLogFiles?: LoadedPrimaryLogFile[]]
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'file-loading-start': []
  'file-loading-end': []
  'open-task-drawer': []
  'scroll-done': []
}>()

let resolvePrimaryLogSelection: ((options: PrimaryLogSelectionOption[] | null) => void) | null = null
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
  selectPrimaryLogs,
  emitters: {
    onSelectTask: (task) => emit('select-task', task),
    onUploadFile: (file) => emit('upload-file', file, selectPrimaryLogs),
    onUploadContent: (content, errorImages, visionImages, waitFreezesImages, textFiles, primaryLogFiles) => {
      emit('upload-content', content, errorImages, visionImages, waitFreezesImages, textFiles, primaryLogFiles)
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
      :follow-last="followLast"
      :task-list-collapsed="taskListCollapsed"
      :node-nav-collapsed="nodeNavCollapsed"
      :task-list-size="taskListSize"
      :node-nav-size="nodeNavSize"
      :active-task-index="activeTaskIndex"
      :node-nav-items="nodeNavItems"
      :node-nav-search-text="nodeNavSearchText"
      :normalized-node-nav-search-text="normalizedNodeNavSearchText"
      :node-nav-failed-only="nodeNavFailedOnly"
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
      :on-update-task-list-size="(value) => taskListSize = value"
      :on-update-node-nav-size="(value) => nodeNavSize = value"
      :on-toggle-task-list="toggleTaskList"
      :on-toggle-node-nav="toggleNodeNav"
      :on-expand-detail="() => onExpandDetailView?.()"
      :on-select-task-index="handleTabChange"
      :on-toggle-follow="toggleFollowLast"
      :on-update-node-nav-search-text="(value) => nodeNavSearchText = value"
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
