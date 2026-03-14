<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NCheckbox, NEmpty, NFlex, NInput, NInputNumber, NScrollbar, NTag, NText, useMessage } from 'naive-ui'
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

interface MemoryState {
  summary: string
  contextKey: string
  turns: number
  updatedAt: number
}

interface StructuredAiOutput {
  answer: string
  memory_update: string
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

const memoryModeEnabled = ref(true)
const memoryState = ref<MemoryState | null>(null)
const lastRequestUsedMemory = ref(false)

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

const buildContextKey = (): string => {
  const task = props.selectedTask
  const source = sourceLabel.value

  if (!task) {
    return `none|tasks:${props.tasks.length}|source:${source}`
  }

  const tailNode = task.nodes.length > 0 ? task.nodes[task.nodes.length - 1] : null
  return [
    `task:${task.task_id}`,
    `status:${task.status}`,
    `nodes:${task.nodes.length}`,
    `tailNode:${tailNode?.node_id ?? -1}`,
    `tailTs:${tailNode?.timestamp ?? task.end_time ?? task.start_time}`,
    `source:${source}`,
  ].join('|')
}

const memoryApplicable = computed(() => {
  if (!memoryModeEnabled.value || !memoryState.value) return false
  return memoryState.value.contextKey === buildContextKey()
})

const memoryStatusText = computed(() => {
  if (!memoryModeEnabled.value) return '记忆模式：关闭'
  if (!memoryState.value) return '记忆模式：未建立'
  if (memoryApplicable.value) return `记忆模式：可复用（${memoryState.value.turns} 轮）`
  return '记忆模式：上下文已变化，下一次将重建'
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

const clearMemory = () => {
  memoryState.value = null
  lastRequestUsedMemory.value = false
  message.success('已清空上下文记忆')
}

const getSystemPrompt = () => {
  return [
    '你是 MaaFramework 日志分析助手。',
    '你必须只根据给定上下文回答，不允许编造。',
    '必须返回 JSON 对象，格式为：',
    '{"answer":"...","memory_update":"..."}',
    '其中 memory_update 是可供后续追问复用的高密度摘要。',
    '如果证据不足，请在 answer 中明确写“证据不足”。',
  ].join('\n')
}

const buildFullContextPrompt = () => {
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
    '这是首轮或上下文变化后的分析，请基于完整上下文回答。',
    `问题: ${question.value}`,
    '',
    '完整上下文 JSON:',
    JSON.stringify(context, null, 2),
  ].join('\n')
}

const buildMemoryPrompt = (memory: MemoryState) => {
  return [
    '这是同一上下文下的追问，请优先基于已有记忆回答。',
    `问题: ${question.value}`,
    '',
    `上下文指纹: ${memory.contextKey}`,
    '会话记忆:',
    memory.summary,
  ].join('\n')
}

const normalizeJsonCandidate = (text: string): string => {
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('```')) {
    const cleaned = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()
    return cleaned
  }

  return trimmed
}

const tryParseStructuredOutput = (text: string): StructuredAiOutput | null => {
  const candidates: string[] = []
  const normalized = normalizeJsonCandidate(text)
  if (normalized) candidates.push(normalized)

  const firstBrace = normalized.indexOf('{')
  const lastBrace = normalized.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
      const memoryUpdate = typeof parsed.memory_update === 'string' ? parsed.memory_update.trim() : ''
      if (answer || memoryUpdate) {
        return {
          answer: answer || '证据不足',
          memory_update: memoryUpdate,
        }
      }
    } catch {
      // ignore parse error
    }
  }

  return null
}

const buildFallbackMemory = (answer: string, questionText: string): string => {
  const compact = answer.replace(/\s+/g, ' ').trim()
  const capped = compact.length > 900 ? `${compact.slice(0, 900)}...` : compact
  return `最近问题: ${questionText}\n最近结论: ${capped}`
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

  const contextKey = buildContextKey()
  const useMemoryForThisRound = mode === 'analyze' && memoryModeEnabled.value && !!memoryState.value && memoryState.value.contextKey === contextKey
  lastRequestUsedMemory.value = useMemoryForThisRound

  const userContent = mode === 'test'
    ? '请只输出：连接正常'
    : useMemoryForThisRound
      ? buildMemoryPrompt(memoryState.value as MemoryState)
      : buildFullContextPrompt()

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

  const usageModeText = mode === 'analyze'
    ? (useMemoryForThisRound ? '记忆上下文' : '全量上下文')
    : '连接测试'

  if (response.usage?.totalTokens != null) {
    usageText.value = `Token 使用: ${response.usage.totalTokens} (prompt ${response.usage.promptTokens ?? '-'} / completion ${response.usage.completionTokens ?? '-'}) | ${usageModeText}`
  } else {
    usageText.value = `上下文模式: ${usageModeText}`
  }

  if (mode === 'test') {
    resultText.value = response.text
    return
  }

  const parsed = tryParseStructuredOutput(response.text)
  const answerText = parsed?.answer?.trim() || response.text
  resultText.value = answerText

  if (!memoryModeEnabled.value) return

  const nextMemorySummary = parsed?.memory_update?.trim() || buildFallbackMemory(answerText, question.value)
  memoryState.value = {
    summary: nextMemorySummary,
    contextKey,
    turns: (memoryState.value?.contextKey === contextKey ? memoryState.value.turns : 0) + 1,
    updatedAt: Date.now(),
  }
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
            <n-checkbox v-model:checked="memoryModeEnabled">启用上下文记忆模式（追问时不重复发送全量 JSON）</n-checkbox>
          </n-flex>

          <n-flex align="center" style="gap: 8px; flex-wrap: wrap">
            <n-tag :type="memoryApplicable ? 'success' : 'default'">{{ memoryStatusText }}</n-tag>
            <n-button size="tiny" @click="clearMemory">清空记忆</n-button>
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

            <n-card v-if="memoryState && memoryModeEnabled" size="small" style="margin-top: 10px">
              <n-flex vertical style="gap: 6px">
                <n-text depth="3" style="font-size: 12px">记忆摘要（用于后续追问）</n-text>
                <n-input :value="memoryState.summary" type="textarea" readonly :autosize="{ minRows: 3, maxRows: 8 }" />
                <n-text depth="3" style="font-size: 12px">
                  上次请求模式：{{ lastRequestUsedMemory ? '记忆上下文' : '全量上下文' }}
                </n-text>
              </n-flex>
            </n-card>
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
