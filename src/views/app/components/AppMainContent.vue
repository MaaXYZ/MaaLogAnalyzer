<script setup lang="ts">
import type { LogParser } from '../../../utils/logParser'
import type { NodeInfo, TaskInfo } from '../../../types'
import SearchModePane from './SearchModePane.vue'
import StatisticsModePane from './StatisticsModePane.vue'
import FlowchartModePane from './FlowchartModePane.vue'
import AiModePane from './AiModePane.vue'
import MainContentAnalysisSection from './MainContentAnalysisSection.vue'
import MainContentSplitSection from './MainContentSplitSection.vue'
import type {
  DetailViewForwardProps,
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
  TextSearchViewForwardProps,
  UploadContentHandler,
  UploadFileHandler,
} from './types'

defineProps<{
  viewMode: string
  isMobile: boolean
  splitSize: number
  splitVerticalSize: number
  showTaskDrawer: boolean
  showDetailDrawer: boolean
  filteredTasks: TaskInfo[]
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode: NodeInfo | null
  selectedFlowItemId: string | null
  parser: LogParser
  textSearchViewProps: TextSearchViewForwardProps
  processViewMobileProps: ProcessViewForwardProps
  processViewDesktopProps: ProcessViewForwardProps
  processViewEventHandlers: ProcessViewEventHandlers
  detailViewProps: DetailViewForwardProps
  onSelectTask: (task: TaskInfo) => void
  onNavigateToNode: (task: TaskInfo, node: NodeInfo) => void
  onUploadFile: UploadFileHandler
  onUploadContent: UploadContentHandler
  onMobileTaskSelect: (task: TaskInfo) => void
  onToggleDetailView: () => void
}>()

const emit = defineEmits<{
  'update:splitSize': [value: number]
  'update:splitVerticalSize': [value: number]
  'update:showTaskDrawer': [value: boolean]
  'update:showDetailDrawer': [value: boolean]
}>()
</script>

<template>
  <div style="flex: 1; min-height: 0">
    <main-content-analysis-section
      :active="viewMode === 'analysis'"
      :is-mobile="isMobile"
      :split-size="splitSize"
      :process-view-mobile-props="processViewMobileProps"
      :process-view-desktop-props="processViewDesktopProps"
      :process-view-event-handlers="processViewEventHandlers"
      :detail-view-props="detailViewProps"
      :show-task-drawer="showTaskDrawer"
      :show-detail-drawer="showDetailDrawer"
      :tasks="filteredTasks"
      :selected-task="selectedTask"
      @update:split-size="emit('update:splitSize', $event)"
      @update:show-task-drawer="emit('update:showTaskDrawer', $event)"
      @update:show-detail-drawer="emit('update:showDetailDrawer', $event)"
      @select-mobile-task="onMobileTaskSelect"
      @toggle-detail="onToggleDetailView"
    />

    <search-mode-pane
      :active="viewMode === 'search'"
      :text-search-view-props="textSearchViewProps"
    />

    <statistics-mode-pane
      :active="viewMode === 'statistics'"
      :tasks="tasks"
    />

    <flowchart-mode-pane
      :active="viewMode === 'flowchart'"
      :tasks="filteredTasks"
      :parser="parser"
      :selected-task="selectedTask"
      :on-select-task="onSelectTask"
      :on-navigate-to-node="onNavigateToNode"
      :on-upload-file="onUploadFile"
      :on-upload-content="onUploadContent"
    />

    <ai-mode-pane
      :active="viewMode === 'ai'"
      :tasks="tasks"
      :selected-task="selectedTask"
      :selected-node="selectedNode"
      :selected-flow-item-id="selectedFlowItemId"
      :loaded-targets="textSearchViewProps.loadedTargets"
      :loaded-default-target-id="textSearchViewProps.loadedDefaultTargetId"
      :has-deferred-loaded-targets="textSearchViewProps.hasDeferredLoadedTargets"
      :ensure-loaded-targets="textSearchViewProps.ensureLoadedTargets"
    />

    <main-content-split-section
      :active="viewMode === 'split'"
      :is-mobile="isMobile"
      :split-vertical-size="splitVerticalSize"
      :split-size="splitSize"
      :process-view-mobile-props="processViewMobileProps"
      :process-view-desktop-props="processViewDesktopProps"
      :process-view-event-handlers="processViewEventHandlers"
      :text-search-view-props="textSearchViewProps"
      :detail-view-props="detailViewProps"
      :show-task-drawer="showTaskDrawer"
      :show-detail-drawer="showDetailDrawer"
      :tasks="filteredTasks"
      :selected-task="selectedTask"
      @update:split-vertical-size="emit('update:splitVerticalSize', $event)"
      @update:split-size="emit('update:splitSize', $event)"
      @update:show-task-drawer="emit('update:showTaskDrawer', $event)"
      @update:show-detail-drawer="emit('update:showDetailDrawer', $event)"
      @select-mobile-task="onMobileTaskSelect"
      @toggle-detail="onToggleDetailView"
    />
  </div>
</template>
