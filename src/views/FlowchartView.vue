<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { NScrollbar, NDrawer, NDrawerContent, NButton, NText } from 'naive-ui'
import FlowchartNode from '../components/FlowchartNode.vue'
import FlowchartOrthogonalEdge from '../components/FlowchartOrthogonalEdge.vue'
import FlowchartTopToolbar from './flowchart/components/FlowchartTopToolbar.vue'
import FlowchartTimelineNavList from './flowchart/components/FlowchartTimelineNavList.vue'
import FlowchartNodePopover from './flowchart/components/FlowchartNodePopover.vue'
import type { TaskInfo, NodeInfo } from '../types'
import { useIsMobile } from '../composables/useIsMobile'
import { getSettings, saveSettings } from '../utils/settings'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../utils/runtimeStatus'
import { useFlowchartUpload } from './flowchart/composables/useFlowchartUpload'
import { useFlowchartTaskSelection } from './flowchart/composables/useFlowchartTaskSelection'
import { useFlowchartPopover } from './flowchart/composables/useFlowchartPopover'
import { useFlowchartTimeline } from './flowchart/composables/useFlowchartTimeline'
import { useFlowchartPlayback } from './flowchart/composables/useFlowchartPlayback'
import { useFlowchartEdges } from './flowchart/composables/useFlowchartEdges'
import { useFlowchartGraphRuntime } from './flowchart/composables/useFlowchartGraphRuntime'
import { useFlowchartNodeInteraction } from './flowchart/composables/useFlowchartNodeInteraction'
import { findNodeInfoImage } from './flowchart/utils/nodeImageLookup'

const props = defineProps<{
  tasks: TaskInfo[]
  selectedTask?: TaskInfo | null
}>()

const emit = defineEmits<{
  'select-task': [task: TaskInfo]
  'navigate-to-node': [task: TaskInfo, node: NodeInfo]
  'upload-file': [file: File]
  'upload-content': [content: string, errorImages?: Map<string, string>, visionImages?: Map<string, string>, waitFreezesImages?: Map<string, string>]
}>()

const { isMobile } = useIsMobile()
const settings = getSettings()

const {
  selectedTaskIndex,
  taskOptions,
  selectedTask,
  renderTaskLabel,
  handleUserTaskSelect,
} = useFlowchartTaskSelection({
  tasks: computed(() => props.tasks),
  selectedTask: computed(() => props.selectedTask),
  onSelectTask: (task) => emit('select-task', task),
})

// 定位到日志分析界面
function navigateToNode(info: NodeInfo) {
  const task = selectedTask.value
  if (!task) return
  emit('navigate-to-node', task, info)
}

const {
  fileInputRef,
  folderInputRef,
  uploadOptions,
  handleUploadSelect,
  handleFileInputChange,
  handleFolderInputChange,
} = useFlowchartUpload({
  onUploadFile: (file) => emit('upload-file', file),
  onUploadContent: (content, errorImages, visionImages, waitFreezesImages) => {
    emit('upload-content', content, errorImages, visionImages, waitFreezesImages)
  },
})

void fileInputRef
void folderInputRef

// Vue Flow
const { fitView, getNode, setCenter } = useVueFlow('flowchart')

const flowNodes = ref<any[]>([])
const flowEdges = ref<any[]>([])
const focusedNodeId = ref<string | null>(null)
const edgeStyle = computed(() => settings.flowchartEdgeStyle)
const edgeFlowEnabled = computed(() => settings.flowchartEdgeFlowEnabled)
const ignoreUnexecutedNodes = computed(() => settings.flowchartIgnoreUnexecutedNodes)
const relayoutAfterDrag = computed(() => settings.flowchartRelayoutAfterDrag)
const playbackIntervalMs = computed<number>({
  get: () => (typeof settings.flowchartPlaybackIntervalMs === 'number' && settings.flowchartPlaybackIntervalMs > 0 ? settings.flowchartPlaybackIntervalMs : 900),
  set: (v) => { settings.flowchartPlaybackIntervalMs = v },
})
const focusZoom = computed<number>({
  get: () => (typeof settings.flowchartFocusZoom === 'number' && settings.flowchartFocusZoom > 0 ? settings.flowchartFocusZoom : 1.0),
  set: (v) => { settings.flowchartFocusZoom = v },
})

const {
  popoverNodeId,
  popoverPos,
  popoverNodeData,
  updatePopoverPosition,
  closePopover,
} = useFlowchartPopover({
  flowNodes,
})

const {
  selectedTimelineIndex,
  showNavDrawer,
  executionTimeline,
  timelineNavItems,
  getTimelineDotClass,
  selectedFlowNodeId,
  scrollNavToIndex,
} = useFlowchartTimeline({
  selectedTask,
})

const {
  highlightedNodeIds,
  applyEdgeRenderTypes,
  applyFocusStyles,
  recomputeEdgeRoutesForCurrentNodes,
  decorateInitialEdges,
} = useFlowchartEdges({
  flowNodes,
  flowEdges,
  focusedNodeId,
  edgeStyle,
  edgeFlowEnabled,
  getNodeById: (nodeId) => getNode.value(nodeId) as { position: { x: number; y: number } } | undefined,
})

const {
  isPlaying,
  stopPlayback,
  startPlayback,
  togglePlayback,
  selectTimelineItem,
} = useFlowchartPlayback({
  executionTimeline,
  selectedTimelineIndex,
  focusedNodeId,
  showNavDrawer,
  isMobile,
  focusZoom,
  playbackIntervalMs,
  getNodeById: (nodeId) => getNode.value(nodeId) as { position: { x: number; y: number } } | undefined,
  centerOnNode: setCenter,
  popoverNodeId,
  updatePopoverPosition,
  closePopover,
  scrollNavToIndex,
})

const handleSelectTimelineItem = (index: number) => {
  selectTimelineItem(index, timelineNavItems.value[index]?.focusNodeId)
}

watch(
  [selectedTimelineIndex, timelineNavItems],
  () => {
    const index = selectedTimelineIndex.value
    if (index == null) return
    focusedNodeId.value = timelineNavItems.value[index]?.focusNodeId ?? executionTimeline.value[index]?.name ?? null
  }
)

// 预计算 node_id → 截图 URL 映射（每个执行独立匹配）
const nodeImageMap = computed(() => {
  const map = new Map<number, string>()
  const task = selectedTask.value
  if (!task) return map

  for (const info of task.nodes) {
    const img = findNodeInfoImage(info)
    if (img) map.set(info.node_id, img)
  }

  return map
})

const { onNodeDragStop } = useFlowchartGraphRuntime({
  selectedTask,
  flowNodes,
  flowEdges,
  focusedNodeId,
  popoverNodeId,
  selectedTimelineIndex,
  isPlaying,
  playbackIntervalMs,
  focusZoom,
  edgeStyle,
  edgeFlowEnabled,
  ignoreUnexecutedNodes,
  relayoutAfterDrag,
  stopPlayback,
  startPlayback,
  closePopover,
  fitView,
  updatePopoverPosition,
  decorateInitialEdges,
  applyFocusStyles,
  applyEdgeRenderTypes,
  recomputeEdgeRoutesForCurrentNodes,
  persistSettings: () => saveSettings(settings),
})

onBeforeUnmount(() => {
  stopPlayback()
})

const { onNodeClick, onPaneClick } = useFlowchartNodeInteraction({
  executionTimeline,
  popoverNodeId,
  focusedNodeId,
  selectedTimelineIndex,
  stopPlayback,
  closePopover,
  updatePopoverPosition,
  scrollNavToIndex,
})
</script>

<template>
  <div class="flowchart-view">
    <flowchart-top-toolbar
      :selected-task-index="selectedTaskIndex"
      :task-options="taskOptions"
      :render-task-label="renderTaskLabel"
      :execution-timeline-length="executionTimeline.length"
      :is-playing="isPlaying"
      :upload-options="uploadOptions"
      @update:selected-task-index="handleUserTaskSelect"
      @toggle-playback="togglePlayback"
      @upload-select="handleUploadSelect"
    />

    <!-- Hidden file inputs -->
    <input ref="fileInputRef" type="file" accept=".log,.jsonl,.txt,.zip" style="display: none" @change="handleFileInputChange" />
    <input ref="folderInputRef" type="file" webkitdirectory style="display: none" @change="handleFolderInputChange" />

    <div class="flowchart-body">
      <!-- Desktop left nav panel -->
      <div v-if="!isMobile && executionTimeline.length > 0" class="flowchart-nav-panel" data-tour="flowchart-execution-nav">
        <div class="nav-header">
          <n-text strong style="font-size: 13px">执行顺序</n-text>
        </div>
        <n-scrollbar style="flex: 1">
          <flowchart-timeline-nav-list
            :items="timelineNavItems"
            :selected-index="selectedTimelineIndex"
            :get-dot-class="getTimelineDotClass"
            @select="handleSelectTimelineItem"
          />
        </n-scrollbar>
      </div>

      <!-- Vue Flow canvas -->
      <div class="flowchart-canvas" data-tour="flowchart-canvas">
        <!-- Mobile nav floating button -->
        <n-button
          v-if="isMobile && executionTimeline.length > 0"
          class="nav-float-btn"
          size="small"
          secondary
          @click="showNavDrawer = true"
        >
          导航
        </n-button>

        <VueFlow
          id="flowchart"
          :nodes="flowNodes"
          :edges="flowEdges"
          :default-viewport="{ x: 0, y: 0, zoom: 1 }"
          :min-zoom="0.1"
          :max-zoom="3"
          fit-view-on-init
          @node-click="onNodeClick"
          @node-drag-stop="onNodeDragStop"
          @pane-click="onPaneClick"
        >
          <template #node-flowchartNode="nodeProps">
            <FlowchartNode
              :data="nodeProps.data"
              :selected="nodeProps.id === (focusedNodeId ?? selectedFlowNodeId)"
              :is-start="nodeProps.id === executionTimeline[0]?.name"
              :dimmed="highlightedNodeIds != null && !highlightedNodeIds.has(nodeProps.id)"
            />
          </template>
          <template #edge-orthogonalEdge="edgeProps">
            <FlowchartOrthogonalEdge v-bind="edgeProps" />
          </template>
        </VueFlow>

        <flowchart-node-popover
          :visible="!!(popoverNodeId && popoverNodeData)"
          :position="popoverPos"
          :popover-data="popoverNodeData"
          :node-image-map="nodeImageMap"
          :get-runtime-status-tag-type="getRuntimeStatusTagType"
          :get-runtime-status-text="getRuntimeStatusText"
          @close="closePopover"
          @navigate-to-node="navigateToNode"
        />
      </div>

      <!-- Mobile left drawer for navigation -->
      <n-drawer
        v-if="isMobile"
        v-model:show="showNavDrawer"
        placement="left"
        :width="260"
      >
        <n-drawer-content title="执行顺序">
          <flowchart-timeline-nav-list
            :items="timelineNavItems"
            :selected-index="selectedTimelineIndex"
            :get-dot-class="getTimelineDotClass"
            @select="handleSelectTimelineItem"
          />
        </n-drawer-content>
      </n-drawer>
    </div>
  </div>
</template>

<style scoped src="./flowchart/styles/flowchartView.scoped.css"></style>

<!-- Unscoped: theme CSS variables (must not be scoped to work on :root/body) -->
<style src="./flowchart/styles/flowchartView.theme.css"></style>
