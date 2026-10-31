<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NCard, NTag } from 'naive-ui'
import type { TaskInfo } from '../types'
import { useIsMobile } from '../composables/useIsMobile'
import {
  useNodeStatisticsMetrics,
  type StatMode,
} from './nodeStatistics/composables/useNodeStatisticsMetrics'
import { useNodeStatisticsTableColumns } from './nodeStatistics/composables/useNodeStatisticsTableColumns'
import NodeStatisticsHeaderControls from './nodeStatistics/components/NodeStatisticsHeaderControls.vue'
import NodeStatisticsSummarySection from './nodeStatistics/components/NodeStatisticsSummarySection.vue'
import NodeStatisticsDataPanel from './nodeStatistics/components/NodeStatisticsDataPanel.vue'

const { isMobile } = useIsMobile()

const props = defineProps<{
  tasks: TaskInfo[]
}>()

// 运行统计固定复用当前已加载的日志（与 VS Code 内嵌时的行为一致），不再单独导入
const effectiveTasks = computed(() => props.tasks)

const statMode = ref<StatMode>('node')

// 搜索关键词与任务筛选
const searchKeyword = ref('')
const selectedTaskId = ref<string | number>('all')

const taskOptions = computed(() => [
  { label: '全部任务', value: 'all' },
  ...effectiveTasks.value.map((task) => ({
    label: `${task.task_id} · ${task.entry}`,
    value: task.task_id,
  })),
])

watch(effectiveTasks, (tasks) => {
  if (selectedTaskId.value === 'all') return
  const selected = Number(selectedTaskId.value)
  if (!tasks.some((task) => task.task_id === selected)) {
    selectedTaskId.value = 'all'
  }
})

const { statistics, nodeSummary, recognitionActionSummary, waitFreezeSummary } =
  useNodeStatisticsMetrics({
    effectiveTasks,
    selectedTaskId,
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

// 空表与列口径提示：Wait Freezes 为空很常见（只有 pipeline 里配了 wait_freezes 的节点才有记录），
// 不说清楚的话用户只会看到一张空表加一个图标，误以为是解析坏了。
const statisticsEmptyTitle = computed(() => {
  if (searchKeyword.value.trim()) return '当前搜索没有匹配项'
  if (selectedTaskId.value !== 'all') return '这个任务没有对应记录'
  if (statMode.value === 'wait-freezes') return '这份日志没有 Wait Freezes 记录'
  return '没有可统计的数据'
})

const statisticsEmptyHint = computed(() => {
  if (searchKeyword.value.trim()) return '清空右上角的「搜索节点名称」即可看全部数据。'
  if (selectedTaskId.value !== 'all') return '把右上角的筛选改回「全部任务」再试。'
  if (statMode.value === 'wait-freezes') {
    return 'Wait Freezes 只统计 pipeline 里配置了 wait_freezes 的节点；这个节点不产生记录时表是空的，属于正常情况。'
  }
  return '切换任务筛选或重新加载日志后重试。'
})

const statisticsPanelHint = computed(() =>
  statMode.value === 'wait-freezes'
    ? '「重复等待」只在 phase=repeat 时计数；「截图」依赖日志目录里的 debug 截图资源'
    : '',
)
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
            <n-tag
              size="small"
              round
              :type="
                statMode === 'node'
                  ? 'info'
                  : statMode === 'recognition-action'
                    ? 'warning'
                    : 'success'
              "
            >
              {{
                statMode === 'node'
                  ? '节点'
                  : statMode === 'recognition-action'
                    ? '识别 / 动作'
                    : 'Wait Freezes'
              }}
            </n-tag>
          </div>
          <div class="statistics-subtitle">
            {{
              statMode === 'node'
                ? '聚合查看频次、耗时和稳定性，适合先找最慢热点。'
                : statMode === 'recognition-action'
                  ? '拆分识别与动作阶段，适合判断瓶颈更偏向哪一段。'
                  : '统计等待画面静止的次数、重复等待和冻结耗时，定位反复等待热点。'
            }}
          </div>
        </div>

        <div class="statistics-controls-wrap">
          <node-statistics-header-controls
            :is-mobile="isMobile"
            :stat-mode="statMode"
            :task-filter="selectedTaskId"
            :task-options="taskOptions"
            :search-keyword="searchKeyword"
            @update:stat-mode="statMode = $event"
            @update:task-filter="selectedTaskId = $event"
            @update:search-keyword="searchKeyword = $event"
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
            :node-summary="statMode === 'node' ? nodeSummary : null"
            :recognition-action-summary="
              statMode === 'recognition-action' ? recognitionActionSummary : null
            "
            :wait-freeze-summary="statMode === 'wait-freezes' ? waitFreezeSummary : null"
            @update:search-keyword="searchKeyword = $event"
          />

          <div class="statistics-table-panel">
            <node-statistics-data-panel
              :columns="columns"
              :statistics="statistics"
              :panel-title="statisticsPanelTitle"
              :panel-hint="statisticsPanelHint"
              :empty-title="statisticsEmptyTitle"
              :empty-hint="statisticsEmptyHint"
              :effective-tasks-length="effectiveTasks.length"
            />
          </div>
        </div>
      </div>
    </div>
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
