<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NCheckbox, NEmpty, NFlex, NInput, NInputNumber, NScrollbar, NText, useMessage } from 'naive-ui'
import type { TaskInfo } from '../types'
import { requestChatCompletion } from '../ai/client'
import { buildAiAnalysisContext, type AiLoadedTarget } from '../ai/contextBuilder'
import { getAiSettings, saveAiSettings, getSessionApiKey, setSessionApiKey } from '../utils/aiSettings'

interface Props {
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  loadedTargets: AiLoadedTarget[]
  loadedDefaultTargetId: string
}

const props = defineProps<Props>()

const message = useMessage()
const settings = getAiSettings()
const apiKey = ref(getSessionApiKey())
const question = ref('请分析当前任务中最可能的失败原因，并给出可执行的排查步骤。')
const analyzing = ref(false)
const testing = ref(false)
const resultText = ref('')
const usageText = ref('')

const selectedTaskTitle = computed(() => {
  if (!props.selectedTask) return '未选择任务'
  return `#${props.selectedTask.task_id} ${props.selectedTask.entry}`
})

const sourceLabel = computed(() => {
  if (!props.loadedTargets.length) return '未加载日志'

  const preferred = props.loadedTargets.find(item => item.id === props.loadedDefaultTargetId)
  if (preferred) return preferred.fileName || preferred.label

  return props.loadedTargets[0].fileName || props.loadedTargets[0].label
})

watch(apiKey, (value) => {
  setSessionApiKey(value)
})

const saveConfig = () => {
  saveAiSettings(settings)
  message.success('AI 配置已保存（不含 API Key）')
}

const clearApiKey = () => {
  apiKey.value = ''
  setSessionApiKey('')
  message.success('已清空会话 API Key')
}

const getSystemPrompt = () => {
  return [
    '你是 MaaFramework 日志分析助手。',
    '你必须只根据给定上下文回答，不允许编造。',
    '输出结构固定为：',
    '1. 结论',
    '2. 证据（逐条引用字段）',
    '3. 不确定项',
    '4. 建议操作（按优先级）',
    '如果证据不足，明确说“证据不足”。',
  ].join('\n')
}

const buildUserPrompt = () => {
  const context = buildAiAnalysisContext({
    tasks: props.tasks,
    selectedTask: props.selectedTask,
    question: question.value,
    loadedTargets: props.loadedTargets,
    loadedDefaultTargetId: props.loadedDefaultTargetId,
    includeKnowledgePack: settings.includeKnowledgePack,
    includeSignalLines: settings.includeSignalLines,
  })

  return [
    `问题: ${question.value}`,
    '',
    '上下文 JSON:',
    JSON.stringify(context, null, 2),
  ].join('\n')
}

const runRequest = async (mode: 'test' | 'analyze') => {
  const key = apiKey.value.trim()
  if (!key) {
    message.warning('请先输入 API Key')
    return
  }

  if (mode === 'analyze' && !props.selectedTask) {
    message.warning('请先在日志分析页面选择一个任务')
    return
  }

  const userContent = mode === 'test'
    ? '请只输出：连接正常'
    : buildUserPrompt()

  const response = await requestChatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: key,
    model: settings.model,
    temperature: mode === 'test' ? 0 : settings.temperature,
    maxTokens: mode === 'test' ? 256 : settings.maxTokens,
    timeoutMs: mode === 'test' ? 15000 : 60000,
    messages: [
      { role: 'system', content: getSystemPrompt() },
      { role: 'user', content: userContent },
    ],
  })

  if (response.usage?.totalTokens != null) {
    usageText.value = `Token 使用: ${response.usage.totalTokens} (prompt ${response.usage.promptTokens ?? '-'} / completion ${response.usage.completionTokens ?? '-'})`
  } else {
    usageText.value = ''
  }

  resultText.value = response.text
}

const handleTest = async () => {
  testing.value = true
  try {
    await runRequest('test')
    message.success('连接测试成功')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    message.error(`连接测试失败: ${msg}`)
  } finally {
    testing.value = false
  }
}

const handleAnalyze = async () => {
  analyzing.value = true
  try {
    await runRequest('analyze')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    message.error(`AI 分析失败: ${msg}`)
  } finally {
    analyzing.value = false
  }
}
</script>

<template>
  <div class="ai-view-root">
    <div class="ai-view-grid">
      <n-card size="small" title="连接与输入" class="ai-left-card">
        <n-flex vertical style="gap: 12px">
          <n-alert type="info" :show-icon="false">
            纯前端 BYOK 模式：API Key 仅保存到当前会话，不写入本地长期存储。
          </n-alert>

          <n-input
            v-model:value="apiKey"
            type="password"
            show-password-on="click"
            placeholder="输入你的 API Key（例如 sk-...）"
            autocomplete="current-password"
            name="maa-ai-api-key"
          />

          <n-input
            v-model:value="settings.baseUrl"
            placeholder="API Base URL，例如 https://api.openai.com/v1"
          />

          <n-input v-model:value="settings.model" placeholder="模型名称，例如 gpt-4.1-mini" />

          <n-flex align="center" style="gap: 8px">
            <n-text depth="3" style="width: 90px">温度</n-text>
            <n-input-number v-model:value="settings.temperature" :min="0" :max="2" :step="0.1" />
          </n-flex>

          <n-flex align="center" style="gap: 8px">
            <n-text depth="3" style="width: 90px">最大输出</n-text>
            <n-input-number v-model:value="settings.maxTokens" :min="256" :max="4096" :step="64" />
          </n-flex>

          <n-flex vertical style="gap: 6px">
            <n-checkbox v-model:checked="settings.includeKnowledgePack">注入 Maa 领域知识包</n-checkbox>
            <n-checkbox v-model:checked="settings.includeSignalLines">注入日志中的 [WRN]/[ERR] 片段</n-checkbox>
          </n-flex>

          <n-flex style="gap: 8px; flex-wrap: wrap">
            <n-button @click="saveConfig">保存配置</n-button>
            <n-button @click="clearApiKey">清空 Key</n-button>
            <n-button :loading="testing" @click="handleTest">测试连接</n-button>
          </n-flex>

          <n-card size="small" :bordered="true">
            <n-flex vertical style="gap: 6px">
              <n-text depth="3">当前任务：{{ selectedTaskTitle }}</n-text>
              <n-text depth="3">当前日志源：{{ sourceLabel }}</n-text>
            </n-flex>
          </n-card>

          <n-input
            v-model:value="question"
            type="textarea"
            :autosize="{ minRows: 5, maxRows: 12 }"
            placeholder="输入你希望 AI 分析的问题"
          />

          <n-button type="primary" :loading="analyzing" @click="handleAnalyze">
            分析当前任务
          </n-button>
        </n-flex>
      </n-card>

      <n-card size="small" title="AI 输出" class="ai-right-card">
        <template #header-extra>
          <n-text depth="3" style="font-size: 12px">{{ usageText }}</n-text>
        </template>

        <n-scrollbar style="height: 100%">
          <div class="ai-output-wrap">
            <n-empty v-if="!resultText" description="暂无结果，先测试连接或发起一次分析" />
            <pre v-else class="ai-output-text">{{ resultText }}</pre>
          </div>
        </n-scrollbar>
      </n-card>
    </div>
  </div>
</template>

<style scoped>
.ai-view-root {
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.ai-view-grid {
  height: 100%;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(360px, 460px) minmax(0, 1fr);
}

.ai-left-card,
.ai-right-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.ai-output-wrap {
  min-height: 100%;
  padding: 4px 2px 10px;
}

.ai-output-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 13px;
}

@media (max-width: 900px) {
  .ai-view-grid {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
}
</style>
