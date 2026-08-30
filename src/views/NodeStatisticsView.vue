<script setup lang="ts">
import {
  ref,
  computed,
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
import NodeStatisticsHeaderControls from './nodeStatistics/components/NodeStatisticsHeaderControls.vue'
import NodeStatisticsSummarySection from './nodeStatistics/components/NodeStatisticsSummarySection.vue'
import NodeStatisticsDataPanel from './nodeStatistics/components/NodeStatisticsDataPanel.vue'
import NodeStatisticsLoadingModals from './nodeStatistics/components/NodeStatisticsLoadingModals.vue'


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

// 搜索关键词
const searchKeyword = ref('')
const {
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

const statisticsPanelTitle = computed(() => {
  if (statMode.value === 'node') return '节点明细'
  if (statMode.value === 'recognition-action') return '识别 / 动作明细'
  return 'Wait Freezes 明细'
})

const hasSummaryContent = computed(() => {
  if (statMode.value === 'node') return nodeSummary.value !== null
  if (statMode.value === 'recognition-action') return recognitionActionSummary.value !== null
  return waitFreezeSummary.value !== null
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
            <div class="statistics-title">运行性能统计</div>
            <n-tag size="small" round :type="statMode === 'node' ? 'info' : statMode === 'recognition-action' ? 'warning' : 'success'">
              {{ statMode === 'node' ? '节点' : statMode === 'recognition-action' ? '识别 / 动作' : 'Wait Freezes' }}
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
            :search-keyword="searchKeyword"
            :is-in-tauri="isInTauri"
            :is-vscode-launch-embed="props.isVscodeLaunchEmbed === true"
            :loading="loading"
            :upload-key="uploadKey"
            :handle-naive-upload="handleNaiveUpload"
            @update:stat-mode="statMode = $event"
            @update:search-keyword="searchKeyword = $event"
            @tauri-upload-click="handleTauriFileSelect"
          />
        </div>
      </div>
    </template>

    <div class="statistics-layout-host">
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

.statistics-table-panel {
  display: flex;
  width: 100%;
  min-width: 0;
}

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
}
</style>

