<script setup lang="ts">
import { NSelect, NCard, NFlex, NText, NButton, NDropdown } from 'naive-ui'
import type { VNodeChild } from 'vue'

defineProps<{
  selectedTaskIndex: number | null
  taskOptions: any[]
  renderTaskLabel: (option: any) => VNodeChild
  executionTimelineLength: number
  isPlaying: boolean
  uploadOptions: any[]
}>()

const emit = defineEmits<{
  'update:selected-task-index': [value: number | null]
  'toggle-playback': []
  'upload-select': [key: string]
}>()
</script>

<template>
  <n-card size="small" data-tour="flowchart-toolbar" :bordered="false" content-style="padding: 8px 12px">
    <n-flex align="center" style="gap: 12px">
      <n-text strong>任务:</n-text>
      <n-select
        :value="selectedTaskIndex"
        :options="taskOptions"
        :render-label="renderTaskLabel"
        placeholder="选择任务"
        size="small"
        style="min-width: 125px; flex: 1; max-width: 250px"
        @update:value="emit('update:selected-task-index', $event)"
      />
      <n-button size="small" secondary :disabled="executionTimelineLength === 0" @click="emit('toggle-playback')">
        {{ isPlaying ? '\u6682\u505c\u56de\u653e' : '\u987a\u5e8f\u56de\u653e' }}
      </n-button>
      <n-dropdown :options="uploadOptions" @select="emit('upload-select', String($event))" trigger="click">
        <n-button size="small" secondary>打开</n-button>
      </n-dropdown>
    </n-flex>
  </n-card>
</template>
