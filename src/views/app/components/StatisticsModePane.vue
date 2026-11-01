<script setup lang="ts">
import { createAsyncView } from '../../../utils/asyncView'
import type { TaskInfo } from '../../../types'

const NodeStatisticsView = createAsyncView('运行统计', () => import('../../NodeStatisticsView.vue'))

defineProps<{
  active: boolean
  tasks: TaskInfo[]
}>()
</script>

<template>
  <div v-if="active" data-tour="statistics-main" class="statistics-mode-pane">
    <node-statistics-view :tasks="tasks" style="height: 100%" />
  </div>
</template>

<style scoped>
.statistics-mode-pane {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
