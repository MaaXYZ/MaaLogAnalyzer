<script setup lang="ts">
import { NSelect, NCard, NFlex, NText, NButton, NDropdown, NSwitch } from 'naive-ui'
import type { VNodeChild } from 'vue'

defineProps<{
  selectedTaskIndex: number | null
  taskOptions: any[]
  renderTaskLabel: (option: any) => VNodeChild
  executionTimelineLength: number
  isPlaying: boolean
  uploadOptions: any[]
  ignoreUnexecutedNodes: boolean
}>()

const emit = defineEmits<{
  'update:selected-task-index': [value: number | null]
  'toggle-playback': []
  'upload-select': [key: string]
  'update:ignore-unexecuted-nodes': [value: boolean]
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
      <n-flex align="center" style="gap: 6px">
        <n-text depth="3" style="font-size: 12px; white-space: nowrap" title="开启后仅保留本次执行过的节点，隐藏流水线中未经过的节点">忽略未经过节点</n-text>
        <n-switch
          size="small"
          :value="ignoreUnexecutedNodes"
          @update:value="emit('update:ignore-unexecuted-nodes', $event)"
        />
      </n-flex>
      <n-dropdown :options="uploadOptions" @select="emit('upload-select', String($event))" trigger="click">
        <n-button size="small" secondary>打开</n-button>
      </n-dropdown>
    </n-flex>
  </n-card>
</template>
