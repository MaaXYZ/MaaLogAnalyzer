<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  NCard, useMessage,
} from 'naive-ui'
import type { TaskInfo } from '../types'
import { useIsMobile } from '../composables/useIsMobile'
import { useNodeStatisticsDataSource } from './nodeStatistics/composables/useNodeStatisticsDataSource'
import { useNodeStatisticsMetrics, type StatMode } from './nodeStatistics/composables/useNodeStatisticsMetrics'
import {
  useNodeStatisticsTableColumns,
} from './nodeStatistics/composables/useNodeStatisticsTableColumns'
import {
  useNodeStatisticsChartOptions,
  type NodeChartDimension,
  type RecognitionActionChartDimension,
  nodeChartDimensionOptions,
  recognitionActionChartDimensionOptions,
} from './nodeStatistics/composables/useNodeStatisticsChartOptions'
import NodeStatisticsHeaderControls from './nodeStatistics/components/NodeStatisticsHeaderControls.vue'
import NodeStatisticsSummarySection from './nodeStatistics/components/NodeStatisticsSummarySection.vue'
import NodeStatisticsDataPanel from './nodeStatistics/components/NodeStatisticsDataPanel.vue'
import NodeStatisticsLoadingModals from './nodeStatistics/components/NodeStatisticsLoadingModals.vue'
import NodeStatisticsChartCard from './nodeStatistics/components/NodeStatisticsChartCard.vue'


const { isMobile } = useIsMobile()

const props = defineProps<{
  tasks: TaskInfo[]
}>()

// 消息提示
const message = useMessage()

const {
  loading,
  parseProgress,
  showParsingModal,
  showFileLoadingModal,
  isInTauri,
  uploadKey,
  effectiveTasks,
  handleNaiveUpload,
  handleTauriFileSelect,
} = useNodeStatisticsDataSource({
  tasks: computed(() => props.tasks),
  message,
})

const statMode = ref<StatMode>('node')

// 饼图维度选择
const nodeChartDimension = ref<NodeChartDimension>('count')
const recognitionActionChartDimension = ref<RecognitionActionChartDimension>('avgActionDuration')

// 搜索关键词
const searchKeyword = ref('')
const {
  nodeStatistics,
  recognitionActionStatistics,
  statistics,
  nodeSummary,
  recognitionActionSummary,
} = useNodeStatisticsMetrics({
  effectiveTasks,
  searchKeyword,
  statMode,
})
const { columns } = useNodeStatisticsTableColumns({
  isMobile,
  statMode,
})
const {
  mobileNodeChartOption,
  mobileRecognitionActionChartOption,
} = useNodeStatisticsChartOptions({
  isMobile,
  nodeStatistics,
  recognitionActionStatistics,
  nodeChartDimension,
  recognitionActionChartDimension,
})
</script>

<template>
  <n-card
    size="small"
    data-tour="statistics-root"
    title="节点性能统计"
    style="height: 100%; display: flex; flex-direction: column"
    content-style="padding: 16px; flex: 1; min-height: 0; display: flex; flex-direction: column"
  >
    <template #header-extra>
      <node-statistics-header-controls
        :is-mobile="isMobile"
        :stat-mode="statMode"
        :node-chart-dimension="nodeChartDimension"
        :recognition-action-chart-dimension="recognitionActionChartDimension"
        :node-chart-dimension-options="nodeChartDimensionOptions"
        :recognition-action-chart-dimension-options="recognitionActionChartDimensionOptions"
        :search-keyword="searchKeyword"
        :is-in-tauri="isInTauri"
        :loading="loading"
        :upload-key="uploadKey"
        :handle-naive-upload="handleNaiveUpload"
        @update:stat-mode="statMode = $event"
        @update:node-chart-dimension="nodeChartDimension = $event"
        @update:recognition-action-chart-dimension="recognitionActionChartDimension = $event"
        @update:search-keyword="searchKeyword = $event"
        @tauri-upload-click="handleTauriFileSelect"
      />
    </template>

    <node-statistics-summary-section
      :stat-mode="statMode"
      :is-mobile="isMobile"
      :search-keyword="searchKeyword"
      :node-summary="nodeSummary"
      :recognition-action-summary="recognitionActionSummary"
      @update:search-keyword="searchKeyword = $event"
    />

    <node-statistics-chart-card
      :visible="statMode === 'node'"
      :option="mobileNodeChartOption"
      :is-mobile="isMobile"
    />
    <node-statistics-chart-card
      :visible="statMode === 'recognition-action'"
      :option="mobileRecognitionActionChartOption"
      :is-mobile="isMobile"
    />

    <node-statistics-data-panel
      :columns="columns"
      :statistics="statistics"
      :effective-tasks-length="effectiveTasks.length"
      :is-in-tauri="isInTauri"
      :loading="loading"
      :upload-key="uploadKey"
      :handle-naive-upload="handleNaiveUpload"
      @tauri-upload-click="handleTauriFileSelect"
    />

    <node-statistics-loading-modals
      :show-file-loading-modal="showFileLoadingModal"
      :show-parsing-modal="showParsingModal"
      :parse-progress="parseProgress"
      :is-mobile="isMobile"
    />
  </n-card>
</template>

