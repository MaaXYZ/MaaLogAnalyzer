<script setup lang="ts">
import { NSplit } from 'naive-ui'
import TextSearchView from '../../TextSearchView.vue'
import SplitMobilePane from './SplitMobilePane.vue'
import MobileAuxDrawers from './MobileAuxDrawers.vue'
import ProcessDetailSplit from './ProcessDetailSplit.vue'
import type { TaskInfo } from '../../../types'
import type {
  DetailViewForwardProps,
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
  TextSearchViewForwardProps,
} from './types'

defineProps<{
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
  'update:splitVerticalSize': [value: number]
  'update:splitSize': [value: number]
  'update:showTaskDrawer': [value: boolean]
  'update:showDetailDrawer': [value: boolean]
  'select-mobile-task': [task: TaskInfo]
  'toggle-detail': []
}>()

const handleSplitVerticalSizeUpdate = (value: number) => {
  emit('update:splitVerticalSize', value)
}

const handleSplitSizeUpdate = (value: number) => {
  emit('update:splitSize', value)
}

const handleTaskDrawerUpdate = (value: boolean) => {
  emit('update:showTaskDrawer', value)
}

const handleDetailDrawerUpdate = (value: boolean) => {
  emit('update:showDetailDrawer', value)
}

const handleSelectMobileTask = (task: TaskInfo) => {
  emit('select-mobile-task', task)
}

const handleToggleDetail = () => {
  emit('toggle-detail')
}
</script>

<template>
  <template v-if="isMobile">
    <split-mobile-pane
      :split-vertical-size="splitVerticalSize"
      :process-view-props="processViewMobileProps"
      :process-view-event-handlers="processViewEventHandlers"
      :text-search-view-props="textSearchViewProps"
      @update:split-vertical-size="handleSplitVerticalSizeUpdate"
    />

    <mobile-aux-drawers
      :show-task-drawer="showTaskDrawer"
      :show-detail-drawer="showDetailDrawer"
      :tasks="tasks"
      :selected-task="selectedTask"
      :detail-view-props="detailViewProps"
      @update:show-task-drawer="handleTaskDrawerUpdate"
      @update:show-detail-drawer="handleDetailDrawerUpdate"
      @select-task="handleSelectMobileTask"
    />
  </template>

  <n-split
    v-else
    direction="vertical"
    :size="splitVerticalSize"
    @update:size="handleSplitVerticalSizeUpdate"
    :min="0.2"
    :max="0.8"
    style="height: 100%"
  >
    <template #1>
      <process-detail-split
        :split-size="splitSize"
        detail-title="节点详情"
        :process-view-props="processViewDesktopProps"
        :process-view-event-handlers="processViewEventHandlers"
        :detail-view-props="detailViewProps"
        @update:split-size="handleSplitSizeUpdate"
        @toggle-detail="handleToggleDetail"
      />
    </template>

    <template #2>
      <text-search-view
        v-bind="textSearchViewProps"
        style="height: 100%"
      />
    </template>
  </n-split>
</template>
