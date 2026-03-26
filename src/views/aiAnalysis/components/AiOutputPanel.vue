<script setup lang="ts">
import { computed, type VNodeRef } from 'vue'
import { NButton, NCard, NCheckbox, NEmpty, NFlex, NScrollbar, NTag, NText } from 'naive-ui'
import ConversationTurnBubble from './ConversationTurnBubble.vue'
import DiagnosticsEvidencePanel from './DiagnosticsEvidencePanel.vue'

interface ConversationTurnView {
  id: string
  turn: number
  usedMemory: boolean
  question: string
  answerHtml: string
}

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
  usageText: string
  onErrorPreview: { total: number; chains: OnErrorPreviewItem[] }
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
  evidencePanelCollapsed: boolean
  conversationTurnViews: ConversationTurnView[]
  showStreamingTurn: boolean
  conversationFollowMode: boolean
  resultText: string
  renderedResultHtml: string
  activeRoundQuestion: string
  streamingAnswerHtml: string
  lastRequestUsedMemory: boolean
  aiOutputScrollbarRef: VNodeRef
  turnListRef: VNodeRef
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:evidencePanelCollapsed', value: boolean): void
  (e: 'update:conversationFollowMode', value: boolean): void
  (e: 'exportConversation'): void
}>()

const evidencePanelCollapsedModel = computed({
  get: () => props.evidencePanelCollapsed,
  set: (value: boolean) => emit('update:evidencePanelCollapsed', value),
})

const conversationFollowModeModel = computed({
  get: () => props.conversationFollowMode,
  set: (value: boolean) => emit('update:conversationFollowMode', value),
})
</script>

<template>
  <n-card size="small" title="AI 输出" class="ai-right-card" data-tour="ai-output-panel">
    <template #header-extra>
      <n-text class="usage-text" depth="3" :title="props.usageText">{{ props.usageText }}</n-text>
    </template>

    <DiagnosticsEvidencePanel
      :on-error-preview="props.onErrorPreview"
      :anchor-preview="props.anchorPreview"
      :jump-back-preview="props.jumpBackPreview"
      :collapsed="evidencePanelCollapsedModel"
      @toggle-collapse="evidencePanelCollapsedModel = !evidencePanelCollapsedModel"
    />

    <div v-if="props.conversationTurnViews.length || props.showStreamingTurn" class="conversation-frozen-toolbar">
      <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
        <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
          <n-text depth="3" style="font-size: 12px">多轮对话（聊天气泡模式）</n-text>
          <n-tag size="small" type="info">共 {{ props.conversationTurnViews.length }} 轮</n-tag>
        </n-flex>
        <n-flex align="center" style="gap: 8px; flex-wrap: wrap">
          <n-checkbox v-model:checked="conversationFollowModeModel" size="small">
            跟随最新
          </n-checkbox>
          <n-button size="tiny" @click="emit('exportConversation')">
            导出对话
          </n-button>
        </n-flex>
      </n-flex>
    </div>

    <n-scrollbar :ref="props.aiOutputScrollbarRef" class="ai-output-scroll" content-style="width: 100%">
      <div class="ai-output-wrap">
        <n-empty
          v-if="!props.resultText && !props.conversationTurnViews.length && !props.showStreamingTurn"
          description="暂无结果，先测试连接或发起一次分析"
        />
        <div
          v-else-if="!props.conversationTurnViews.length && !props.showStreamingTurn"
          class="ai-output-markdown markdown-body"
          v-html="props.renderedResultHtml"
        ></div>

        <n-card v-if="props.conversationTurnViews.length || props.showStreamingTurn" size="small" class="conversation-card">
          <n-flex vertical style="gap: 8px">
            <div :ref="props.turnListRef" class="turn-list">
              <div v-for="turn in props.conversationTurnViews" :key="turn.id">
                <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap; margin-bottom: 6px">
                  <n-tag size="small" type="success">第 {{ turn.turn }} 轮</n-tag>
                  <n-tag size="small" :type="turn.usedMemory ? 'success' : 'warning'">
                    {{ turn.usedMemory ? '记忆上下文' : '全量上下文' }}
                  </n-tag>
                </n-flex>
                <ConversationTurnBubble :question="turn.question" :answer-html="turn.answerHtml" />
              </div>
              <ConversationTurnBubble
                v-if="props.showStreamingTurn"
                :question="props.activeRoundQuestion"
                :answer-html="props.streamingAnswerHtml"
                streaming
              />
            </div>
          </n-flex>
        </n-card>
        <n-text v-if="props.resultText" depth="3" style="display: block; margin-top: 10px; font-size: 12px">
          上次请求模式：{{ props.lastRequestUsedMemory ? '记忆上下文' : '全量上下文' }}
        </n-text>
      </div>
    </n-scrollbar>
  </n-card>
</template>

<style scoped>
.ai-right-card {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-right-card :deep(.n-card-header) {
  gap: 8px;
}

.ai-right-card :deep(.n-card-header__extra) {
  min-width: 0;
}

.ai-right-card :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.usage-text {
  display: block;
  max-width: min(54vw, 720px);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-output-scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.ai-output-scroll :deep(.n-scrollbar-container) {
  height: 100%;
}

.ai-output-scroll :deep(.n-scrollbar-content) {
  width: 100% !important;
}

.ai-output-wrap {
  min-height: 100%;
  height: 100%;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 2px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-output-markdown {
  margin: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 100%;
  line-height: 1.55;
  font-size: 13px;
}

.conversation-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.conversation-card :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.turn-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.conversation-frozen-toolbar {
  flex-shrink: 0;
  background: rgba(46, 51, 56, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 8px;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  margin: 10px 0 6px;
  line-height: 1.35;
}

:deep(.markdown-body p) {
  margin: 6px 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin: 6px 0 6px 20px;
  padding: 0;
}

:deep(.markdown-body li) {
  margin: 2px 0;
}

:deep(.markdown-body blockquote) {
  margin: 8px 0;
  padding: 8px 10px;
  border-left: 3px solid rgba(127, 231, 196, 0.7);
  background: rgba(127, 231, 196, 0.08);
}

:deep(.markdown-body code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  font-family: Consolas, Menlo, Monaco, monospace;
  font-size: 0.92em;
}

:deep(.markdown-body pre.md-code) {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  overflow: auto;
}

:deep(.markdown-body pre.md-code code) {
  padding: 0;
  background: transparent;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12px;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid rgba(255, 255, 255, 0.18);
  padding: 6px 8px;
  vertical-align: top;
}

:deep(.markdown-body th) {
  background: rgba(127, 231, 196, 0.16);
  font-weight: 600;
}

:deep(.markdown-body a) {
  color: #7fe7c4;
  text-decoration: underline;
}

@media (max-width: 900px) {
  .ai-right-card {
    height: auto;
    min-height: 0;
  }

  .ai-right-card :deep(.n-card-header) {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .ai-right-card :deep(.n-card-header__main),
  .ai-right-card :deep(.n-card-header__extra) {
    width: 100%;
  }

  .usage-text {
    max-width: 100%;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.35;
    font-size: 11px;
  }

  .turn-list {
    gap: 8px;
    padding-right: 0;
  }

  .conversation-frozen-toolbar {
    padding: 6px 7px;
  }
}
</style>
