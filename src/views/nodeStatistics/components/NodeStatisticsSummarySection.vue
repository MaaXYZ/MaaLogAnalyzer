<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NInput, NTag } from 'naive-ui'
import { formatDuration } from '../../../utils/formatDuration'
import type {
  NodeStatisticsSummary,
  RecognitionActionStatisticsSummary,
  WaitFreezeStatisticsSummary,
  StatMode,
} from '../composables/useNodeStatisticsMetrics'

const props = defineProps<{
  statMode: StatMode
  isMobile: boolean
  searchKeyword: string
  nodeSummary: NodeStatisticsSummary | null
  recognitionActionSummary: RecognitionActionStatisticsSummary | null
  waitFreezeSummary: WaitFreezeStatisticsSummary | null
}>()

const emit = defineEmits<{
  (e: 'update:searchKeyword', value: string): void
}>()

const updateSearchKeyword = (value: string) => {
  emit('update:searchKeyword', value)
}

const hasSummaryCard = computed(() => (
  (props.statMode === 'node' && props.nodeSummary !== null)
  || (props.statMode === 'recognition-action' && props.recognitionActionSummary !== null)
  || (props.statMode === 'wait-freezes' && props.waitFreezeSummary !== null)
))
</script>

<template>
  <div v-if="hasSummaryCard" class="summary-section">
    <n-card
      v-if="props.statMode === 'node' && props.nodeSummary"
      class="summary-section-card"
      size="small"
      :bordered="false"
    >
      <div class="summary-layout" :class="{ mobile: props.isMobile }">
        <div class="summary-left-combo">
          <div class="summary-panel summary-lead-card">
            <div class="summary-lead-top">
              <div class="summary-title-group">
                <div class="summary-title">节点总览</div>
                <div class="summary-caption">4 个核心指标 + 1 个焦点节点</div>
              </div>
              <n-tag
                v-if="props.searchKeyword.trim()"
                size="small"
                type="primary"
                round
              >
                筛选中
              </n-tag>
            </div>

            <div class="summary-description">
              先看节点规模、频次和平均耗时，再从右侧焦点卡判断最该继续下钻的热点节点。
            </div>

            <div v-if="props.isMobile" class="summary-mobile-search">
              <n-input
                :value="props.searchKeyword"
                placeholder="筛选节点名称"
                clearable
                size="small"
                @update:value="updateSearchKeyword"
              />
            </div>
          </div>

          <div class="summary-metrics-row">
            <div class="summary-panel metric-tile tone-cyan">
              <div class="metric-label">节点类型</div>
              <div class="metric-value">{{ props.nodeSummary.uniqueNodes }}</div>
              <div class="metric-note">参与统计的唯一节点数</div>
            </div>

            <div class="summary-panel metric-tile tone-emerald">
              <div class="metric-label">总执行次数</div>
              <div class="metric-value">{{ props.nodeSummary.totalNodes }}</div>
              <div class="metric-note">全部任务里的节点触发次数</div>
            </div>

            <div class="summary-panel metric-tile tone-amber">
              <div class="metric-label">平均耗时</div>
              <div class="metric-value">{{ formatDuration(props.nodeSummary.avgDuration) }}</div>
              <div class="metric-note">按节点实例平均计算</div>
            </div>
          </div>
        </div>

        <div class="summary-panel summary-focus-card">
          <div class="hero-metric">
            <div class="metric-label">总耗时</div>
            <div class="hero-value">{{ formatDuration(props.nodeSummary.totalDuration) }}</div>
            <div class="metric-note">全部节点累计耗时</div>
          </div>

          <div class="focus-divider" />

          <div class="focus-badge">焦点节点</div>
          <div class="focus-title">最慢热点</div>
          <div class="focus-name">
            {{ props.nodeSummary.slowestNode.name }}
          </div>

          <div class="focus-metrics">
            <div class="focus-metric">
              <div class="focus-metric-label">平均耗时</div>
              <div class="focus-metric-value">
                {{ formatDuration(props.nodeSummary.slowestNode.avgDuration) }}
              </div>
            </div>
            <div class="focus-metric">
              <div class="focus-metric-label">执行次数</div>
              <div class="focus-metric-value">{{ props.nodeSummary.slowestNode.count }}</div>
            </div>
            <div class="focus-metric">
              <div class="focus-metric-label">成功率</div>
              <div class="focus-metric-value">
                {{ props.nodeSummary.slowestNode.successRate.toFixed(1) }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </n-card>

    <n-card
      v-else-if="props.statMode === 'recognition-action' && props.recognitionActionSummary"
      class="summary-section-card"
      size="small"
      :bordered="false"
    >
      <div class="summary-layout" :class="{ mobile: props.isMobile }">
        <div class="summary-left-combo">
          <div class="summary-panel summary-lead-card">
            <div class="summary-lead-top">
              <div class="summary-title-group">
                <div class="summary-title">识别 / 动作总览</div>
                <div class="summary-caption">4 个核心指标 + 1 个焦点节点</div>
              </div>
              <n-tag
                v-if="props.searchKeyword.trim()"
                size="small"
                type="warning"
                round
              >
                筛选中
              </n-tag>
            </div>

            <div class="summary-description">
              先看节点覆盖、频次和识别尝试密度，再看右侧动作热点，判断瓶颈更偏识别还是动作。
            </div>

            <div v-if="props.isMobile" class="summary-mobile-search">
              <n-input
                :value="props.searchKeyword"
                placeholder="筛选节点名称"
                clearable
                size="small"
                @update:value="updateSearchKeyword"
              />
            </div>
          </div>

          <div class="summary-metrics-row">
            <div class="summary-panel metric-tile tone-cyan">
              <div class="metric-label">节点类型</div>
              <div class="metric-value">{{ props.recognitionActionSummary.uniqueNodes }}</div>
              <div class="metric-note">参与识别 / 动作统计的节点数</div>
            </div>

            <div class="summary-panel metric-tile tone-emerald">
              <div class="metric-label">总执行次数</div>
              <div class="metric-value">{{ props.recognitionActionSummary.totalNodes }}</div>
              <div class="metric-note">全部识别 / 动作记录总量</div>
            </div>

            <div class="summary-panel metric-tile tone-amber">
              <div class="metric-label">平均识别尝试</div>
              <div class="metric-value">
                {{ props.recognitionActionSummary.avgRecognitionAttempts.toFixed(1) }}
              </div>
              <div class="metric-note">单次节点平均重试轮数</div>
            </div>
          </div>
        </div>

        <div class="summary-panel summary-focus-card">
          <div class="hero-metric">
            <div class="metric-label">平均动作耗时</div>
            <div class="hero-value">
              {{ formatDuration(props.recognitionActionSummary.avgActionDuration) }}
            </div>
            <div class="metric-note">动作阶段整体平均耗时</div>
          </div>

          <div class="focus-divider" />

          <div class="focus-badge">焦点节点</div>
          <div class="focus-title">动作热点</div>
          <div class="focus-name">
            {{ props.recognitionActionSummary.slowestActionNode.name }}
          </div>

          <div class="focus-metrics">
            <div class="focus-metric">
              <div class="focus-metric-label">平均识别耗时</div>
              <div class="focus-metric-value">
                {{ formatDuration(props.recognitionActionSummary.slowestActionNode.avgRecognitionDuration) }}
              </div>
            </div>
            <div class="focus-metric">
              <div class="focus-metric-label">平均动作耗时</div>
              <div class="focus-metric-value">
                {{ formatDuration(props.recognitionActionSummary.slowestActionNode.avgActionDuration) }}
              </div>
            </div>
            <div class="focus-metric">
              <div class="focus-metric-label">成功率</div>
              <div class="focus-metric-value">
                {{ props.recognitionActionSummary.slowestActionNode.successRate.toFixed(1) }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </n-card>

    <n-card
      v-else-if="props.statMode === 'wait-freezes' && props.waitFreezeSummary"
      class="summary-section-card"
      size="small"
      :bordered="false"
    >
      <div class="summary-layout" :class="{ mobile: props.isMobile }">
        <div class="summary-left-combo">
          <div class="summary-panel summary-lead-card">
            <div class="summary-lead-top">
              <div class="summary-title-group">
                <div class="summary-title">Wait Freezes 总览</div>
                <div class="summary-caption">重复等待 + 冻结耗时</div>
              </div>
              <n-tag
                v-if="props.searchKeyword.trim()"
                size="small"
                type="primary"
                round
              >
                筛选中
              </n-tag>
            </div>

            <div class="summary-description">
              查看等待画面静止的发生频率、重复等待次数和冻结耗时，定位最常反复等待的节点。
            </div>

            <div v-if="props.isMobile" class="summary-mobile-search">
              <n-input
                :value="props.searchKeyword"
                placeholder="筛选节点名称"
                clearable
                size="small"
                @update:value="updateSearchKeyword"
              />
            </div>
          </div>

          <div class="summary-metrics-row">
            <div class="summary-panel metric-tile tone-cyan">
              <div class="metric-label">节点类型</div>
              <div class="metric-value">{{ props.waitFreezeSummary.uniqueNodes }}</div>
              <div class="metric-note">出现 Wait Freezes 的唯一节点数</div>
            </div>

            <div class="summary-panel metric-tile tone-emerald">
              <div class="metric-label">总等待次数</div>
              <div class="metric-value">{{ props.waitFreezeSummary.totalCount }}</div>
              <div class="metric-note">全部 Wait Freezes 记录</div>
            </div>

            <div class="summary-panel metric-tile tone-amber">
              <div class="metric-label">平均冻结耗时</div>
              <div class="metric-value">{{ formatDuration(props.waitFreezeSummary.avgElapsed) }}</div>
              <div class="metric-note">单次等待画面静止平均耗时</div>
            </div>
          </div>
        </div>

        <div class="summary-panel summary-focus-card">
          <div class="hero-metric">
            <div class="metric-label">总重复等待</div>
            <div class="hero-value">{{ props.waitFreezeSummary.totalRepeatCount }}</div>
            <div class="metric-note">repeat 阶段累计次数</div>
          </div>

          <div class="focus-divider" />

          <div class="focus-badge">焦点节点</div>
          <div class="focus-title">重复等待热点</div>
          <div class="focus-name">
            {{ props.waitFreezeSummary.focusNode.name }}
          </div>

          <div class="focus-metrics">
            <div class="focus-metric">
              <div class="focus-metric-label">重复等待</div>
              <div class="focus-metric-value">{{ props.waitFreezeSummary.focusNode.repeatCount }}</div>
            </div>
            <div class="focus-metric">
              <div class="focus-metric-label">平均冻结耗时</div>
              <div class="focus-metric-value">
                {{ formatDuration(props.waitFreezeSummary.focusNode.avgElapsed) }}
              </div>
            </div>
            <div class="focus-metric">
              <div class="focus-metric-label">成功率</div>
              <div class="focus-metric-value">
                {{ props.waitFreezeSummary.focusNode.successRate.toFixed(1) }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </n-card>
  </div>
</template>

<style scoped>
.summary-section {
  margin-bottom: 16px;
}

.summary-section-card {
  --summary-surface: var(--vscode-editorWidget-background, var(--n-color));
  --summary-surface-muted: var(--vscode-sideBarSectionHeader-background, var(--n-color-embedded));
  --summary-border: var(--vscode-panel-border, var(--n-border-color));
  --summary-accent: var(--vscode-button-background, var(--n-color-target));
  --summary-info-accent: var(--vscode-textLink-foreground, #5aa9e6);
  --summary-success-accent: var(--vscode-testing-iconPassed, #18a058);
  --summary-warning-accent: var(--vscode-editorWarning-foreground, #f0a020);
  background: var(--summary-surface);
  border: 1px solid var(--summary-border);
  box-shadow: none;
}

.summary-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(280px, 1fr);
  gap: 14px;
  align-items: stretch;
}

.summary-layout.mobile {
  grid-template-columns: 1fr;
}

.summary-left-combo {
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto;
  gap: 12px;
}

.summary-panel {
  border-radius: 16px;
  border: 1px solid var(--summary-border);
  background: var(--summary-surface-muted);
  padding: 16px;
  min-width: 0;
}

.summary-lead-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-lead-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.summary-title-group {
  min-width: 0;
}

.summary-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--n-text-color-1);
}

.summary-caption {
  margin-top: 4px;
  font-size: 12px;
  color: var(--n-text-color-3);
}

.summary-description {
  font-size: 13px;
  line-height: 1.6;
  color: var(--n-text-color-2);
}

.summary-mobile-search {
  padding-top: 2px;
}

.summary-metrics-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.metric-tile {
  position: relative;
  min-height: 108px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.metric-tile::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: var(--tile-accent);
}

.metric-label,
.focus-metric-label {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.metric-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--n-text-color-1);
}

.metric-note {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--n-text-color-3);
}

.tone-cyan {
  --tile-accent: var(--summary-info-accent);
}

.tone-emerald {
  --tile-accent: var(--summary-success-accent);
}

.tone-amber {
  --tile-accent: var(--summary-warning-accent);
}

.summary-focus-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 100%;
}

.hero-metric {
  padding-bottom: 2px;
}

.hero-value {
  margin-top: 10px;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--n-text-color-1);
}

.focus-divider {
  height: 1px;
  margin: 14px 0;
  background: var(--summary-border);
}

.focus-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--summary-accent);
  background: transparent;
  color: var(--summary-accent);
  font-size: 12px;
  font-weight: 600;
}

.focus-title {
  margin-top: 12px;
  font-size: 17px;
  font-weight: 700;
  color: var(--n-text-color-1);
}

.focus-name {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--n-text-color-1);
  word-break: break-word;
}

.focus-metrics {
  margin-top: auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding-top: 16px;
}

.focus-metric {
  padding: 12px;
  border-radius: 12px;
  background: var(--summary-surface);
  border: 1px solid var(--summary-border);
}

.focus-metric-value {
  margin-top: 6px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--n-text-color-1);
}

@media (max-width: 900px) {
  .summary-layout {
    grid-template-columns: 1fr;
  }

  .summary-focus-card {
    min-height: 0;
  }
}

@media (max-width: 720px) {
  .summary-metrics-row,
  .focus-metrics {
    grid-template-columns: 1fr;
  }

  .metric-tile {
    min-height: 0;
  }

  .summary-panel {
    padding: 14px;
  }

  .hero-value {
    font-size: 28px;
  }
}

@supports (background: color-mix(in srgb, white 50%, black)) {
  .summary-section-card {
    background:
      radial-gradient(circle at top left, color-mix(in srgb, var(--summary-accent) 10%, transparent), transparent 36%),
      var(--summary-surface);
  }

  .tone-cyan {
    background: linear-gradient(180deg, color-mix(in srgb, var(--summary-info-accent) 10%, var(--summary-surface-muted)), var(--summary-surface-muted));
  }

  .tone-emerald {
    background: linear-gradient(180deg, color-mix(in srgb, var(--summary-success-accent) 10%, var(--summary-surface-muted)), var(--summary-surface-muted));
  }

  .tone-amber {
    background: linear-gradient(180deg, color-mix(in srgb, var(--summary-warning-accent) 10%, var(--summary-surface-muted)), var(--summary-surface-muted));
  }

  .focus-badge {
    border-color: color-mix(in srgb, var(--summary-accent) 35%, var(--summary-border));
    background: color-mix(in srgb, var(--summary-accent) 12%, transparent);
  }
}
</style>
