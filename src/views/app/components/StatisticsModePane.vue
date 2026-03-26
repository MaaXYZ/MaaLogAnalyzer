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
  <div v-if="active" data-tour="statistics-main" style="height: 100%">
    <node-statistics-view :tasks="tasks" style="height: 100%" />
  </div>
</template>
