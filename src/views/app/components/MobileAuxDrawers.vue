<script setup lang="ts">
import MobileTaskDrawer from './MobileTaskDrawer.vue'
import MobileDetailDrawer from './MobileDetailDrawer.vue'
import type { TaskInfo } from '../../../types'
import type { DetailViewForwardProps } from './types'

defineProps<{
  showTaskDrawer: boolean
  showDetailDrawer: boolean
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  detailViewProps: DetailViewForwardProps
}>()

const emit = defineEmits<{
  'update:showTaskDrawer': [value: boolean]
  'update:showDetailDrawer': [value: boolean]
  'select-task': [task: TaskInfo]
}>()

const handleTaskDrawerUpdate = (value: boolean) => {
  emit('update:showTaskDrawer', value)
}

const handleDetailDrawerUpdate = (value: boolean) => {
  emit('update:showDetailDrawer', value)
}

const handleTaskSelect = (task: TaskInfo) => {
  emit('select-task', task)
}
</script>

<template>
  <mobile-task-drawer
    :show="showTaskDrawer"
    :tasks="tasks"
    :selected-task="selectedTask"
    @update:show="handleTaskDrawerUpdate"
    @select-task="handleTaskSelect"
  />

  <mobile-detail-drawer
    :show="showDetailDrawer"
    v-bind="detailViewProps"
    @update:show="handleDetailDrawerUpdate"
  />
</template>
