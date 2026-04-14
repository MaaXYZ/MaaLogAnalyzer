<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { NodeInfo, TaskInfo } from '../../../types'
import MainContentAnalysisSection from './MainContentAnalysisSection.vue'
import type {
  DetailViewForwardProps,
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
  TextSearchViewForwardProps,
  UploadContentHandler,
  UploadFileHandler,
} from './types'

const SearchModePane = defineAsyncComponent(() => import('./SearchModePane.vue'))
const StatisticsModePane = defineAsyncComponent(() => import('./StatisticsModePane.vue'))
const FlowchartModePane = defineAsyncComponent(() => import('./FlowchartModePane.vue'))
const MainContentSplitSection = defineAsyncComponent(() => import('./MainContentSplitSection.vue'))

defineProps<{
  viewMode: string
  isMobile: boolean
  isVscodeLaunchEmbed: boolean
  splitSize: number
  splitVerticalSize: number
  showTaskDrawer: boolean
  showDetailDrawer: boolean
  filteredTasks: TaskInfo[]
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode: NodeInfo | null
  selectedFlowItemId: string | null
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
      v-if="viewMode === 'analysis'"
      :active="true"
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
      v-else-if="viewMode === 'search'"
      :active="true"
      :text-search-view-props="textSearchViewProps"
    />

    <statistics-mode-pane
      v-else-if="viewMode === 'statistics'"
      :active="true"
      :tasks="tasks"
      :is-vscode-launch-embed="isVscodeLaunchEmbed"
    />

    <flowchart-mode-pane
      v-else-if="viewMode === 'flowchart'"
      :active="true"
      :tasks="filteredTasks"
      :selected-task="selectedTask"
      :on-select-task="onSelectTask"
      :on-navigate-to-node="onNavigateToNode"
      :on-upload-file="onUploadFile"
      :on-upload-content="onUploadContent"
    />

    <main-content-split-section
      v-else-if="viewMode === 'split'"
      :active="true"
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
