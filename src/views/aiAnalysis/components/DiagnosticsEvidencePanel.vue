<script setup lang="ts">
import { NButton, NCard, NFlex, NTag, NText } from 'naive-ui'
import {
  anchorClassLabel,
  anchorClassTagType,
  jumpBackClassLabel,
  jumpBackClassTagType,
  onErrorRiskTagType,
  onErrorTriggerTypeLabel,
} from '../utils/diagnosticLabels'

interface OnErrorPreviewItem {
  triggerType: string
  riskLevel: string
  triggerLine: number | null
  triggerNode: string
  summary: string
  outcomeEvent: string
}

interface AnchorPreviewItem {
  classification: string
  startNode: string
  summary: string
  startLine: number | null
  outcomeEvent: string
}

interface JumpBackPreviewItem {
  classification: string
  startNode: string
  summary: string
  startLine: number | null
  hitCandidate: string
  returnObserved: boolean
}

interface Props {
  onErrorPreview: {
    total: number
    chains: OnErrorPreviewItem[]
  }
  anchorPreview: {
    windowCount: number
    unresolvedAnchorLikelyCount: number
    failedAfterAnchorResolvedCount: number
    summary: string
    cases: AnchorPreviewItem[]
  }
  jumpBackPreview: {
    caseCount: number
    hitThenReturnedCount: number
    hitThenFailedNoReturnCount: number
    terminalBounceCount: number
    summary: string
    cases: JumpBackPreviewItem[]
  }
  collapsed: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
}>()
</script>

<template>
  <n-card
    v-if="props.onErrorPreview.chains.length || props.anchorPreview.windowCount || props.jumpBackPreview.caseCount"
    size="small"
    class="evidence-panel-card"
  >
    <n-flex vertical style="gap: 8px">
      <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
        <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
          <n-text depth="3" style="font-size: 12px">证据链诊断（当前任务）</n-text>
          <n-tag size="small" type="info">on_error {{ props.onErrorPreview.total }}</n-tag>
          <n-tag size="small" type="info">anchor {{ props.anchorPreview.windowCount }}</n-tag>
          <n-tag size="small" type="info">jump_back {{ props.jumpBackPreview.caseCount }}</n-tag>
        </n-flex>
        <n-button size="tiny" quaternary @click="emit('toggle-collapse')">
          {{ props.collapsed ? '展开证据链' : '收起证据链' }}
        </n-button>
      </n-flex>

      <n-text v-if="props.collapsed" depth="3" style="font-size: 12px">
        证据链已折叠，当前可集中查看对话与结论。
      </n-text>

      <template v-else>
        <n-card v-if="props.onErrorPreview.chains.length" size="small" class="on-error-preview-card">
          <n-flex vertical style="gap: 6px">
            <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
              <n-text depth="3" style="font-size: 12px">on_error 证据链预览</n-text>
              <n-tag size="small" type="info">共 {{ props.onErrorPreview.total }} 条</n-tag>
            </n-flex>
            <div class="on-error-preview-list">
              <div
                v-for="(chain, index) in props.onErrorPreview.chains"
                :key="`${chain.triggerType}-${chain.triggerLine ?? 'na'}-${index}`"
                class="on-error-preview-item"
              >
                <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
                  <n-tag size="small" :type="onErrorRiskTagType(chain.riskLevel)">
                    {{ chain.riskLevel.toUpperCase() }}
                  </n-tag>
                  <n-tag size="small" type="default">
                    {{ onErrorTriggerTypeLabel(chain.triggerType) }}
                  </n-tag>
                  <n-text depth="3" style="font-size: 12px">
                    节点: {{ chain.triggerNode || 'unknown' }}
                  </n-text>
                </n-flex>
                <n-text depth="3" style="font-size: 12px; line-height: 1.45">
                  {{ chain.summary }}
                </n-text>
                <n-text depth="3" style="font-size: 11px">
                  触发行: {{ chain.triggerLine ?? '-' }} · 结果: {{ chain.outcomeEvent }}
                </n-text>
              </div>
            </div>
          </n-flex>
        </n-card>

        <n-card v-if="props.anchorPreview.windowCount" size="small" class="diagnostic-preview-card">
          <n-flex vertical style="gap: 6px">
            <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
              <n-text depth="3" style="font-size: 12px">anchor 解析诊断</n-text>
              <n-tag size="small" type="info">窗口 {{ props.anchorPreview.windowCount }}</n-tag>
            </n-flex>
            <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
              <n-tag size="small" :type="props.anchorPreview.unresolvedAnchorLikelyCount > 0 ? 'error' : 'success'">
                未解析疑似 {{ props.anchorPreview.unresolvedAnchorLikelyCount }}
              </n-tag>
              <n-tag size="small" :type="props.anchorPreview.failedAfterAnchorResolvedCount > 0 ? 'warning' : 'default'">
                已解析后失败 {{ props.anchorPreview.failedAfterAnchorResolvedCount }}
              </n-tag>
            </n-flex>
            <n-text depth="3" style="font-size: 12px; line-height: 1.45">
              {{ props.anchorPreview.summary }}
            </n-text>
            <div v-if="props.anchorPreview.cases.length" class="diagnostic-preview-list">
              <div
                v-for="(item, index) in props.anchorPreview.cases"
                :key="`anchor-${item.startLine ?? 'na'}-${index}`"
                class="diagnostic-preview-item"
              >
                <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
                  <n-tag size="small" :type="anchorClassTagType(item.classification)">
                    {{ anchorClassLabel(item.classification) }}
                  </n-tag>
                  <n-text depth="3" style="font-size: 12px">
                    节点: {{ item.startNode || 'unknown' }}
                  </n-text>
                </n-flex>
                <n-text depth="3" style="font-size: 12px; line-height: 1.45">
                  {{ item.summary }}
                </n-text>
                <n-text depth="3" style="font-size: 11px">
                  起始行: {{ item.startLine ?? '-' }} · 结果: {{ item.outcomeEvent }}
                </n-text>
              </div>
            </div>
          </n-flex>
        </n-card>

        <n-card v-if="props.jumpBackPreview.caseCount" size="small" class="diagnostic-preview-card">
          <n-flex vertical style="gap: 6px">
            <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
              <n-text depth="3" style="font-size: 12px">jump_back 回跳诊断</n-text>
              <n-tag size="small" type="info">窗口 {{ props.jumpBackPreview.caseCount }}</n-tag>
            </n-flex>
            <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
              <n-tag size="small" :type="props.jumpBackPreview.hitThenFailedNoReturnCount > 0 ? 'error' : 'success'">
                命中后失败未回跳 {{ props.jumpBackPreview.hitThenFailedNoReturnCount }}
              </n-tag>
              <n-tag size="small" :type="props.jumpBackPreview.hitThenReturnedCount > 0 ? 'success' : 'default'">
                命中并回跳 {{ props.jumpBackPreview.hitThenReturnedCount }}
              </n-tag>
              <n-tag size="small" :type="props.jumpBackPreview.terminalBounceCount > 0 ? 'warning' : 'default'">
                回跳但命中节点疑似无后继 {{ props.jumpBackPreview.terminalBounceCount }}
              </n-tag>
            </n-flex>
            <n-text depth="3" style="font-size: 12px; line-height: 1.45">
              {{ props.jumpBackPreview.summary }}
            </n-text>
            <div v-if="props.jumpBackPreview.cases.length" class="diagnostic-preview-list">
              <div
                v-for="(item, index) in props.jumpBackPreview.cases"
                :key="`jumpback-${item.startLine ?? 'na'}-${index}`"
                class="diagnostic-preview-item"
              >
                <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
                  <n-tag size="small" :type="jumpBackClassTagType(item.classification)">
                    {{ jumpBackClassLabel(item.classification) }}
                  </n-tag>
                  <n-text depth="3" style="font-size: 12px">
                    节点: {{ item.startNode || 'unknown' }}
                  </n-text>
                </n-flex>
                <n-text depth="3" style="font-size: 12px; line-height: 1.45">
                  {{ item.summary }}
                </n-text>
                <n-text depth="3" style="font-size: 11px">
                  命中候选: {{ item.hitCandidate || '-' }} · 回跳: {{ item.returnObserved ? '是' : '否' }}
                </n-text>
              </div>
            </div>
          </n-flex>
        </n-card>
      </template>
    </n-flex>
  </n-card>
</template>

<style scoped>
.evidence-panel-card {
  margin-bottom: 8px;
}

.on-error-preview-card {
  margin-bottom: 8px;
}

.on-error-preview-list {
  max-height: 180px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}

.on-error-preview-item {
  border: 1px solid rgba(127, 231, 196, 0.4);
  border-left: 3px solid rgba(127, 231, 196, 0.75);
  border-radius: 8px;
  background: rgba(127, 231, 196, 0.08);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diagnostic-preview-card {
  margin-bottom: 8px;
}

.diagnostic-preview-list {
  max-height: 200px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}

.diagnostic-preview-item {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-left: 3px solid rgba(127, 231, 196, 0.75);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (max-width: 900px) {
  .on-error-preview-list,
  .diagnostic-preview-list {
    max-height: 140px;
  }
}
</style>
