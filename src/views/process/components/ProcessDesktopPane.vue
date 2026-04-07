<script setup lang="ts">
import ProcessDesktopLayoutShell from './ProcessDesktopLayoutShell.vue'
import TaskListPanel from './TaskListPanel.vue'
import ProcessTimelineToolbar from './ProcessTimelineToolbar.vue'
import NodeNavPanel from './NodeNavPanel.vue'
import ProcessTimelineListPane from './ProcessTimelineListPane.vue'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { NodeNavViewItem } from '../composables/useNodeNavSearch'
import type { VNodeChild } from 'vue'

type ReloadOption = {
  label: string
  key: string
  icon: () => VNodeChild
}

type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

const props = defineProps<{
  taskListCollapsed: boolean
  nodeNavCollapsed: boolean
  detailViewCollapsed: boolean
  showDetailButton: boolean
  taskListSize: number
  nodeNavSize: number
  tasks: TaskInfo[]
  activeTaskIndex: number
  currentNodes: NodeTimelineItem[]
  selectedNodeId?: number | null
  selectedTaskKey?: string | null
  displayMode: string
  showRealtimeStatus: boolean
  isRealtimeStreaming: boolean
  followLast: boolean
  showReloadControls: boolean
  reloadOptions: ReloadOption[]
  isInTauri: boolean
  isInVSCode: boolean
  nodeNavItems: NodeNavViewItem[]
  nodeNavSearchText: string
  normalizedNodeNavSearchText: string
  nodeNavFailedOnly: boolean
  nodeNavEmptyDescription: string
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
  setTaskListPanelRef?: (instance: unknown | null) => void
  setNodeNavPanelRef?: (instance: unknown | null) => void
}>()

const emit = defineEmits<{
  'update:task-list-size': [value: number]
  'update:node-nav-size': [value: number]
  'toggle-task-list': []
  'toggle-node-nav': []
  'expand-detail': []
  'select-task-index': [index: number]
  'toggle-follow': []
  'reload-select': [key: string]
  'update:node-nav-search-text': [value: string]
  'toggle-node-nav-failed-only': []
  'select-node-nav': [index: number]
  'manual-scroll-up': []
  'scroller-mounted': [scroller: object | null]
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
}>()

const handleSelectNodeNav = (index: number) => {
  emit('select-node-nav', index)
  const item = props.nodeNavItems.find((entry) => entry.originalIndex === index)
  if (item) {
    emit('select-node', item.node)
  }
}
</script>

<template>
  <process-desktop-layout-shell
    :task-list-collapsed="taskListCollapsed"
    :node-nav-collapsed="nodeNavCollapsed"
    :detail-view-collapsed="detailViewCollapsed"
    :show-detail-button="showDetailButton"
    :task-list-size="taskListSize"
    :node-nav-size="nodeNavSize"
    @update:task-list-size="emit('update:task-list-size', $event)"
    @update:node-nav-size="emit('update:node-nav-size', $event)"
    @toggle-task-list="emit('toggle-task-list')"
    @toggle-node-nav="emit('toggle-node-nav')"
    @expand-detail="emit('expand-detail')"
  >
    <template #task-list>
      <task-list-panel
        :ref="props.setTaskListPanelRef"
        :tasks="tasks"
        :active-task-index="activeTaskIndex"
        @select-task="emit('select-task-index', $event)"
        @manual-scroll-up="emit('manual-scroll-up')"
      />
    </template>

    <template #timeline-toolbar>
      <process-timeline-toolbar
        :show-realtime-status="showRealtimeStatus"
        :is-realtime-streaming="isRealtimeStreaming"
        :follow-last="followLast"
        :show-reload-controls="showReloadControls"
        :reload-options="reloadOptions"
        :is-in-tauri="isInTauri"
        :is-in-v-s-code="isInVSCode"
        @toggle-follow="emit('toggle-follow')"
        @reload-select="emit('reload-select', $event)"
      />
    </template>

    <template #node-nav>
      <node-nav-panel
        :ref="props.setNodeNavPanelRef"
        :items="nodeNavItems"
        :selected-node-id="selectedNodeId ?? null"
        :current-nodes-length="currentNodes.length"
        :display-mode="displayMode"
        :search-text="nodeNavSearchText"
        :normalized-search-text="normalizedNodeNavSearchText"
        :failed-only="nodeNavFailedOnly"
        :empty-description="nodeNavEmptyDescription"
        @update:search-text="emit('update:node-nav-search-text', $event)"
        @toggle-failed-only="emit('toggle-node-nav-failed-only')"
        @select-node="handleSelectNodeNav"
        @manual-scroll-up="emit('manual-scroll-up')"
      />
    </template>

    <template #timeline-list>
      <process-timeline-list-pane
        :current-nodes="currentNodes"
        :selected-task-key="selectedTaskKey"
        :display-mode="displayMode"
        :is-vscode-launch-embed="isVscodeLaunchEmbed"
        :bridge-request-task-doc="bridgeRequestTaskDoc"
        :bridge-reveal-task="bridgeRevealTask"
        @manual-scroll-up="emit('manual-scroll-up')"
        @scroller-mounted="emit('scroller-mounted', $event)"
        @select-node="emit('select-node', $event)"
        @select-action="emit('select-action', $event)"
        @select-recognition="(node, attemptIndex) => emit('select-recognition', node, attemptIndex)"
        @select-flow-item="(node, flowItemId) => emit('select-flow-item', node, flowItemId)"
      />
    </template>
  </process-desktop-layout-shell>
</template>
