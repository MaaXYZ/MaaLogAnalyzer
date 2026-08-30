<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
} from 'vue'
import {
  NCard, NTag, useMessage,
} from 'naive-ui'
import type { TaskInfo } from '../types'
import { useIsMobile } from '../composables/useIsMobile'
import { useNodeStatisticsDataSource } from './nodeStatistics/composables/useNodeStatisticsDataSource'
import {
  useNodeStatisticsMetrics,
  type StatMode,
} from './nodeStatistics/composables/useNodeStatisticsMetrics'
import {
  useNodeStatisticsTableColumns,
} from './nodeStatistics/composables/useNodeStatisticsTableColumns'
import {
  useNodeStatisticsChartOptions,
  type NodeChartDimension,
  type RecognitionActionChartDimension,
  type WaitFreezeChartDimension,
  nodeChartDimensionOptions,
  recognitionActionChartDimensionOptions,
  waitFreezeChartDimensionOptions,
} from './nodeStatistics/composables/useNodeStatisticsChartOptions'
import NodeStatisticsHeaderControls from './nodeStatistics/components/NodeStatisticsHeaderControls.vue'
import NodeStatisticsSummarySection from './nodeStatistics/components/NodeStatisticsSummarySection.vue'
import NodeStatisticsDataPanel from './nodeStatistics/components/NodeStatisticsDataPanel.vue'
import NodeStatisticsLoadingModals from './nodeStatistics/components/NodeStatisticsLoadingModals.vue'
import NodeStatisticsChartCard from './nodeStatistics/components/NodeStatisticsChartCard.vue'


const { isMobile } = useIsMobile()

const props = defineProps<{
  tasks: TaskInfo[]
  isVscodeLaunchEmbed?: boolean
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
const waitFreezeChartDimension = ref<WaitFreezeChartDimension>('repeatCount')

// 搜索关键词
const searchKeyword = ref('')
const {
  nodeStatistics,
  recognitionActionStatistics,
  waitFreezeStatistics,
  statistics,
  nodeSummary,
  recognitionActionSummary,
  waitFreezeSummary,
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
  mobileWaitFreezeChartOption,
} = useNodeStatisticsChartOptions({
  isMobile,
  nodeStatistics,
  recognitionActionStatistics,
  waitFreezeStatistics,
  nodeChartDimension,
  recognitionActionChartDimension,
  waitFreezeChartDimension,
})

const statisticsPanelTitle = computed(() => {
  if (statMode.value === 'node') return '节点明细'
  if (statMode.value === 'recognition-action') return '识别 / 动作明细'
  return 'Wait Freezes 明细'
})

const activeChartOption = computed(() => {
  if (statMode.value === 'node') return mobileNodeChartOption.value
  if (statMode.value === 'recognition-action') return mobileRecognitionActionChartOption.value
  return mobileWaitFreezeChartOption.value
})

const hasSummaryContent = computed(() => {
  if (statMode.value === 'node') return nodeSummary.value !== null
  if (statMode.value === 'recognition-action') return recognitionActionSummary.value !== null
  return waitFreezeSummary.value !== null
})

const hasChartContent = computed(() => activeChartOption.value !== null)

const layoutHostRef = ref<HTMLElement | null>(null)
const layoutHostWidth = ref(0)
let layoutResizeObserver: ResizeObserver | null = null

const useSingleColumnLayout = computed(() => (
  props.isVscodeLaunchEmbed === true
  || isMobile.value
  || !hasChartContent.value
  || layoutHostWidth.value < 980
))

const updateLayoutHostWidth = () => {
  const host = layoutHostRef.value
  if (!host) {
    layoutHostWidth.value = 0
    return
  }
  layoutHostWidth.value = host.getBoundingClientRect().width
}

onMounted(() => {
  const host = layoutHostRef.value
  if (!host) {
    return
  }
  updateLayoutHostWidth()
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', updateLayoutHostWidth)
    return
  }
  layoutResizeObserver = new ResizeObserver(() => {
    updateLayoutHostWidth()
  })
  layoutResizeObserver.observe(host)
})

onBeforeUnmount(() => {
  if (layoutResizeObserver) {
    layoutResizeObserver.disconnect()
    layoutResizeObserver = null
  }
  window.removeEventListener('resize', updateLayoutHostWidth)
})
</script>

<template>
  <n-card
    class="statistics-root-card"
    size="small"
    data-tour="statistics-root"
    :bordered="false"
    style="height: 100%; display: flex; flex-direction: column"
    content-style="padding: 16px; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden"
  >
    <template #header>
      <div class="statistics-header">
        <div class="statistics-title-block">
          <div class="statistics-title-row">
            <div class="statistics-title">节点性能统计</div>
            <n-tag size="small" round :type="statMode === 'node' ? 'info' : statMode === 'recognition-action' ? 'warning' : 'success'">
              {{ statMode === 'node' ? '节点统计' : statMode === 'recognition-action' ? '识别 / 动作' : 'Wait Freezes' }}
            </n-tag>
          </div>
          <div class="statistics-subtitle">
            {{ statMode === 'node'
              ? '聚合查看频次、耗时和稳定性，适合先找最慢热点。'
              : statMode === 'recognition-action'
                ? '拆分识别与动作阶段，适合判断瓶颈更偏向哪一段。'
                : '统计等待画面静止的次数、重复等待和冻结耗时，定位反复等待热点。' }}
          </div>
        </div>

        <div class="statistics-controls-wrap">
          <node-statistics-header-controls
            :is-mobile="isMobile"
            :stat-mode="statMode"
            :node-chart-dimension="nodeChartDimension"
            :recognition-action-chart-dimension="recognitionActionChartDimension"
            :wait-freeze-chart-dimension="waitFreezeChartDimension"
            :node-chart-dimension-options="nodeChartDimensionOptions"
            :recognition-action-chart-dimension-options="recognitionActionChartDimensionOptions"
            :wait-freeze-chart-dimension-options="waitFreezeChartDimensionOptions"
            :search-keyword="searchKeyword"
            :is-in-tauri="isInTauri"
            :is-vscode-launch-embed="props.isVscodeLaunchEmbed === true"
            :loading="loading"
            :upload-key="uploadKey"
            :handle-naive-upload="handleNaiveUpload"
            @update:stat-mode="statMode = $event"
            @update:node-chart-dimension="nodeChartDimension = $event"
            @update:recognition-action-chart-dimension="recognitionActionChartDimension = $event"
            @update:wait-freeze-chart-dimension="waitFreezeChartDimension = $event"
            @update:search-keyword="searchKeyword = $event"
            @tauri-upload-click="handleTauriFileSelect"
          />
        </div>
      </div>
    </template>

    <div ref="layoutHostRef" class="statistics-layout-host">
      <div class="statistics-body-scroll">
      <div class="statistics-body-content">
        <node-statistics-summary-section
          v-if="hasSummaryContent"
          :stat-mode="statMode"
          :is-mobile="isMobile"
          :search-keyword="searchKeyword"
          :node-summary="nodeSummary"
          :recognition-action-summary="recognitionActionSummary"
          :wait-freeze-summary="waitFreezeSummary"
          @update:search-keyword="searchKeyword = $event"
        />

        <div
          class="statistics-main-layout"
          :class="{
            mobile: isMobile,
            'statistics-main-layout--single': useSingleColumnLayout,
          }"
        >
          <div v-if="hasChartContent" class="statistics-chart-panel">
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
            <node-statistics-chart-card
              :visible="statMode === 'wait-freezes'"
              :option="mobileWaitFreezeChartOption"
              :is-mobile="isMobile"
            />
          </div>

          <div class="statistics-table-panel">
            <node-statistics-data-panel
              :columns="columns"
              :statistics="statistics"
              :panel-title="statisticsPanelTitle"
              :effective-tasks-length="effectiveTasks.length"
              :is-in-tauri="isInTauri"
              :is-vscode-launch-embed="props.isVscodeLaunchEmbed === true"
              :loading="loading"
              :upload-key="uploadKey"
              :handle-naive-upload="handleNaiveUpload"
              @tauri-upload-click="handleTauriFileSelect"
            />
          </div>
        </div>
      </div>
      </div>
    </div>

    <node-statistics-loading-modals
      :show-file-loading-modal="showFileLoadingModal"
      :show-parsing-modal="showParsingModal"
      :parse-progress="parseProgress"
      :is-mobile="isMobile"
    />
  </n-card>
</template>

<style scoped>
:deep(.statistics-root-card.n-card) {
  background-color: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.statistics-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
}

.statistics-title-block {
  min-width: 0;
}

.statistics-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.statistics-title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.statistics-subtitle {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--n-text-color-3);
  max-width: 640px;
}

.statistics-controls-wrap {
  flex-shrink: 0;
}

.statistics-layout-host {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 0;
  min-height: 0;
  min-width: 0;
}

.statistics-body-scroll {
  flex: 1 1 auto;
  max-height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.statistics-body-content {
  min-height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 2px;
}

.statistics-main-layout {
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  width: 100%;
  gap: 16px;
  align-items: start;
  padding-bottom: 2px;
}

.statistics-main-layout.mobile {
  grid-template-columns: 1fr;
}

.statistics-main-layout--single {
  grid-template-columns: minmax(0, 1fr);
}

.statistics-chart-panel,
.statistics-table-panel {
  display: flex;
  min-width: 0;
}

.statistics-chart-panel > *,
.statistics-table-panel > * {
  width: 100%;
  min-width: 0;
}

@media (max-width: 960px) {
  .statistics-header {
    flex-direction: column;
    align-items: stretch;
  }

  .statistics-controls-wrap {
    width: 100%;
  }

  .statistics-main-layout {
    grid-template-columns: 1fr;
  }
}
</style>

