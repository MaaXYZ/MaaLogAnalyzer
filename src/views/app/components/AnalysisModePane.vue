<script setup lang="ts">
import ProcessView from '../../ProcessView.vue'
import MobileAuxDrawers from './MobileAuxDrawers.vue'
import ProcessDetailSplit from './ProcessDetailSplit.vue'
import type { TaskInfo } from '../../../types'
import type {
  DetailViewForwardProps,
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
} from './types'

defineProps<{
  isMobile: boolean
  splitSize: number
  processViewMobileProps: ProcessViewForwardProps
  processViewDesktopProps: ProcessViewForwardProps
  processViewEventHandlers: ProcessViewEventHandlers
  detailViewProps: DetailViewForwardProps
  showTaskDrawer: boolean
  showDetailDrawer: boolean
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
}>()

const emit = defineEmits<{
  'update:splitSize': [value: number]
  'update:showTaskDrawer': [value: boolean]
  'update:showDetailDrawer': [value: boolean]
  'select-mobile-task': [task: TaskInfo]
  'toggle-detail': []
}>()

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
    <process-view
      v-bind="processViewMobileProps"
      v-on="processViewEventHandlers"
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

  <process-detail-split
    v-else
    :split-size="splitSize"
    detail-title="详细信息"
    :process-view-props="processViewDesktopProps"
    :process-view-event-handlers="processViewEventHandlers"
    :detail-view-props="detailViewProps"
    @update:split-size="handleSplitSizeUpdate"
    @toggle-detail="handleToggleDetail"
  />
</template>
