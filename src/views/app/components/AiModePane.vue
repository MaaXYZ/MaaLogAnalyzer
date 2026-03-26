<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { LoadedSearchTarget } from './types'

const AiAnalysisView = defineAsyncComponent(() => import('../../AiAnalysisView.vue'))

defineProps<{
  active: boolean
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode: NodeInfo | null
  selectedFlowItemId: string | null
  loadedTargets: LoadedSearchTarget[]
  loadedDefaultTargetId: string
  hasDeferredLoadedTargets: boolean
  ensureLoadedTargets: (() => Promise<void>) | undefined
}>()
</script>

<template>
  <div v-if="active" data-tour="ai-main" style="height: 100%">
    <ai-analysis-view
      :tasks="tasks"
      :selected-task="selectedTask"
      :selected-node="selectedNode"
      :selected-flow-item-id="selectedFlowItemId"
      :loaded-targets="loadedTargets"
      :loaded-default-target-id="loadedDefaultTargetId"
      :has-deferred-loaded-targets="hasDeferredLoadedTargets"
      :ensure-loaded-targets="ensureLoadedTargets"
      style="height: 100%"
    />
  </div>
</template>
