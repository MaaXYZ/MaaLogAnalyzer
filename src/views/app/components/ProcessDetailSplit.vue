<script setup lang="ts">
import { NSplit } from 'naive-ui'
import ProcessView from '../../ProcessView.vue'
import DetailPanelCard from './DetailPanelCard.vue'
import type {
  DetailViewForwardProps,
  ProcessViewEventHandlers,
  ProcessViewForwardProps,
} from './types'

defineProps<{
  splitSize: number
  detailTitle: string
  processViewProps: ProcessViewForwardProps
  processViewEventHandlers: ProcessViewEventHandlers
  detailViewProps: DetailViewForwardProps
}>()

const emit = defineEmits<{
  'update:splitSize': [value: number]
  'toggle-detail': []
}>()

const handleSplitSizeUpdate = (value: number) => {
  emit('update:splitSize', value)
}

const handleToggleDetail = () => {
  emit('toggle-detail')
}
</script>

<template>
  <n-split
    :size="splitSize"
    @update:size="handleSplitSizeUpdate"
    :max="1"
    :min="0.4"
    style="height: 100%"
  >
    <template #1>
      <process-view
        v-bind="processViewProps"
        v-on="processViewEventHandlers"
      />
    </template>
    <template #2>
      <detail-panel-card
        :title="detailTitle"
        v-bind="detailViewProps"
        @toggle-collapse="handleToggleDetail"
      />
    </template>
  </n-split>
</template>
