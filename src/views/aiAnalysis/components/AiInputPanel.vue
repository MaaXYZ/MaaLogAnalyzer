<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NCard, NCheckbox, NFlex, NInput, NTag, NText } from 'naive-ui'

interface QuickPromptItem {
  label: string
}

interface Props {
  apiKey: string
  showApiKeyHint: boolean
  globalSettingsCollapsed: boolean
  testing: boolean
  analyzing: boolean
  question: string
  model: string
  maxTokens: number
  streamResponse: boolean
  baseUrl: string
  temperature: number
  maxTokensAuto: boolean
  includeKnowledgePack: boolean
  knowledgeBootstrap: boolean
  includeSignalLines: boolean
  includeSelectedNodeFocus: boolean
  truncateAutoRetryEnabled: boolean
  conciseAnswerMaxChars: number
  memoryModeEnabled: boolean
  memoryApplicable: boolean
  memoryStatusText: string
  selectedTaskTitle: string
  sourceLabel: string
  selectedNodeFocusDetail: string
  currentMemoryTurns: number | null
  currentMemoryPreview: string
  quickPrompts: QuickPromptItem[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:apiKey', value: string): void
  (e: 'update:showApiKeyHint', value: boolean): void
  (e: 'update:globalSettingsCollapsed', value: boolean): void
  (e: 'update:memoryModeEnabled', value: boolean): void
  (e: 'update:includeSelectedNodeFocus', value: boolean): void
  (e: 'update:knowledgeBootstrap', value: boolean): void
  (e: 'update:question', value: string): void
  (e: 'test'): void
  (e: 'clearApiKey'): void
  (e: 'clearCurrentTaskMemory'): void
  (e: 'clearMemory'): void
  (e: 'openMemory'): void
  (e: 'applyQuickPrompt', index: number): void
  (e: 'analyze'): void
}>()

const apiKeyModel = computed({
  get: () => props.apiKey,
  set: (value: string) => emit('update:apiKey', value),
})

const showApiKeyHintModel = computed({
  get: () => props.showApiKeyHint,
  set: (value: boolean) => emit('update:showApiKeyHint', value),
})

const globalSettingsCollapsedModel = computed({
  get: () => props.globalSettingsCollapsed,
  set: (value: boolean) => emit('update:globalSettingsCollapsed', value),
})

const memoryModeEnabledModel = computed({
  get: () => props.memoryModeEnabled,
  set: (value: boolean) => emit('update:memoryModeEnabled', value),
})

const includeSelectedNodeFocusModel = computed({
  get: () => props.includeSelectedNodeFocus,
  set: (value: boolean) => emit('update:includeSelectedNodeFocus', value),
})

const knowledgeBootstrapModel = computed({
  get: () => props.knowledgeBootstrap,
  set: (value: boolean) => emit('update:knowledgeBootstrap', value),
})

const questionModel = computed({
  get: () => props.question,
  set: (value: string) => emit('update:question', value),
})
</script>

<template>
  <n-card size="small" title="连接与输入" class="ai-left-card" data-tour="ai-input-panel">
    <div class="left-panel-shell">
      <n-flex vertical style="gap: 12px" class="left-panel-content">
        <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
          <n-text depth="3" style="font-size: 12px">API Key（会话内）</n-text>
          <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
            <n-button text size="tiny" @click="showApiKeyHintModel = !showApiKeyHintModel">
              {{ showApiKeyHintModel ? '隐藏说明' : '显示说明' }}
            </n-button>
            <n-button text size="tiny" @click="emit('clearApiKey')">清空 Key</n-button>
            <n-button text size="tiny" :loading="props.testing" @click="emit('test')">测试连接</n-button>
          </n-flex>
        </n-flex>
        <n-text v-if="showApiKeyHintModel" depth="3" style="font-size: 12px">
          纯前端 BYOK 模式：API Key 仅保存到当前会话，不写入本地长期存储。
        </n-text>

        <n-input
          v-model:value="apiKeyModel"
          type="password"
          show-password-on="click"
          placeholder="输入你的 API Key（例如 sk-...）"
          autocomplete="current-password"
          name="maa-ai-api-key"
        />

        <n-card size="small" :bordered="true">
          <n-flex vertical style="gap: 6px">
            <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
              <n-text depth="3" style="font-size: 12px">全局 AI 配置（可在“设置”页统一修改）</n-text>
              <n-button text size="tiny" @click="globalSettingsCollapsedModel = !globalSettingsCollapsedModel">
                {{ globalSettingsCollapsedModel ? '展开' : '收起' }}
              </n-button>
            </n-flex>

            <n-text depth="3" style="font-size: 12px">
              {{ props.model }} · {{ props.maxTokens }} tokens · {{ props.streamResponse ? '流式开' : '流式关' }}
            </n-text>

            <template v-if="!globalSettingsCollapsedModel">
              <n-text depth="3" style="font-size: 12px">
                Base URL：{{ props.baseUrl }}
              </n-text>
              <n-text depth="3" style="font-size: 12px">
                模型：{{ props.model }} · 温度：{{ props.temperature }}
              </n-text>
              <n-text depth="3" style="font-size: 12px">
                最大输出：{{ props.maxTokens }} · 自动截断重试（提额）：{{ props.maxTokensAuto ? '开' : '关' }}
              </n-text>
              <n-text depth="3" style="font-size: 12px">
                知识包：{{ props.includeKnowledgePack ? '开' : '关' }} · 知识模式：{{ props.knowledgeBootstrap ? '全量排序' : '相关摘要' }} · 信号线：{{ props.includeSignalLines ? '开' : '关' }} · 节点焦点：{{ props.includeSelectedNodeFocus ? '开' : '关' }} · 流式：{{ props.streamResponse ? '开' : '关' }}
              </n-text>
              <n-text depth="3" style="font-size: 12px">
                截断精简重试：{{ props.truncateAutoRetryEnabled ? '开' : '关' }} · 精简上限：{{ props.conciseAnswerMaxChars }} 字
              </n-text>
            </template>
          </n-flex>
        </n-card>

        <n-checkbox v-model:checked="memoryModeEnabledModel">启用上下文记忆模式（追问时不重复发送全量 JSON）</n-checkbox>
        <n-checkbox v-model:checked="includeSelectedNodeFocusModel">注入选中节点焦点上下文</n-checkbox>
        <n-checkbox v-model:checked="knowledgeBootstrapModel">首轮注入全量知识卡片（关闭时仅注入相关摘要）</n-checkbox>

        <n-flex align="center" style="gap: 8px; flex-wrap: wrap">
          <n-tag :type="props.memoryApplicable ? 'success' : 'default'">{{ props.memoryStatusText }}</n-tag>
          <n-button size="tiny" @click="emit('clearCurrentTaskMemory')">清空当前任务记忆</n-button>
          <n-button size="tiny" @click="emit('clearMemory')">清空记忆</n-button>
        </n-flex>

        <n-card size="small" :bordered="true">
          <n-flex vertical style="gap: 6px">
            <n-text depth="3">当前任务：{{ props.selectedTaskTitle }}</n-text>
            <n-text depth="3">当前日志源：{{ props.sourceLabel }}</n-text>
            <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
              <n-tag size="small" :type="props.includeSelectedNodeFocus ? 'success' : 'default'">
                {{ props.includeSelectedNodeFocus ? '节点焦点：开' : '节点焦点：关' }}
              </n-tag>
              <n-text depth="3" style="font-size: 12px">{{ props.selectedNodeFocusDetail }}</n-text>
            </n-flex>
          </n-flex>
        </n-card>

        <n-card size="small" :bordered="true" class="left-context-card">
          <n-flex vertical style="gap: 8px; height: 100%">
            <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
              <n-text depth="3" style="font-size: 12px">当前任务记忆摘要</n-text>
              <n-flex align="center" style="gap: 6px">
                <n-tag size="small" :type="props.currentMemoryTurns != null ? 'success' : 'default'">
                  {{ props.currentMemoryTurns != null ? `已积累 ${props.currentMemoryTurns} 轮` : '未建立' }}
                </n-tag>
                <n-button size="tiny" quaternary :disabled="props.currentMemoryTurns == null" @click="emit('openMemory')">
                  查看全文
                </n-button>
              </n-flex>
            </n-flex>

            <div class="memory-preview-box">
              <pre class="memory-preview-text">{{ props.currentMemoryPreview }}</pre>
            </div>

            <n-text depth="3" style="font-size: 12px">快捷提问</n-text>
            <n-flex style="gap: 6px; flex-wrap: wrap">
              <n-button
                v-for="(item, index) in props.quickPrompts"
                :key="item.label"
                size="tiny"
                quaternary
                @click="emit('applyQuickPrompt', index)"
              >
                {{ item.label }}
              </n-button>
            </n-flex>
          </n-flex>
        </n-card>
      </n-flex>

      <div class="left-analyze-block">
        <n-input
          v-model:value="questionModel"
          class="question-input-fill"
          type="textarea"
          :autosize="false"
          rows="6"
          placeholder="输入你希望 AI 分析的问题"
        />
        <n-button data-tour="ai-analyze-action" type="primary" :loading="props.analyzing" @click="emit('analyze')">
          分析当前任务
        </n-button>
      </div>
    </div>
  </n-card>
</template>

<style scoped>
.ai-left-card {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-left-card :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.left-panel-shell {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.left-panel-content {
  flex: 0 1 auto;
  min-height: 0;
  max-height: calc(100% - 198px);
  overflow: auto;
  padding-right: 2px;
  padding-bottom: 4px;
}

.left-context-card {
  flex: 0 0 auto;
  min-height: 132px;
  max-height: 168px;
}

.left-context-card :deep(.n-card__content) {
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.memory-preview-box {
  flex: 1;
  min-height: 44px;
  max-height: 72px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  padding: 8px 10px 12px;
}

.memory-preview-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.45;
  font-size: 12px;
}

.left-analyze-block {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 8px;
}

.question-input-fill {
  flex: 1;
  min-height: 0;
}

.question-input-fill :deep(.n-input-wrapper),
.question-input-fill :deep(.n-input__textarea),
.question-input-fill :deep(.n-input__textarea-el) {
  height: 100%;
}

.left-analyze-block > .n-button {
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .ai-left-card {
    height: auto;
    min-height: 0;
  }

  .left-context-card {
    min-height: 120px;
    max-height: 150px;
  }

  .left-panel-content {
    max-height: none;
  }

  .memory-preview-box {
    max-height: 64px;
  }
}
</style>
