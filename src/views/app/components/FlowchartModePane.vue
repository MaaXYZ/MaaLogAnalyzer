<script setup lang="ts">
import { createAsyncView } from '../../../utils/asyncView'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { UploadContentHandler, UploadFileHandler } from './types'

const FlowchartView = createAsyncView('流程图', () => import('../../FlowchartView.vue'))

defineProps<{
  active: boolean
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  onSelectTask: (task: TaskInfo) => void
  onNavigateToNode: (task: TaskInfo, node: NodeInfo) => void
  onUploadFile: UploadFileHandler
  onUploadContent: UploadContentHandler
}>()
</script>

<template>
  <div v-if="active" data-tour="flowchart-main" style="height: 100%">
    <flowchart-view
      :tasks="tasks"
      :selected-task="selectedTask"
      style="height: 100%"
      @select-task="onSelectTask"
      @navigate-to-node="onNavigateToNode"
      @upload-file="onUploadFile"
      @upload-content="onUploadContent"
    />
  </div>
</template>
