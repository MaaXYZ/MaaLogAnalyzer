<script setup lang="ts">
import type { TaskInfo } from '../../../types'
import SplitModePane from './SplitModePane.vue'
import type {
  DetailViewForwardProps,
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
  TextSearchViewForwardProps,
} from './types'

defineProps<{
  active: boolean
  isMobile: boolean
  splitVerticalSize: number
  splitSize: number
  processViewMobileProps: ProcessViewForwardProps
  processViewDesktopProps: ProcessViewForwardProps
  processViewEventHandlers: ProcessViewEventHandlers
  textSearchViewProps: TextSearchViewForwardProps
  detailViewProps: DetailViewForwardProps
  showTaskDrawer: boolean
  showDetailDrawer: boolean
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
}>()

const emit = defineEmits<{
  'update:split-vertical-size': [value: number]
  'update:split-size': [value: number]
  'update:show-task-drawer': [value: boolean]
  'update:show-detail-drawer': [value: boolean]
  'select-mobile-task': [task: TaskInfo]
  'toggle-detail': []
}>()

const handleSplitVerticalSizeUpdate = (value: number) => {
  emit('update:split-vertical-size', value)
}

const handleSplitSizeUpdate = (value: number) => {
  emit('update:split-size', value)
}

const handleTaskDrawerUpdate = (value: boolean) => {
  emit('update:show-task-drawer', value)
}

const handleDetailDrawerUpdate = (value: boolean) => {
  emit('update:show-detail-drawer', value)
}

const handleSelectMobileTask = (task: TaskInfo) => {
  emit('select-mobile-task', task)
}
</script>

<template>
  <div v-show="active" data-tour="split-main" style="height: 100%">
    <split-mode-pane
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
      :tasks="tasks"
      :selected-task="selectedTask"
      @update:split-vertical-size="handleSplitVerticalSizeUpdate"
      @update:split-size="handleSplitSizeUpdate"
      @update:show-task-drawer="handleTaskDrawerUpdate"
      @update:show-detail-drawer="handleDetailDrawerUpdate"
      @select-mobile-task="handleSelectMobileTask"
      @toggle-detail="emit('toggle-detail')"
    />
  </div>
</template>
