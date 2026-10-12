<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { TaskInfo } from '../../../types'

const NodeStatisticsView = defineAsyncComponent(() => import('../../NodeStatisticsView.vue'))

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
