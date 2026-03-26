<script setup lang="ts">
import { NSplit, NFlex, NText, NButton } from 'naive-ui'
import ProcessView from '../../ProcessView.vue'
import TextSearchView from '../../TextSearchView.vue'
import type {
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
  TextSearchViewForwardProps,
} from './types'

defineProps<{
  splitVerticalSize: number
  processViewProps: ProcessViewForwardProps
  processViewEventHandlers: ProcessViewEventHandlers
  textSearchViewProps: TextSearchViewForwardProps
}>()

const emit = defineEmits<{
  'update:splitVerticalSize': [value: number]
}>()

const handleSplitSizeUpdate = (value: number) => {
  emit('update:splitVerticalSize', value)
}

const setSplitSize = (value: number) => {
  emit('update:splitVerticalSize', value)
}
</script>

<template>
  <div style="height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; box-sizing: border-box;">
    <n-flex align="center" justify="space-between" style="gap: 8px">
      <n-text depth="3" style="font-size: 12px">分屏比例</n-text>
      <n-flex align="center" style="gap: 6px">
        <n-button size="tiny" @click="setSplitSize(0.72)">分析优先</n-button>
        <n-button size="tiny" @click="setSplitSize(0.5)">均分</n-button>
        <n-button size="tiny" @click="setSplitSize(0.28)">搜索优先</n-button>
      </n-flex>
    </n-flex>

    <n-split
      direction="vertical"
      :size="splitVerticalSize"
      @update:size="handleSplitSizeUpdate"
      :min="0.15"
      :max="0.85"
      style="flex: 1; min-height: 0"
    >
      <template #1>
        <process-view
          v-bind="processViewProps"
          style="height: 100%"
          v-on="processViewEventHandlers"
        />
      </template>
      <template #2>
        <text-search-view
          v-bind="textSearchViewProps"
          style="height: 100%"
        />
      </template>
    </n-split>
  </div>
</template>
