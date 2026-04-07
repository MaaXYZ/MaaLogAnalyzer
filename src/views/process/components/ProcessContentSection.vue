<script setup lang="ts">
import type { NodeInfo, TaskInfo } from '../../../types'
import type { NodeNavViewItem } from '../composables/useNodeNavSearch'
import type { VNodeChild } from 'vue'
import EmptyUploadPanel from './EmptyUploadPanel.vue'
import ProcessMobilePane from './ProcessMobilePane.vue'
import ProcessDesktopPane from './ProcessDesktopPane.vue'
import { buildTaskIdentity } from '../../../utils/taskIdentity'

type ReloadOption = { label: string; key: string; icon: () => VNodeChild }
type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

const getSelectedTaskKey = (task: TaskInfo | null): string | null => {
  if (!task) return null
  return buildTaskIdentity(task)
}

const props = defineProps<{
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode?: NodeInfo | null
  isMobile?: boolean
  settingsDisplayMode: string
  detailViewCollapsed: boolean
  showDetailButton: boolean
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
  isInTauri: boolean
  isInVSCode: boolean
  showReloadControls: boolean
  reloadOptions: ReloadOption[]
  currentNodes: NodeTimelineItem[]
  showRealtimeStatus: boolean
  isRealtimeStreaming: boolean
  followLast: boolean
  taskListCollapsed: boolean
  nodeNavCollapsed: boolean
  taskListSize: number
  nodeNavSize: number
  activeTaskIndex: number
  nodeNavItems: NodeNavViewItem[]
  nodeNavSearchText: string
  normalizedNodeNavSearchText: string
  nodeNavFailedOnly: boolean
  nodeNavEmptyDescription: string
  setTaskListPanelRef: (instance: unknown | null) => void
  setNodeNavPanelRef: (instance: unknown | null) => void
  onTauriOpen: () => void
  onTauriOpenFolder: () => void
  onVSCodeOpen: () => void
  onVSCodeOpenFolder: () => void
  onDrop: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onReloadSelect: (key: string) => void
  onScrollerMounted: (scroller: object | null) => void
  onSelectNode: (node: NodeInfo) => void
  onSelectAction: (node: NodeInfo) => void
  onSelectRecognition: (node: NodeInfo, attemptIndex: number) => void
  onSelectFlowItem: (node: NodeInfo, flowItemId: string) => void
  onUpdateTaskListSize: (size: number) => void
  onUpdateNodeNavSize: (size: number) => void
  onToggleTaskList: () => void
  onToggleNodeNav: () => void
  onExpandDetail: () => void
  onSelectTaskIndex: (index: number) => void
  onToggleFollow: () => void
  onUpdateNodeNavSearchText: (text: string) => void
  onToggleNodeNavFailedOnly: () => void
  onSelectNodeNav: (index: number) => void
  onManualScrollUp: () => void
}>()
</script>

<template>
  <empty-upload-panel
    v-if="props.tasks.length === 0"
    :is-in-tauri="props.isInTauri"
    :is-in-vscode="props.isInVSCode"
    :is-vscode-launch-embed="props.isVscodeLaunchEmbed === true"
    :show-reload-controls="props.showReloadControls"
    :reload-options="props.reloadOptions"
    @tauri-open="props.onTauriOpen"
    @tauri-open-folder="props.onTauriOpenFolder"
    @vscode-open="props.onVSCodeOpen"
    @vscode-open-folder="props.onVSCodeOpenFolder"
    @drop="props.onDrop"
    @drag-over="props.onDragOver"
    @reload-select="props.onReloadSelect"
  />

  <template v-else>
    <template v-if="props.isMobile">
      <process-mobile-pane
        :current-nodes="props.currentNodes"
        :selected-task-key="getSelectedTaskKey(props.selectedTask)"
        :display-mode="props.settingsDisplayMode"
        :is-vscode-launch-embed="props.isVscodeLaunchEmbed"
        :bridge-request-task-doc="props.bridgeRequestTaskDoc"
        :bridge-reveal-task="props.bridgeRevealTask"
        @scroller-mounted="props.onScrollerMounted"
        @manual-scroll-up="props.onManualScrollUp"
        @select-node="props.onSelectNode"
        @select-action="props.onSelectAction"
        @select-recognition="props.onSelectRecognition"
        @select-flow-item="props.onSelectFlowItem"
      />
    </template>

    <template v-else>
      <process-desktop-pane
        :task-list-collapsed="props.taskListCollapsed"
        :node-nav-collapsed="props.nodeNavCollapsed"
        :detail-view-collapsed="props.detailViewCollapsed"
        :show-detail-button="props.showDetailButton"
        :task-list-size="props.taskListSize"
        :node-nav-size="props.nodeNavSize"
        :tasks="props.tasks"
        :active-task-index="props.activeTaskIndex"
        :current-nodes="props.currentNodes"
        :selected-node-id="props.selectedNode?.node_id ?? null"
        :selected-task-key="getSelectedTaskKey(props.selectedTask)"
        :display-mode="props.settingsDisplayMode"
        :show-realtime-status="props.showRealtimeStatus"
        :is-realtime-streaming="props.isRealtimeStreaming"
        :follow-last="props.followLast"
        :show-reload-controls="props.showReloadControls"
        :reload-options="props.reloadOptions"
        :is-in-tauri="props.isInTauri"
        :is-in-v-s-code="props.isInVSCode"
        :node-nav-items="props.nodeNavItems"
        :node-nav-search-text="props.nodeNavSearchText"
        :normalized-node-nav-search-text="props.normalizedNodeNavSearchText"
        :node-nav-failed-only="props.nodeNavFailedOnly"
        :node-nav-empty-description="props.nodeNavEmptyDescription"
        :is-vscode-launch-embed="props.isVscodeLaunchEmbed"
        :bridge-request-task-doc="props.bridgeRequestTaskDoc"
        :bridge-reveal-task="props.bridgeRevealTask"
        :set-task-list-panel-ref="props.setTaskListPanelRef"
        :set-node-nav-panel-ref="props.setNodeNavPanelRef"
        @update:task-list-size="props.onUpdateTaskListSize"
        @update:node-nav-size="props.onUpdateNodeNavSize"
        @toggle-task-list="props.onToggleTaskList"
        @toggle-node-nav="props.onToggleNodeNav"
        @expand-detail="props.onExpandDetail"
        @select-task-index="props.onSelectTaskIndex"
        @toggle-follow="props.onToggleFollow"
        @reload-select="props.onReloadSelect"
        @update:node-nav-search-text="props.onUpdateNodeNavSearchText"
        @toggle-node-nav-failed-only="props.onToggleNodeNavFailedOnly"
        @select-node-nav="props.onSelectNodeNav"
        @manual-scroll-up="props.onManualScrollUp"
        @scroller-mounted="props.onScrollerMounted"
        @select-node="props.onSelectNode"
        @select-action="props.onSelectAction"
        @select-recognition="props.onSelectRecognition"
        @select-flow-item="props.onSelectFlowItem"
      />
    </template>
  </template>
</template>
