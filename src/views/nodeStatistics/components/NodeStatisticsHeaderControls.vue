<script setup lang="ts">
import { NFlex, NInput, NRadioButton, NRadioGroup, NSelect } from 'naive-ui'
import type { StatMode } from '../composables/useNodeStatisticsMetrics'

const props = defineProps<{
  isMobile: boolean
  statMode: StatMode
  taskFilter: string | number
  taskOptions: Array<{ label: string; value: string | number }>
  searchKeyword: string
}>()

const emit = defineEmits<{
  'update:statMode': [value: StatMode]
  'update:taskFilter': [value: string | number]
  'update:searchKeyword': [value: string]
}>()
</script>

<template>
  <n-flex class="statistics-controls" align="center" :wrap="true">
    <n-radio-group
      :value="props.statMode"
      size="small"
      @update:value="emit('update:statMode', $event)"
    >
      <n-radio-button value="node">节点</n-radio-button>
      <n-radio-button value="recognition-action">识别/动作</n-radio-button>
      <n-radio-button value="wait-freezes">Wait Freezes</n-radio-button>
    </n-radio-group>

    <n-select
      :value="props.taskFilter"
      :options="props.taskOptions"
      :consistent-menu-width="false"
      size="small"
      :style="props.isMobile ? 'width: 150px' : 'width: 240px'"
      @update:value="emit('update:taskFilter', $event)"
    />

    <n-input
      v-if="!props.isMobile"
      :value="props.searchKeyword"
      placeholder="搜索节点名称"
      clearable
      class="statistics-search"
      size="small"
      @update:value="emit('update:searchKeyword', $event)"
    />
  </n-flex>
</template>

<style scoped>
.statistics-controls {
  gap: 10px;
  justify-content: flex-end;
}

.statistics-search {
  width: 220px;
}

@media (max-width: 768px) {
  .statistics-controls {
    width: 100%;
    gap: 8px;
    justify-content: flex-start;
  }
}
</style>
