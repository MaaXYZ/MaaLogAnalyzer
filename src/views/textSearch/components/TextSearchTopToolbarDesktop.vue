<script setup lang="ts">
import { NButton, NFlex, NIcon, NSelect, NTag, NText } from 'naive-ui'
import { FileTextOutlined, CloseOutlined } from '@vicons/antd'
import type { SourceMode } from './types'

const props = defineProps<{
  isLoadingFile: boolean
  fileName: string
  totalLines: number
  fileSizeInMB: number
  isLargeFile: boolean
  sourceMode: SourceMode
  sourceModeOptions: Array<{ label: string; value: string }>
  selectedLoadedTargetId: string
  loadedTargetOptions: Array<{ label: string; value: string }>
}>()

const emit = defineEmits<{
  'select-file': []
  'clear-content': []
  'update:sourceMode': [value: SourceMode]
  'update:selectedLoadedTargetId': [value: string]
}>()
</script>

<template>
  <n-flex align="center" justify="space-between" style="gap: 12px">
    <n-flex align="center" style="gap: 12px">
      <n-text strong style="font-size: 16px">📝 文本搜索</n-text>
      <n-select
        :value="props.sourceMode"
        :options="props.sourceModeOptions"
        size="small"
        style="width: 140px"
        @update:value="emit('update:sourceMode', $event)"
      />
      <n-select
        v-if="props.sourceMode === 'loaded'"
        :value="props.selectedLoadedTargetId"
        :options="props.loadedTargetOptions"
        placeholder="选择已加载目标"
        size="small"
        style="width: 320px"
        :disabled="props.loadedTargetOptions.length === 0"
        @update:value="emit('update:selectedLoadedTargetId', $event)"
      />
      <n-button
        size="small"
        type="primary"
        @click="emit('select-file')"
      >
        <template #icon>
          <file-text-outlined />
        </template>
        选择其它文件
      </n-button>

      <n-button
        v-if="props.fileName"
        size="small"
        @click="emit('clear-content')"
        secondary
        type="warning"
      >
        <template #icon>
          <n-icon><close-outlined /></n-icon>
        </template>
        清除
      </n-button>
    </n-flex>

    <n-flex align="center" style="gap: 12px">
      <n-text v-if="props.isLoadingFile" type="info" style="font-size: 13px">
        ⏳ 正在加载文件...
      </n-text>
      <n-text v-else-if="props.fileName" depth="3" style="font-size: 13px">
        📄 {{ props.fileName }}
      </n-text>
      <n-tag v-if="props.totalLines > 0 && !props.isLoadingFile" size="small" type="info">
        {{ props.totalLines }} 行
      </n-tag>
      <n-tag v-if="props.fileSizeInMB > 0 && !props.isLoadingFile" size="small" :type="props.isLargeFile ? 'error' : 'warning'">
        {{ props.fileSizeInMB.toFixed(2) }} MB
        <span v-if="props.isLargeFile"> (流式模式)</span>
      </n-tag>
    </n-flex>
  </n-flex>
</template>
