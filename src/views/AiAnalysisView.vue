<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCard, NCheckbox, NEmpty, NFlex, NInput, NModal, NScrollbar, NTag, NText, useMessage } from 'naive-ui'
import type { NodeInfo, TaskInfo } from '../types'
import { requestChatCompletion, type ChatCompletionResult } from '../ai/client'
import {
  buildAiAnalysisContext,
  buildAnchorResolutionDiagnostics,
  buildEventChainDiagnostics,
  buildJumpBackFlowDiagnostics,
  type AiLoadedTarget,
} from '../ai/contextBuilder'
import { tryParseStructuredOutput, type StructuredAiOutput } from '../ai/structuredOutput'
import { getAiSettings, getSessionApiKey, saveAiSettings, setSessionApiKey } from '../utils/aiSettings'
import { saveFile } from '../utils/fileDialog'

interface Props {
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode: NodeInfo | null
  selectedFlowItemId?: string | null
  loadedTargets: AiLoadedTarget[]
  loadedDefaultTargetId: string
}

interface MemoryState {
  summary: string
  contextKey: string
  turns: number
  updatedAt: number
}

type MemoryStateStore = Record<string, MemoryState>

interface ConversationTurn {
  id: string
  turn: number
  contextKey: string
  question: string
  answer: string
  usedMemory: boolean
  timestamp: number
  roundPromptTokens?: number
  roundCompletionTokens?: number
  roundTotalTokens?: number
  roundRequestCount?: number
}

interface ConversationTurnView extends ConversationTurn {
  answerHtml: string
}

type AnalysisFocusMode = 'general' | 'on_error' | 'hotspot'

interface QuickPromptItem {
  label: string
  prompt: string
  forceProfile?: 'diagnostic' | 'followup'
  focusMode?: AnalysisFocusMode
}

interface ParentRelationConflictIssue {
  directParents: string[]
  upstreamChains: Array<{ from: string; to: string }>
  reason: string
}

interface ParentRelationFacts {
  directParentCandidates: Array<{ name: string; failedCount: number }>
  upstreamChains: Array<{ from: string; to: string; hitCount: number; terminalBounceCount: number }>
}

interface TokenUsageAccumulator {
  prompt: number
  completion: number
  total: number
  requestCount: number
}

const props = defineProps<Props>()

const message = useMessage()
const settings = getAiSettings()
const apiKey = ref(getSessionApiKey())
const question = ref('请分析当前任务中最可能的失败原因，并给出可执行的排查步骤。')
const analyzing = ref(false)
const analyzingStage = ref<'idle' | 'streaming' | 'postprocess'>('idle')
const testing = ref(false)
const resultText = ref('')
const usageText = ref('')
const evidencePanelCollapsed = ref(true)
const conversationFollowMode = ref(true)
const activeRoundQuestion = ref('')
const showApiKeyHint = ref(false)
const globalSettingsCollapsed = ref(true)
const memoryDialogVisible = ref(false)
const quickPromptProfileOverride = ref<'diagnostic' | 'followup' | null>(null)
const quickPromptFocusOverride = ref<AnalysisFocusMode | null>(null)
const turnListRef = ref<HTMLElement | null>(null)
const aiOutputScrollbarRef = ref<{ scrollTo: (options: { top?: number; left?: number; behavior?: ScrollBehavior }) => void } | null>(null)
const streamingRenderText = ref('')
const streamFlushTimer = ref<number | null>(null)
const pendingStreamFullText = ref('')

const clearStreamFlushTimer = () => {
  if (streamFlushTimer.value != null) {
    window.clearTimeout(streamFlushTimer.value)
    streamFlushTimer.value = null
  }
}

const flushStreamingText = (force = false) => {
  if (!force && streamFlushTimer.value != null) return
  const doFlush = () => {
    streamingRenderText.value = pendingStreamFullText.value
    streamFlushTimer.value = null
  }
  if (force) {
    clearStreamFlushTimer()
    doFlush()
    return
  }
  streamFlushTimer.value = window.setTimeout(doFlush, 120)
}

onBeforeUnmount(() => {
  clearStreamFlushTimer()
})

const memoryModeEnabled = ref(true)
const MEMORY_SESSION_KEY = 'maa-log-analyzer-ai-memory-state'
const MEMORY_SUMMARY_MAX_CHARS = 12000
const MEMORY_STORE_MAX_CONTEXTS = 30
const CONVERSATION_SESSION_KEY = 'maa-log-analyzer-ai-conversation-turns'
const CONVERSATION_MAX_TURNS = 12
const CONVERSATION_MAX_TOTAL_TURNS = 80
const CONVERSATION_QUESTION_MAX_CHARS = 1200
const CONVERSATION_ANSWER_MAX_CHARS = 28000

const clipForStorage = (value: string, maxChars: number): string => {
  const text = value.trim()
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n...(内容较长，已为降低内存占用自动截断)...`
}
const normalizeMemoryState = (value: unknown): MemoryState | null => {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<MemoryState>
  if (typeof parsed.summary !== 'string') return null
  if (typeof parsed.contextKey !== 'string') return null
  if (typeof parsed.turns !== 'number' || !Number.isFinite(parsed.turns)) return null
  if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt)) return null
  return {
    summary: parsed.summary,
    contextKey: parsed.contextKey,
    turns: parsed.turns,
    updatedAt: parsed.updatedAt,
  }
}

const loadSessionMemoryStateStore = (): MemoryStateStore => {
  try {
    const raw = sessionStorage.getItem(MEMORY_SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown

    // backward compatibility: old single memory object
    const single = normalizeMemoryState(parsed)
    if (single) {
      return { [single.contextKey]: single }
    }

    if (!parsed || typeof parsed !== 'object') return {}
    const entries = Object.entries(parsed as Record<string, unknown>)
      .map(([key, value]) => {
        const normalized = normalizeMemoryState(value)
        if (!normalized) return null
        return [key, normalized] as const
      })
      .filter((item): item is readonly [string, MemoryState] => !!item)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MEMORY_STORE_MAX_CONTEXTS)
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}
const saveSessionMemoryStateStore = (value: MemoryStateStore) => {
  try {
    if (!Object.keys(value).length) {
      sessionStorage.removeItem(MEMORY_SESSION_KEY)
      return
    }
    sessionStorage.setItem(MEMORY_SESSION_KEY, JSON.stringify(value))
  } catch {
    // ignore write errors
  }
}
const appendMemorySummary = (previous: string, next: string, turn: number): string => {
  const entry = `[第 ${turn} 轮] ${next.trim()}`
  const blocks = previous.trim() ? previous.split(/\n{2,}/).filter(Boolean) : []
  blocks.push(entry)

  let merged = blocks.join('\n\n')
  while (merged.length > MEMORY_SUMMARY_MAX_CHARS && blocks.length > 1) {
    blocks.shift()
    merged = blocks.join('\n\n')
  }

  if (merged.length > MEMORY_SUMMARY_MAX_CHARS) {
    return merged.slice(merged.length - MEMORY_SUMMARY_MAX_CHARS)
  }
  return merged
}
const memoryStateStore = ref<MemoryStateStore>(loadSessionMemoryStateStore())
const lastRequestUsedMemory = ref(false)

const loadSessionConversationTurns = (): ConversationTurn[] => {
  try {
    const raw = sessionStorage.getItem(CONVERSATION_SESSION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => item as Partial<ConversationTurn>)
      .filter(item =>
        typeof item.id === 'string'
        && typeof item.turn === 'number'
        && Number.isFinite(item.turn)
        && typeof item.contextKey === 'string'
        && typeof item.question === 'string'
        && typeof item.answer === 'string'
        && typeof item.usedMemory === 'boolean'
        && typeof item.timestamp === 'number'
        && Number.isFinite(item.timestamp)
      )
      .map(item => ({
        id: item.id as string,
        turn: item.turn as number,
        contextKey: item.contextKey as string,
        question: clipForStorage(item.question as string, CONVERSATION_QUESTION_MAX_CHARS),
        answer: clipForStorage(item.answer as string, CONVERSATION_ANSWER_MAX_CHARS),
        usedMemory: item.usedMemory as boolean,
        timestamp: item.timestamp as number,
        roundPromptTokens: typeof item.roundPromptTokens === 'number' && Number.isFinite(item.roundPromptTokens)
          ? item.roundPromptTokens
          : undefined,
        roundCompletionTokens: typeof item.roundCompletionTokens === 'number' && Number.isFinite(item.roundCompletionTokens)
          ? item.roundCompletionTokens
          : undefined,
        roundTotalTokens: typeof item.roundTotalTokens === 'number' && Number.isFinite(item.roundTotalTokens)
          ? item.roundTotalTokens
          : undefined,
        roundRequestCount: typeof item.roundRequestCount === 'number' && Number.isFinite(item.roundRequestCount)
          ? item.roundRequestCount
          : undefined,
      }))
      .slice(-CONVERSATION_MAX_TOTAL_TURNS)
  } catch {
    return []
  }
}

const saveSessionConversationTurns = (turns: ConversationTurn[]) => {
  try {
    if (!turns.length) {
      sessionStorage.removeItem(CONVERSATION_SESSION_KEY)
      return
    }
    sessionStorage.setItem(CONVERSATION_SESSION_KEY, JSON.stringify(turns.slice(-CONVERSATION_MAX_TOTAL_TURNS)))
  } catch {
    // ignore write errors
  }
}

const conversationTurns = ref<ConversationTurn[]>(loadSessionConversationTurns())

const makeTokenUsageAccumulator = (): TokenUsageAccumulator => ({
  prompt: 0,
  completion: 0,
  total: 0,
  requestCount: 0,
})

const sumContextTokenUsage = (
  contextKey: string,
  extraRound?: TokenUsageAccumulator
): TokenUsageAccumulator => {
  const sum = makeTokenUsageAccumulator()
  for (const turn of conversationTurns.value) {
    if (turn.contextKey !== contextKey) continue
    sum.prompt += Number(turn.roundPromptTokens ?? 0)
    sum.completion += Number(turn.roundCompletionTokens ?? 0)
    sum.total += Number(turn.roundTotalTokens ?? 0)
    sum.requestCount += Number(turn.roundRequestCount ?? 0)
  }
  if (extraRound) {
    sum.prompt += extraRound.prompt
    sum.completion += extraRound.completion
    sum.total += extraRound.total
    sum.requestCount += extraRound.requestCount
  }
  return sum
}

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

const selectedNodeFocusEnabled = computed(() => settings.includeSelectedNodeFocus)
const effectiveSelectedNode = computed(() => (selectedNodeFocusEnabled.value ? props.selectedNode : null))
const effectiveSelectedFlowItemId = computed(() => (selectedNodeFocusEnabled.value ? (props.selectedFlowItemId ?? null) : null))
const selectedNodeFocusDetail = computed(() => {
  if (!selectedNodeFocusEnabled.value) {
    return '仅发送任务级上下文。'
  }
  if (!effectiveSelectedNode.value) {
    return '当前未选中节点，按任务级上下文分析。'
  }
  const task = props.selectedTask
  const flowPart = effectiveSelectedFlowItemId.value ? ` · 流项: ${effectiveSelectedFlowItemId.value}` : ''
  if (task && task.task_id === effectiveSelectedNode.value.task_id) {
    return `已聚焦节点 #${effectiveSelectedNode.value.node_id} ${effectiveSelectedNode.value.name}${flowPart}`
  }
  return `已聚焦任务 #${effectiveSelectedNode.value.task_id} 的节点 #${effectiveSelectedNode.value.node_id} ${effectiveSelectedNode.value.name}${flowPart}`
})

watch(apiKey, (value) => {
  setSessionApiKey(value)
})

watch(
  () => settings.includeSelectedNodeFocus,
  () => {
    saveAiSettings(settings)
  }
)

watch(memoryStateStore, (value) => {
  saveSessionMemoryStateStore(value)
}, { deep: true })

watch(conversationTurns, (value) => {
  saveSessionConversationTurns(value)
}, { deep: true })

const buildContextKey = (): string => {
  const task = props.selectedTask
  const focusNode = effectiveSelectedNode.value
  const focusNodePart = focusNode
    ? `focusNode:${focusNode.node_id}@${focusNode.timestamp}`
    : 'focusNode:none'
  const focusFlowPart = `focusFlow:${effectiveSelectedFlowItemId.value ?? 'none'}`
  const focusModePart = `focusMode:${selectedNodeFocusEnabled.value ? 'enabled' : 'disabled'}`
  const source = sourceLabel.value

  if (!task) {
    return `none|tasks:${props.tasks.length}|${focusModePart}|${focusNodePart}|${focusFlowPart}|source:${source}`
  }

  const tailNode = task.nodes.length > 0 ? task.nodes[task.nodes.length - 1] : null
  return [
    `task:${task.task_id}`,
    `status:${task.status}`,
    `nodes:${task.nodes.length}`,
    `tailNode:${tailNode?.node_id ?? -1}`,
    `tailTs:${tailNode?.timestamp ?? task.end_time ?? task.start_time}`,
    focusModePart,
    focusNodePart,
    focusFlowPart,
    `source:${source}`,
  ].join('|')
}

const currentContextKey = computed(() => buildContextKey())
const currentMemoryState = computed<MemoryState | null>(() => memoryStateStore.value[currentContextKey.value] ?? null)
const currentMemoryFull = computed(() => {
  const summary = currentMemoryState.value?.summary?.trim() ?? ''
  if (!summary) return '当前任务暂无记忆，可先发起一轮分析。'
  return summary
})
const currentMemoryPreview = computed(() => {
  const summary = currentMemoryState.value?.summary?.trim() ?? ''
  if (!summary) return '当前任务暂无记忆，可先发起一轮分析。'
  const blocks = summary.split(/\n{2,}/).filter(Boolean)
  const latest = blocks.length ? blocks[blocks.length - 1] : summary
  const oneLine = latest.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= 84) return oneLine
  return `${oneLine.slice(0, 84)}...`
})
const quickPrompts: QuickPromptItem[] = [
  {
    label: '失败根因',
    prompt: '请先量化盘点，再给出当前任务最可能的失败根因与3条可执行验证步骤。',
    forceProfile: 'diagnostic',
    focusMode: 'general',
  },
  {
    label: 'on_error链路',
    prompt: '请只聚焦 on_error 触发链路，说明触发源、后续结果和最小修复动作。',
    forceProfile: 'diagnostic',
    focusMode: 'on_error',
  },
  {
    label: '识别热点',
    prompt: '请按失败率列出前3个识别热点，并给出每个热点的修复优先级与验证方式。',
    forceProfile: 'diagnostic',
    focusMode: 'hotspot',
  },
]

const memoryApplicable = computed(() => {
  if (!memoryModeEnabled.value) return false
  return !!currentMemoryState.value
})

const memoryStatusText = computed(() => {
  if (!memoryModeEnabled.value) return '记忆模式：关闭'
  const current = currentMemoryState.value
  if (current) return `记忆模式：可复用（${current.turns} 轮）`
  const cachedCount = Object.keys(memoryStateStore.value).length
  if (!cachedCount) return '记忆模式：未建立'
  return `记忆模式：当前任务未建立（已缓存 ${cachedCount} 组）`
})

const applyQuickPrompt = (item: QuickPromptItem) => {
  question.value = item.prompt
  quickPromptProfileOverride.value = item.forceProfile ?? null
  quickPromptFocusOverride.value = item.focusMode ?? null
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const splitTableCells = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(item => item.trim())

const isMarkdownTableDivider = (line: string): boolean =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)

const renderInlineMarkdown = (text: string): string => {
  const codeTokens: string[] = []
  const placeholderWrapped = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const token = `@@CODE_TOKEN_${codeTokens.length}@@`
    codeTokens.push(code)
    return token
  })

  let html = escapeHtml(placeholderWrapped)
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safe = /^https?:\/\//i.test(url)
    if (!safe) return `${label} (${url})`
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
  html = html.replace(/@@CODE_TOKEN_(\d+)@@/g, (_m, idx: string) => {
    const code = codeTokens[Number(idx)] ?? ''
    return `<code>${escapeHtml(code)}</code>`
  })
  return html
}

const renderMarkdownBlocks = (source: string): string => {
  const lines = source.split('\n')
  const out: string[] = []
  let i = 0
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[][] = []
  let paragraphLines: string[] = []

  const closeList = () => {
    if (!listType) return
    const tag = listType
    const itemsHtml = listItems
      .map(itemLines => {
        const body = itemLines
          .map(line => renderInlineMarkdown(line.trimEnd()))
          .join('<br/>')
        return `<li>${body}</li>`
      })
      .join('')
    out.push(`<${tag}>${itemsHtml}</${tag}>`)
    listType = null
    listItems = []
  }

  const flushParagraph = () => {
    if (!paragraphLines.length) return
    const html = paragraphLines
      .map(line => renderInlineMarkdown(line.trimEnd()))
      .join('<br/>')
    out.push(`<p>${html}</p>`)
    paragraphLines = []
  }

  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()
    const leadingSpaces = raw.length - raw.trimStart().length

    if (!trimmed) {
      if (listType && listItems.length > 0) {
        listItems[listItems.length - 1].push('')
        i += 1
        continue
      }
      flushParagraph()
      closeList()
      i += 1
      continue
    }

    const heading = raw.match(/^\s*(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
      i += 1
      continue
    }

    if (raw.includes('|') && i + 1 < lines.length && isMarkdownTableDivider(lines[i + 1])) {
      flushParagraph()
      closeList()
      const headers = splitTableCells(raw)
      i += 2
      const rows: string[][] = []
      while (i < lines.length) {
        const rowRaw = lines[i]
        if (!rowRaw.trim() || !rowRaw.includes('|')) break
        rows.push(splitTableCells(rowRaw))
        i += 1
      }

      const thead = `<thead><tr>${headers.map(item => `<th>${renderInlineMarkdown(item)}</th>`).join('')}</tr></thead>`
      const tbodyRows = rows.map(row => {
        const normalized = headers.map((_, idx) => row[idx] ?? '')
        return `<tr>${normalized.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`
      }).join('')
      out.push(`<table>${thead}<tbody>${tbodyRows}</tbody></table>`)
      continue
    }

    const quote = raw.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      closeList()
      const quoteLines: string[] = []
      while (i < lines.length) {
        const current = lines[i].match(/^\s*>\s?(.*)$/)
        if (!current) break
        quoteLines.push(current[1])
        i += 1
      }
      out.push(`<blockquote>${renderMarkdownBlocks(quoteLines.join('\n'))}</blockquote>`)
      continue
    }

    const ul = raw.match(/^\s*[-*+]\s+(.+)$/)
    if (ul) {
      if (listType && listItems.length > 0 && leadingSpaces > 0) {
        listItems[listItems.length - 1].push(raw.trim())
        i += 1
        continue
      }
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        listType = 'ul'
      }
      listItems.push([ul[1]])
      i += 1
      continue
    }

    const ol = raw.match(/^\s*\d+\.\s+(.+)$/)
    if (ol) {
      if (listType && listItems.length > 0 && leadingSpaces > 0) {
        listItems[listItems.length - 1].push(raw.trim())
        i += 1
        continue
      }
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        listType = 'ol'
      }
      listItems.push([ol[1]])
      i += 1
      continue
    }

    if (listType && listItems.length > 0) {
      listItems[listItems.length - 1].push(raw)
      i += 1
      continue
    }

    closeList()
    paragraphLines.push(raw)
    i += 1
  }

  flushParagraph()
  closeList()
  return out.join('\n')
}

const renderMarkdown = (source: string): string => {
  if (!source.trim()) return ''
  const normalized = source.replace(/\r\n?/g, '\n')
  const segments = normalized.split(/```/)
  const html: string[] = []

  segments.forEach((segment, index) => {
    if (index % 2 === 0) {
      html.push(renderMarkdownBlocks(segment))
      return
    }

    const lines = segment.split('\n')
    const language = lines[0]?.trim() || ''
    const code = lines.slice(1).join('\n')
    const langClass = language ? ` class="language-${escapeHtml(language)}"` : ''
    html.push(`<pre class="md-code"><code${langClass}>${escapeHtml(code)}</code></pre>`)
  })

  return html.join('\n')
}

const sanitizeAnswerForUser = (raw: string): string => {
  if (!raw) return raw
  const replacers: Array<[RegExp, string]> = [
    [/timelineDiagnostics\.longStayNodes(?:\[\d+\])?/g, '时间线长停留统计'],
    [/timelineDiagnostics\.recoFailuresByName(?:\[\d+\])?/g, '识别失败分布统计'],
    [/timelineDiagnostics\.hotspotRecoPairs(?:\[\d+\])?/g, '识别热点组合统计'],
    [/timelineDiagnostics\.repeatedRuns(?:\[\d+\])?/g, '连续重复运行统计'],
    [/eventChainDiagnostics\.onErrorChains(?:\[\d+\])?/g, 'on_error 触发链路'],
    [/eventChainDiagnostics\.nextRecognitionChains(?:\[\d+\])?/g, 'next 识别链路'],
    [/eventChainDiagnostics\.actionFailureChains(?:\[\d+\])?/g, '动作失败链路'],
    [/stopTerminationDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, '停止链路诊断'],
    [/nextCandidateAvailabilityDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'next 候选可执行性诊断'],
    [/anchorResolutionDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'anchor 解析诊断'],
    [/jumpBackFlowDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'jump_back 回跳诊断'],
    [/nestedActionDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, 'nested action 诊断'],
    [/questionNodeDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, '问题节点专项统计'],
    [/signalDiagnostics(?:\.[A-Za-z0-9_\[\]\.]+)?/g, '信号分型统计'],
    [/deterministicFindings\.findings(?:\[\d+\])?/g, '确定性结论摘要'],
    [/selectedEventTail(?:\[\d+\])?/g, '事件尾部记录'],
  ]

  let next = raw
  for (const [pattern, replacement] of replacers) {
    next = next.replace(pattern, replacement)
  }
  return next
}

const renderedResultHtml = computed(() => renderMarkdown(resultText.value))
const streamingAnswerHtml = computed(() => renderMarkdown(streamingRenderText.value))
const showStreamingTurn = computed(() =>
  analyzing.value
  && analyzingStage.value !== 'idle'
  && !!streamingRenderText.value.trim()
  && !!activeRoundQuestion.value.trim()
)

const conversationTurnViews = computed<ConversationTurnView[]>(() => {
  return [...conversationTurns.value]
    .filter(item => item.contextKey === currentContextKey.value)
    .sort((a, b) => a.turn - b.turn)
    .map(item => ({
      ...item,
      answerHtml: renderMarkdown(item.answer),
    }))
})

const pad2num = (value: number) => String(value).padStart(2, '0')

const formatExportTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad2num(date.getMonth() + 1)}-${pad2num(date.getDate())} ${pad2num(date.getHours())}:${pad2num(date.getMinutes())}:${pad2num(date.getSeconds())}`
}

const buildExportStamp = () => {
  const date = new Date()
  return `${date.getFullYear()}${pad2num(date.getMonth() + 1)}${pad2num(date.getDate())}-${pad2num(date.getHours())}${pad2num(date.getMinutes())}${pad2num(date.getSeconds())}`
}

const sanitizeFilenameSegment = (value: string) => {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').trim()
  if (!normalized) return 'task'
  return normalized.slice(0, 48)
}

const buildConversationExportText = () => {
  const turns = conversationTurnViews.value
  if (!turns.length && !showStreamingTurn.value) return ''

  const lines: string[] = []
  lines.push('MAA Log Analyzer - AI Conversation Export')
  lines.push(`导出时间: ${formatExportTime(Date.now())}`)
  lines.push(`任务: ${selectedTaskTitle.value}`)
  lines.push(`日志源: ${sourceLabel.value}`)
  lines.push(`上下文Key: ${currentContextKey.value}`)
  lines.push(`已完成轮数: ${turns.length}`)
  lines.push('')
  lines.push('============================================================')
  lines.push('')

  for (const turn of turns) {
    lines.push(`[第 ${turn.turn} 轮] ${formatExportTime(turn.timestamp)} | ${turn.usedMemory ? '记忆上下文' : '全量上下文'}`)
    lines.push('[用户]')
    lines.push(turn.question || '(空)')
    lines.push('')
    lines.push('[助手]')
    lines.push(turn.answer || '(空)')
    lines.push('')
    lines.push('------------------------------------------------------------')
    lines.push('')
  }

  if (showStreamingTurn.value) {
    lines.push('[进行中轮次]')
    lines.push('[用户]')
    lines.push(activeRoundQuestion.value || '(空)')
    lines.push('')
    lines.push('[助手-流式片段]')
    lines.push(streamingRenderText.value || '(空)')
    lines.push('')
  }

  return lines.join('\n')
}

const handleExportConversation = async () => {
  const content = buildConversationExportText()
  if (!content) {
    message.warning('当前没有可导出的对话内容')
    return
  }

  const task = props.selectedTask
  const taskIdPart = task ? `task-${task.task_id}` : 'task-none'
  const taskNamePart = sanitizeFilenameSegment(task?.entry ?? 'unknown')
  const filename = `ai-conversation-${taskIdPart}-${taskNamePart}-${buildExportStamp()}.txt`
  const ok = await saveFile(content, filename)
  if (ok) {
    message.success('对话导出成功')
  } else {
    message.warning('对话导出已取消')
  }
}

const scrollConversationToBottom = async (behavior: ScrollBehavior = 'auto') => {
  if (!conversationFollowMode.value) return
  await nextTick()
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

  const turnListEl = turnListRef.value
  if (turnListEl) {
    turnListEl.scrollTop = turnListEl.scrollHeight
    if (behavior === 'smooth') {
      turnListEl.scrollTo({ top: turnListEl.scrollHeight, behavior })
    }
  }

  aiOutputScrollbarRef.value?.scrollTo?.({ top: Number.MAX_SAFE_INTEGER, behavior })
}

const waitForUiPaint = async () => {
  await nextTick()
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

const appendUsageNote = (note: string) => {
  const text = note.trim()
  if (!text) return
  if (usageText.value.includes(text)) return
  usageText.value = usageText.value
    ? `${usageText.value} | ${text}`
    : text
}

watch(
  () => [conversationTurnViews.value.length, showStreamingTurn.value, currentContextKey.value],
  () => {
    void scrollConversationToBottom('auto')
  },
  { immediate: true, flush: 'post' }
)

watch(streamingRenderText, () => {
  if (!analyzing.value) return
  void scrollConversationToBottom('auto')
}, { flush: 'post' })

watch(conversationFollowMode, (enabled) => {
  if (!enabled) return
  void scrollConversationToBottom('smooth')
})

const onErrorPreview = computed(() => {
  const selectedTask = props.selectedTask
  if (!selectedTask) {
    return {
      total: 0,
      chains: [] as ReturnType<typeof buildEventChainDiagnostics>['onErrorChains'],
    }
  }

  const diagnostics = buildEventChainDiagnostics(selectedTask.events ?? [])
  return {
    total: diagnostics.onErrorChains.length,
    chains: diagnostics.onErrorChains.slice(0, 8),
  }
})

const anchorPreview = computed(() => {
  const selectedTask = props.selectedTask
  if (!selectedTask) {
    return {
      windowCount: 0,
      unresolvedAnchorLikelyCount: 0,
      failedAfterAnchorResolvedCount: 0,
      summary: '',
      cases: [] as ReturnType<typeof buildAnchorResolutionDiagnostics>['suspiciousCases'],
    }
  }

  const diagnostics = buildAnchorResolutionDiagnostics(selectedTask.events ?? [])
  return {
    windowCount: diagnostics.windowCount,
    unresolvedAnchorLikelyCount: diagnostics.unresolvedAnchorLikelyCount,
    failedAfterAnchorResolvedCount: diagnostics.failedAfterAnchorResolvedCount,
    summary: diagnostics.summary,
    cases: diagnostics.suspiciousCases.slice(0, 8),
  }
})

const jumpBackPreview = computed(() => {
  const selectedTask = props.selectedTask
  if (!selectedTask) {
    return {
      caseCount: 0,
      hitThenReturnedCount: 0,
      hitThenFailedNoReturnCount: 0,
      hitNoReturnObservedCount: 0,
      terminalBounceCount: 0,
      summary: '',
      cases: [] as ReturnType<typeof buildJumpBackFlowDiagnostics>['suspiciousCases'],
    }
  }

  const diagnostics = buildJumpBackFlowDiagnostics(selectedTask.events ?? [])
  return {
    caseCount: diagnostics.caseCount,
    hitThenReturnedCount: diagnostics.hitThenReturnedCount,
    hitThenFailedNoReturnCount: diagnostics.hitThenFailedNoReturnCount,
    hitNoReturnObservedCount: diagnostics.hitNoReturnObservedCount,
    terminalBounceCount: diagnostics.terminalBounceCount,
    summary: diagnostics.summary,
    cases: diagnostics.suspiciousCases.slice(0, 8),
  }
})

const onErrorTriggerTypeLabel = (value: string): string => {
  if (value === 'action_failed') return 'Action 失败触发'
  if (value === 'reco_timeout_or_nohit') return '识别超时/未命中触发'
  if (value === 'error_handling_loop') return 'on_error 循环触发'
  return value
}

const onErrorRiskTagType = (value: string): 'error' | 'warning' | 'success' => {
  if (value === 'high') return 'error'
  if (value === 'medium') return 'warning'
  return 'success'
}

const anchorClassLabel = (value: string): string => {
  if (value === 'unresolved_anchor_candidate_likely') return '疑似锚点未解析'
  if (value === 'failed_after_anchor_resolution') return '已解析但后续失败'
  if (value === 'recovered_or_succeeded') return '未见失败'
  return value
}

const anchorClassTagType = (value: string): 'error' | 'warning' | 'success' | 'default' => {
  if (value === 'unresolved_anchor_candidate_likely') return 'error'
  if (value === 'failed_after_anchor_resolution') return 'warning'
  if (value === 'recovered_or_succeeded') return 'success'
  return 'default'
}

const jumpBackClassLabel = (value: string): string => {
  if (value === 'hit_then_failed_no_return') return '命中后失败且未回跳'
  if (value === 'hit_then_returned') return '命中并回跳'
  if (value === 'hit_no_return_observed') return '命中后未观察到回跳'
  if (value === 'not_hit') return '未命中'
  return value
}

const jumpBackClassTagType = (value: string): 'error' | 'warning' | 'success' | 'default' => {
  if (value === 'hit_then_failed_no_return') return 'error'
  if (value === 'hit_no_return_observed') return 'warning'
  if (value === 'hit_then_returned') return 'success'
  return 'default'
}

const clearApiKey = () => {
  apiKey.value = ''
  setSessionApiKey('')
  message.success('已清空会话 API Key')
}

const clearMemory = () => {
  memoryStateStore.value = {}
  saveSessionMemoryStateStore({})
  conversationTurns.value = []
  saveSessionConversationTurns([])
  lastRequestUsedMemory.value = false
  resultText.value = ''
  activeRoundQuestion.value = ''
  pendingStreamFullText.value = ''
  streamingRenderText.value = ''
  clearStreamFlushTimer()
  message.success('已清空上下文记忆与多轮对话')
}

const clearCurrentTaskMemory = () => {
  const contextKey = currentContextKey.value
  if (!contextKey) return

  const nextStore = { ...memoryStateStore.value }
  delete nextStore[contextKey]
  memoryStateStore.value = nextStore

  conversationTurns.value = conversationTurns.value.filter(item => item.contextKey !== contextKey)
  lastRequestUsedMemory.value = false
  resultText.value = ''
  activeRoundQuestion.value = ''
  pendingStreamFullText.value = ''
  streamingRenderText.value = ''
  clearStreamFlushTimer()
  message.success('已清空当前任务上下文记忆与对话')
}

const ANALYSIS_PROMPT_SOFT_LIMIT = 110000
const ANALYSIS_TIMEOUT_MS = 180000

const getConciseAnswerMaxChars = () => Math.max(800, Math.floor(settings.conciseAnswerMaxChars || 1800))
const getConciseMaxEvidence = () => Math.max(3, Math.floor(settings.conciseMaxEvidence || 6))
const getConciseMaxRootCauses = () => Math.max(2, Math.floor(settings.conciseMaxRootCauses || 2))
const getConciseFixedSteps = () => Math.max(3, Math.floor(settings.conciseFixedSteps || 3))
type AnalysisPromptProfile = 'diagnostic' | 'followup'

const shouldUseDiagnosticTemplateForQuestion = (questionText: string): boolean => {
  const text = questionText.trim()
  if (!text) return false
  return /(分析|诊断|根因|失败原因|排查步骤|复盘|按模板|完整分析|重新分析|结论|证据|on_error|识别热点|成功对比)/.test(text)
}

const getFocusTaskRequirementLines = (focusMode: AnalysisFocusMode): string[] => {
  if (focusMode === 'on_error') {
    return [
      '- 本轮是 on_error 专项：优先输出触发源、触发事件、后续结果（是否恢复/是否任务失败）。',
      '- 证据优先引用 on_error 触发链路与相关回退链，其他证据仅作补充。',
      '- 排查步骤优先 on_error 路径最小修复动作，不展开无关分支。',
    ]
  }
  if (focusMode === 'hotspot') {
    return [
      '- 本轮是识别热点专项：优先输出失败率最高的 3 个识别项及所在节点。',
      '- 必须区分“前段 miss 后恢复”和“整轮无命中并失败/超时”。',
      '- 排查步骤优先模板/阈值/ROI验证与回归指标。',
    ]
  }
  return []
}

const getFocusFollowupRule = (profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode): string => {
  if (focusMode === 'on_error') {
    return '- 本轮仅聚焦 on_error 链路：先答触发源与恢复结果，再给最小修复动作。'
  }
  if (focusMode === 'hotspot') {
    return '- 本轮仅聚焦识别热点：先答 Top 失败项与失败率，再给最小修复动作。'
  }
  return profile === 'diagnostic'
    ? '- 维持“结论/根因候选/证据/排查步骤”结构。'
    : '- 先直接回答追问，再补必要证据与下一步；除非用户明确要求，否则不要套四段诊断模板。'
}

const buildConciseRetryPrompt = (baseContent: string, profile: AnalysisPromptProfile) => {
  const conciseAnswerMaxChars = getConciseAnswerMaxChars()
  const conciseMaxRootCauses = getConciseMaxRootCauses()
  const conciseMaxEvidence = getConciseMaxEvidence()
  const conciseFixedSteps = getConciseFixedSteps()
  if (profile === 'followup') {
    return [
      baseContent,
      '',
      '二次精简输出要求（因上次输出被截断）：',
      `- answer 总长度建议 <= ${conciseAnswerMaxChars} 字符。`,
      '- 先直接回答用户追问，再补必要证据要点（不超过 3 条）。',
      '- 除非用户明确要求，否则不要套四段诊断模板。',
      '- 必须继续保持 JSON 输出格式：{"answer":"...","memory_update":"..."}。',
    ].join('\n')
  }
  return [
    baseContent,
    '',
    '二次精简输出要求（因上次输出被截断）：',
    `- answer 总长度建议 <= ${conciseAnswerMaxChars} 字符。`,
    `- 根因候选最多 ${conciseMaxRootCauses} 条。`,
    `- 证据最多 ${conciseMaxEvidence} 条。`,
    `- 排查步骤固定 ${conciseFixedSteps} 条。`,
    '- 禁止复述完整上下文或长段引用，只保留可执行结论。',
    '- 必须继续保持 JSON 输出格式：{"answer":"...","memory_update":"..."}。',
  ].join('\n')
}

const getSystemPrompt = (profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode = 'general') => {
  const conciseAnswerMaxChars = getConciseAnswerMaxChars()
  const conciseMaxRootCauses = getConciseMaxRootCauses()
  const conciseMaxEvidence = getConciseMaxEvidence()
  const conciseFixedSteps = getConciseFixedSteps()
  if (profile === 'followup') {
    return [
      '你是 MaaFramework 日志追问助手，目标是直接回答当前追问并给出可执行建议。',
      '只能基于给定上下文与会话记忆作答，不允许臆测上下文中不存在的事实。',
      '必须返回 JSON 对象，格式固定为：',
      '{"answer":"...","memory_update":"..."}',
      'answer 必须是 Markdown。',
      '追问场景优先“先答问题，再补依据”，除非用户明确要求，否则不要强制输出“结论/根因候选/证据/排查步骤”四段模板。',
      '若上下文提供 selectedNodeFocus，必须先给“节点级结论”（当前选中节点/流项），再补任务级影响。',
      '识别/动作/任务归属必须以解析顺序为准，不能仅按时间先后推断父子关系。',
      '若上下文提供量化数据，应优先引用关键数字支持判断。',
      '若涉及 on_error / jump_back / nested action 关系，必须明确区分触发源、直接父节点与上游来源节点。',
      '证据描述面向用户可读，禁止输出内部字段路径（例如 timelineDiagnostics.longStayNodes[0]）。',
      `输出长度优先级很高：answer 尽量控制在 ${conciseAnswerMaxChars} 字符以内。`,
      'memory_update 是供下一轮复用的高密度摘要，<= 1200 字。',
      '避免空话：禁止输出“请检查日志”“可能有问题”这类无指向建议。',
    ].join('\n')
  }
  if (focusMode === 'on_error') {
    return [
      '你是 MaaFramework 日志 on_error 链路诊断助手，目标是定位触发源并给出最小修复动作。',
      '只能基于给定上下文作答，不允许臆测上下文中不存在的事实。',
      '必须返回 JSON 对象，格式固定为：',
      '{"answer":"...","memory_update":"..."}',
      'answer 必须是 Markdown，且包含以下 3 段：',
      '## 结论',
      '## on_error 触发链路',
      '## 最小修复步骤',
      '若上下文提供 selectedNodeFocus，结论段先输出当前选中节点/流项的 on_error 判断，再扩展任务级影响。',
      '识别/动作/任务归属必须以解析顺序为准，不能仅按时间先后推断父子关系。',
      '必须明确写出：触发源类型（action_failed / reco_timeout_or_nohit / error_handling_loop）、触发节点、后续结果（是否恢复/是否任务失败）。',
      '若任务最终成功，必须区分“局部失败被恢复”与“任务级失败”。',
      '证据必须给 E1/E2...，每条写“关键数值 + 结论”，禁止输出内部字段路径文本。',
      '排查步骤固定 3 条，每条包含：操作、期望现象、若不符合下一步。',
      `输出长度优先级很高：answer 尽量控制在 ${conciseAnswerMaxChars} 字符以内。`,
      'memory_update 是供下一轮复用的高密度摘要，<= 1200 字。',
      '避免空话：禁止输出“请检查日志”“可能有问题”这类无指向建议。',
    ].join('\n')
  }
  if (focusMode === 'hotspot') {
    return [
      '你是 MaaFramework 识别热点诊断助手，目标是找出最关键热点并给出可验证修复动作。',
      '只能基于给定上下文作答，不允许臆测上下文中不存在的事实。',
      '必须返回 JSON 对象，格式固定为：',
      '{"answer":"...","memory_update":"..."}',
      'answer 必须是 Markdown，且包含以下 3 段：',
      '## 结论',
      '## Top 识别热点',
      '## 验证与修复步骤',
      '若上下文提供 selectedNodeFocus，必须先量化当前选中节点/流项，再给任务级 Top3 热点。',
      '识别/动作/任务归属必须以解析顺序为准，不能仅按时间先后推断父子关系。',
      '必须先量化输出 Top3 识别热点（失败次数、总次数、失败率、所在节点）。',
      '必须区分“前段 miss 后恢复”与“整轮无命中并失败/超时”，不得把前者直接当根因。',
      '证据必须给 E1/E2...，每条写“关键数值 + 结论”，禁止输出内部字段路径文本。',
      '修复步骤固定 3 条，每条包含：操作、期望现象、若不符合下一步。',
      `输出长度优先级很高：answer 尽量控制在 ${conciseAnswerMaxChars} 字符以内。`,
      'memory_update 是供下一轮复用的高密度摘要，<= 1200 字。',
      '避免空话：禁止输出“请检查日志”“可能有问题”这类无指向建议。',
    ].join('\n')
  }
  return [
    '你是 MaaFramework 日志诊断助手，目标是给出“可执行、可验证”的排查结论。',
    '只能基于给定上下文作答，不允许臆测上下文中不存在的事实。',
    '必须返回 JSON 对象，格式固定为：',
    '{"answer":"...","memory_update":"..."}',
    'answer 必须是 Markdown，且包含以下 4 段：',
    '## 结论',
    '## 根因候选（按概率排序）',
    '## 证据',
    '## 排查步骤（可直接执行）',
    '若上下文提供 selectedNodeFocus，必须先输出“当前选中节点/流项”的节点级结论，再扩展到任务级结论。',
    '识别/动作/任务归属必须以解析顺序为准，不能仅按时间先后推断父子关系。',
    '在下结论前，必须先做“量化盘点”：至少引用长停留节点统计与识别失败分布统计。',
    '若存在“确定性结论摘要”，优先基于它构建结论骨架，再补充细节证据。',
    '必须优先区分“流程现象”与“真实失败”：若任务成功且无节点最终失败事件，不得把循环/重试直接当根因。',
    '必须检查事件链诊断：用 on_error 触发链路明确触发源（action_failed / reco_timeout_or_nohit / error_handling_loop）。',
    'action_failed 口径必须包含 Node.Action.Failed、Node.ActionNode.Failed，以及 PipelineNode.Failed 中可判定的隐式动作失败（action_details.success=false）。',
    '若存在 nestedActionDiagnostics，必须联动判断 custom/nested action 失败，不得仅凭主任务 events 中 actionFailed=0 就排除动作失败。',
    '描述 nested/custom action 失败时，必须区分“直接父节点”和“上游 jump_back 来源节点”；若存在 X -> Y，只能写“Y 是直接父节点，X 是上游来源”，禁止把 X 写成直接父节点。',
    '识别问题判定必须以“整轮 next 候选无命中并失败/超时”为主；前几个候选未命中但后续命中恢复，应归类为流程现象而非主因。',
    '必须检查 jump_back 命中后是否出现“回到父节点但命中节点疑似无后继”的复检链路，并评估其对长停留的贡献。',
    '若上下文提供 questionNodeDiagnostics，必须优先回答其中的节点定量数据（出现次数/时长/失败分布/jump_back画像），不能笼统说“数据较少”。',
    '必须区分“现象”和“根因”：ERR 可能是症状，只有与节点停留/重试模式相关联时才能作为主因。',
    '证据必须给 E1/E2...，每条写“证据名称 + 关键数值 + 结论”。',
    '证据段面向用户可读，禁止输出内部字段路径（例如 timelineDiagnostics.longStayNodes[0] 这类文本）。',
    '根因候选至少 2 条，每条包含：置信度(0-100)、关键证据编号、反证点。',
    '排查步骤至少 3 条；每条都要包含：操作、期望现象、若不符合下一步。',
    `输出长度优先级很高：answer 尽量控制在 ${conciseAnswerMaxChars} 字符以内。`,
    `根因候选不超过 ${conciseMaxRootCauses} 条，证据不超过 ${conciseMaxEvidence} 条，排查步骤固定 ${conciseFixedSteps} 条。`,
    '如果证据不足，不能只说“证据不足”；仍需给低置信度候选 + 最小验证步骤。',
    'memory_update 是供下一轮复用的高密度摘要，<= 1200 字，保留任务状态、关键证据、未决问题。',
    '避免空话：禁止输出“请检查日志”“可能有问题”这类无指向建议。',
  ].join('\n')
}

const toObjectArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []

const buildCompactContext = (context: Record<string, unknown>): Record<string, unknown> => {
  const timelineDiagnostics = (context.timelineDiagnostics as Record<string, unknown> | undefined) ?? {}
  const deterministicFindings = (context.deterministicFindings as Record<string, unknown> | undefined) ?? {}
  const eventChainDiagnosticsRaw = (context.eventChainDiagnostics as Record<string, unknown> | undefined) ?? {}
  const stopTerminationDiagnosticsRaw = (context.stopTerminationDiagnostics as Record<string, unknown> | undefined) ?? {}
  const nextCandidateAvailabilityDiagnosticsRaw = (context.nextCandidateAvailabilityDiagnostics as Record<string, unknown> | undefined) ?? {}
  const anchorResolutionDiagnosticsRaw = (context.anchorResolutionDiagnostics as Record<string, unknown> | undefined) ?? {}
  const jumpBackFlowDiagnosticsRaw = (context.jumpBackFlowDiagnostics as Record<string, unknown> | undefined) ?? {}
  const nestedActionDiagnosticsRaw = (context.nestedActionDiagnostics as Record<string, unknown> | undefined) ?? {}
  const selectedNodeFocusRaw = (context.selectedNodeFocus as Record<string, unknown> | null | undefined) ?? null

  const selectedNodeTimeline = toObjectArray(context.selectedNodeTimeline)
    .slice(-40)
    .map(node => ({
      ...node,
      recognition: toObjectArray(node.recognition).slice(0, 12),
      next_list: toObjectArray(node.next_list).slice(0, 8),
    }))

  const signalLines = (() => {
    const raw = context.signalLines as Record<string, unknown> | null | undefined
    if (!raw || typeof raw !== 'object') return raw ?? null
    return {
      ...raw,
      lines: toObjectArray(raw.lines).slice(0, 60),
    }
  })()

  const eventChainDiagnostics = {
    ...eventChainDiagnosticsRaw,
    onErrorChains: toObjectArray(eventChainDiagnosticsRaw.onErrorChains)
      .slice(0, 8)
      .map(chain => ({
        ...chain,
        steps: toObjectArray(chain.steps).slice(0, 6),
        fallbackListPreview: Array.isArray(chain.fallbackListPreview)
          ? (chain.fallbackListPreview as unknown[]).slice(0, 4)
          : [],
      })),
    nextRecognitionChains: toObjectArray(eventChainDiagnosticsRaw.nextRecognitionChains)
      .slice(0, 8)
      .map(chain => ({
        ...chain,
        steps: toObjectArray(chain.steps).slice(0, 6),
        nextCandidates: toObjectArray(chain.nextCandidates).slice(0, 6),
      })),
    actionFailureChains: toObjectArray(eventChainDiagnosticsRaw.actionFailureChains)
      .slice(0, 6)
      .map(chain => ({
        ...chain,
        steps: toObjectArray(chain.steps).slice(0, 6),
      })),
  }

  const stopTerminationDiagnostics = {
    ...stopTerminationDiagnosticsRaw,
    stopSignals: toObjectArray(stopTerminationDiagnosticsRaw.stopSignals).slice(0, 6),
  }

  const nextCandidateAvailabilityDiagnostics = {
    ...nextCandidateAvailabilityDiagnosticsRaw,
    noHitFailureByNode: toObjectArray(nextCandidateAvailabilityDiagnosticsRaw.noHitFailureByNode).slice(0, 6),
    partialMissRecoveredByNode: toObjectArray(nextCandidateAvailabilityDiagnosticsRaw.partialMissRecoveredByNode).slice(0, 6),
    suspiciousCases: toObjectArray(nextCandidateAvailabilityDiagnosticsRaw.suspiciousCases)
      .slice(0, 6)
      .map(item => ({
        ...item,
        steps: toObjectArray(item.steps).slice(0, 4),
      })),
  }

  const anchorResolutionDiagnostics = {
    ...anchorResolutionDiagnosticsRaw,
    suspiciousCases: toObjectArray(anchorResolutionDiagnosticsRaw.suspiciousCases)
      .slice(0, 6)
      .map(item => ({
        ...item,
        steps: toObjectArray(item.steps).slice(0, 4),
      })),
  }

  const jumpBackFlowDiagnostics = {
    ...jumpBackFlowDiagnosticsRaw,
    terminalBounceCases: toObjectArray(jumpBackFlowDiagnosticsRaw.terminalBounceCases).slice(0, 6),
    pairStats: toObjectArray(jumpBackFlowDiagnosticsRaw.pairStats).slice(0, 8),
    suspiciousCases: toObjectArray(jumpBackFlowDiagnosticsRaw.suspiciousCases)
      .slice(0, 6)
      .map(item => ({
        ...item,
        steps: toObjectArray(item.steps).slice(0, 4),
      })),
  }

  const nestedActionDiagnostics = {
    ...nestedActionDiagnosticsRaw,
    topParentNodes: toObjectArray(nestedActionDiagnosticsRaw.topParentNodes).slice(0, 6),
  }

  const selectedNodeFocus = (() => {
    if (!selectedNodeFocusRaw || typeof selectedNodeFocusRaw !== 'object') return selectedNodeFocusRaw ?? null
    const nodeRaw = (selectedNodeFocusRaw.node as Record<string, unknown> | undefined) ?? {}
    const selectedFlowItemRaw = (selectedNodeFocusRaw.selectedFlowItem as Record<string, unknown> | null | undefined) ?? null
    return {
      ...selectedNodeFocusRaw,
      node: {
        ...nodeRaw,
        nextListPreview: toObjectArray(nodeRaw.nextListPreview).slice(0, 6),
        topRecognitionNames: toObjectArray(nodeRaw.topRecognitionNames).slice(0, 6),
        topNestedRecognitionNames: toObjectArray(nodeRaw.topNestedRecognitionNames).slice(0, 6),
        topNestedActionNames: toObjectArray(nodeRaw.topNestedActionNames).slice(0, 6),
      },
      selectedFlowItem: selectedFlowItemRaw
        ? {
            ...selectedFlowItemRaw,
            ancestry: toObjectArray(selectedFlowItemRaw.ancestry).slice(0, 8),
          }
        : selectedFlowItemRaw,
    }
  })()

  return {
    ...context,
    selectedNodeFocus,
    taskOverview: toObjectArray(context.taskOverview).slice(-10),
    selectedNodeTimeline,
    selectedEventTail: toObjectArray(context.selectedEventTail).slice(-20),
    failureCandidates: toObjectArray(context.failureCandidates).slice(0, 24),
    timelineDiagnostics: {
      ...timelineDiagnostics,
      longStayNodes: toObjectArray(timelineDiagnostics.longStayNodes).slice(0, 8),
      recoFailuresByName: toObjectArray(timelineDiagnostics.recoFailuresByName).slice(0, 12),
      repeatedRuns: toObjectArray(timelineDiagnostics.repeatedRuns).slice(0, 8),
      hotspotRecoPairs: toObjectArray(timelineDiagnostics.hotspotRecoPairs).slice(0, 10),
    },
    deterministicFindings: {
      ...deterministicFindings,
      findings: toObjectArray(deterministicFindings.findings).slice(0, 6),
      unknowns: Array.isArray(deterministicFindings.unknowns)
        ? (deterministicFindings.unknowns as unknown[]).slice(0, 4)
        : [],
    },
    signalLines,
    eventChainDiagnostics,
    stopTerminationDiagnostics,
    nextCandidateAvailabilityDiagnostics,
    anchorResolutionDiagnostics,
    jumpBackFlowDiagnostics,
    nestedActionDiagnostics,
    questionNodeDiagnostics: toObjectArray(context.questionNodeDiagnostics)
      .slice(0, 6)
      .map(item => ({
        ...item,
        topFailedRecognition: toObjectArray(item.topFailedRecognition).slice(0, 6),
        jumpBackCandidates: toObjectArray(item.jumpBackCandidates).slice(0, 6),
        actionKinds: toObjectArray(item.actionKinds).slice(0, 4),
      })),
    knowledge: toObjectArray(context.knowledge).slice(0, 16),
  }
}

const buildFullContextPrompt = (compact: boolean, minifiedJson = false, focusMode: AnalysisFocusMode = 'general') => {
  const rawContext = buildAiAnalysisContext({
    tasks: props.tasks,
    selectedTask: props.selectedTask,
    selectedNode: effectiveSelectedNode.value,
    selectedFlowItemId: effectiveSelectedFlowItemId.value,
    question: question.value,
    loadedTargets: props.loadedTargets,
    loadedDefaultTargetId: props.loadedDefaultTargetId,
    includeKnowledgePack: settings.includeKnowledgePack,
    includeKnowledgeBootstrap: true,
    includeSignalLines: settings.includeSignalLines,
  })
  const context = compact ? buildCompactContext(rawContext) : rawContext
  const contextText = minifiedJson
    ? JSON.stringify(context)
    : JSON.stringify(context, null, 2)

  return [
    compact
      ? '这是首轮或上下文变化后的分析。由于上下文较大，本轮启用压缩上下文；结论仍必须绑定明确字段证据。'
      : '这是首轮或上下文变化后的分析，必须先盘点证据再给结论。若开启知识包，本轮包含全量知识卡片。',
    `用户问题: ${question.value}`,
    '',
    '任务要求:',
    ...getFocusTaskRequirementLines(focusMode),
    '- 先列证据清单(E1/E2...)，再给结论。',
    '- 必须先量化长时间停留节点（使用时间线长停留统计数据）。',
    '- 必须检查识别热点（使用识别失败分布与热点组合统计数据）。',
    '- 必须检查 on_error 触发链路，明确 on_error 的触发源与后续结果。',
    '- action_failed 判定要覆盖 ActionNode.Failed 与 PipelineNode.Failed(implicit action failure)，不能只看 Action.Failed。',
    '- 若存在 nested action 诊断，必须合并判断 custom/nested action 失败热点。',
    '- 识别问题只在“整轮 next list 无命中并失败/超时”时判定为异常；前段 miss 后命中恢复不应直接定为根因。',
    '- 必须检查停止链路诊断与 next 候选可执行性诊断，区分主动停止、无可执行候选与超时未命中。',
    '- 必须检查 anchor 解析诊断与 jump_back 回跳诊断，区分锚点未解析、回跳命中后未回跳等控制流语义。',
    '- 必须额外检查 jump_back 命中后“回到父节点但命中节点疑似无后继”的复检链路，判断其是否导致长停留。',
    '- 若存在 questionNodeDiagnostics，先输出该节点的定量数据，再给结论。',
    '- 若存在 selectedNodeFocus，必须先做节点级结论（当前选中节点/流项），再给任务级结论。',
    '- 识别/动作/任务归属必须采用解析顺序规则，禁止只按时间先后推断。',
    '- 仅把 next 识别链路 / 动作失败链路作为补充证据，不可替代 on_error 触发链路。',
    '- 若存在确定性结论摘要，至少引用其中 1 条并映射到 E 证据编号。',
    '- 输出面向用户可读，禁止出现 timelineDiagnostics.xxx 这类字段路径文本。',
    '- 给出至少2个根因候选并排序。',
    '- 排查步骤必须可执行且可验证。',
    '',
    '完整上下文 JSON:',
    contextText,
  ].join('\n')
}

const buildMemoryPrompt = (memory: MemoryState, profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode = 'general') => {
  const followupRule = getFocusFollowupRule(profile, focusMode)
  return [
    '这是同一上下文下的追问。优先基于已有记忆回答。',
    `用户追问: ${question.value}`,
    '',
    `上下文指纹: ${memory.contextKey}`,
    '追问要求:',
    '- 若新问题未覆盖已知矛盾，优先处理未决风险。',
    '- 继续引用已有证据与关键数值，保持用户可读，不输出内部字段路径。',
    followupRule,
    '',
    '会话记忆:',
    memory.summary,
  ].join('\n')
}

const buildFallbackMemory = (answer: string, questionText: string): string => {
  const compact = answer.replace(/\s+/g, ' ').trim()
  const capped = compact.length > 900 ? `${compact.slice(0, 900)}...` : compact
  return `最近问题: ${questionText}\n最近结论: ${capped}`
}

const AUTO_REPAIR_TIMEOUT_MS = 45000

const nodeTokenRegex = /[A-Za-z][A-Za-z0-9_]*/g

const uniqueTokens = (items: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const token = item.trim()
    if (!token) continue
    if (seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

const extractNodeTokenAfterKeyword = (text: string, keyword: string): string[] => {
  const out: string[] = []
  let from = 0
  while (from < text.length) {
    const index = text.indexOf(keyword, from)
    if (index < 0) break
    const tail = text.slice(index + keyword.length, Math.min(text.length, index + keyword.length + 96))
    const tokenMatch = tail.match(nodeTokenRegex)
    if (tokenMatch?.length) out.push(tokenMatch[0])
    from = index + keyword.length
  }
  return uniqueTokens(out)
}

const detectParentRelationConflict = (answer: string): ParentRelationConflictIssue | null => {
  if (!answer.trim()) return null

  const directParents = extractNodeTokenAfterKeyword(answer, '直接父节点')
  if (!directParents.length) return null

  const upstreamChains: Array<{ from: string; to: string }> = []
  const chainRegex = /([A-Za-z][A-Za-z0-9_]*)\s*->\s*([A-Za-z][A-Za-z0-9_]*)/g
  let match: RegExpExecArray | null
  while ((match = chainRegex.exec(answer)) !== null) {
    const from = match[1] ?? ''
    const to = match[2] ?? ''
    if (!from || !to) continue
    const start = Math.max(0, match.index - 24)
    const end = Math.min(answer.length, chainRegex.lastIndex + 24)
    const around = answer.slice(start, end)
    if (!/(上游|来源|jump_back|回跳)/i.test(around)) continue
    upstreamChains.push({ from, to })
  }

  const directSet = new Set(directParents)
  if (directSet.size > 1) {
    return {
      directParents: Array.from(directSet),
      upstreamChains,
      reason: `检测到多个“直接父节点”表述：${Array.from(directSet).join(', ')}`,
    }
  }

  for (const chain of upstreamChains) {
    if (directSet.has(chain.from) && !directSet.has(chain.to)) {
      return {
        directParents: Array.from(directSet),
        upstreamChains,
        reason: `上游链路 ${chain.from} -> ${chain.to} 与“直接父节点=${chain.from}”冲突`,
      }
    }
  }

  return null
}

const collectParentRelationFacts = (task: TaskInfo | null): ParentRelationFacts | null => {
  if (!task) return null

  const parentFailedCount = new Map<string, number>()
  const resolveDirectParentName = (node: TaskInfo['nodes'][number]): string => {
    const actionName = typeof node.action_details?.name === 'string' ? node.action_details.name.trim() : ''
    if (actionName) return actionName
    const actionKind = typeof node.action_details?.action === 'string' ? node.action_details.action.trim() : ''
    if (actionKind) return actionKind
    return node.name?.trim() || 'unknown'
  }

  for (const node of task.nodes) {
    const groups = node.nested_action_nodes ?? []
    if (!groups.length) continue
    let hasFailed = false
    for (const group of groups) {
      if (group.status === 'failed') hasFailed = true
      for (const action of group.nested_actions ?? []) {
        if (action.status === 'failed') hasFailed = true
      }
    }
    if (!hasFailed) continue
    const parent = resolveDirectParentName(node)
    parentFailedCount.set(parent, (parentFailedCount.get(parent) ?? 0) + 1)
  }

  const directParentCandidates = Array.from(parentFailedCount.entries())
    .map(([name, failedCount]) => ({ name, failedCount }))
    .sort((a, b) => b.failedCount - a.failedCount)
    .slice(0, 6)

  const parentSet = new Set(directParentCandidates.map(item => item.name))
  const jumpBack = buildJumpBackFlowDiagnostics(task.events ?? [])
  const rawPairStats = Array.isArray(jumpBack.pairStats) ? jumpBack.pairStats : []
  const upstreamChains = rawPairStats
    .map(item => ({
      from: typeof item.startNode === 'string' ? item.startNode : '',
      to: typeof item.hitCandidate === 'string' ? item.hitCandidate : '',
      hitCount: typeof item.totalHitCount === 'number' ? item.totalHitCount : 0,
      terminalBounceCount: typeof item.terminalBounceCount === 'number' ? item.terminalBounceCount : 0,
    }))
    .filter(item => item.from && item.to && item.hitCount > 0 && parentSet.has(item.to))
    .sort((a, b) => {
      if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount
      return b.terminalBounceCount - a.terminalBounceCount
    })
    .slice(0, 8)

  return { directParentCandidates, upstreamChains }
}

const repairStructuredOutput = async (
  rawOutput: string,
  key: string,
  onUsage?: (resp: ChatCompletionResult) => void
): Promise<StructuredAiOutput | null> => {
  const trimmed = rawOutput.trim()
  if (!trimmed) return null

  const capped = trimmed.length > 24000
    ? `${trimmed.slice(0, 24000)}\n...(truncated)...`
    : trimmed

  const repair = await requestChatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: key,
    model: settings.model,
    temperature: 0,
    maxTokens: 1600,
    stream: false,
    responseFormatJson: true,
    retryOnLength: false,
    maxNetworkRetries: 1,
    timeoutMs: AUTO_REPAIR_TIMEOUT_MS,
    messages: [
      {
        role: 'system',
        content: [
          '你是 JSON 修复器。',
          '只输出一个 JSON 对象，格式必须为 {"answer":"...","memory_update":"..."}。',
          '禁止输出 Markdown 代码块、解释说明、额外字段。',
          '若原文缺失 memory_update，请给出简洁摘要。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `请将以下文本修复为目标 JSON：\n${capped}`,
      },
    ],
  })
  onUsage?.(repair)
  const parsed = tryParseStructuredOutput(repair.text)
  if (!parsed) {
    const preview = repair.text.trim().slice(0, 120).replace(/\s+/g, ' ')
    throw new Error(`修复响应不可解析（length=${repair.text.trim().length}, preview="${preview}"）`)
  }
  return parsed
}

const repairParentRelationConsistency = async (
  current: StructuredAiOutput,
  key: string,
  issue: ParentRelationConflictIssue,
  facts: ParentRelationFacts | null,
  onUsage?: (resp: ChatCompletionResult) => void
): Promise<StructuredAiOutput | null> => {
  const answerSource = current.answer.trim()
  const memorySource = (current.memory_update ?? '').trim()
  const cappedAnswer = answerSource.length > 20000
    ? `${answerSource.slice(0, 20000)}\n...(truncated)...`
    : answerSource
  const cappedMemory = memorySource.length > 3000
    ? `${memorySource.slice(0, 3000)}...(truncated)...`
    : memorySource

  const repair = await requestChatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: key,
    model: settings.model,
    temperature: 0,
    maxTokens: 1600,
    stream: false,
    responseFormatJson: true,
    retryOnLength: false,
    maxNetworkRetries: 1,
    timeoutMs: AUTO_REPAIR_TIMEOUT_MS,
    messages: [
      {
        role: 'system',
        content: [
          '你是术语一致性修复器。',
          '只修正 answer 中“直接父节点”和“上游来源节点”表述冲突，不改动其余结论结构。',
          '禁止新增不存在的节点或数字，禁止删掉四段结构与证据编号。',
          '规则：',
          '- “直接父节点”只能写 nested/custom action 的直接承载节点。',
          '- “上游来源节点”只能写 jump_back 来源，不得写成直接父节点。',
          '- 若出现 X -> Y，则 Y 才可作为直接父节点，X 只能是上游来源。',
          '仅输出 JSON：{"answer":"...","memory_update":"..."}，不得输出解释。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `冲突原因：${issue.reason}`,
          `检测到的直接父节点：${issue.directParents.join(', ') || 'none'}`,
          `检测到的上游链路：${issue.upstreamChains.map(item => `${item.from}->${item.to}`).join(', ') || 'none'}`,
          '',
          '事实卡片（用于裁决，优先级最高）：',
          JSON.stringify(facts ?? {}, null, 2),
          '',
          '原 answer（请仅做术语关系修正，保持四段结构与编号）：',
          cappedAnswer,
          '',
          '原 memory_update（可按需最小修改）：',
          cappedMemory,
        ].join('\n'),
      },
    ],
  })
  onUsage?.(repair)
  const parsed = tryParseStructuredOutput(repair.text)
  if (!parsed) {
    const preview = repair.text.trim().slice(0, 120).replace(/\s+/g, ' ')
    throw new Error(`术语修正响应不可解析（length=${repair.text.trim().length}, preview="${preview}"）`)
  }
  return parsed
}

const getNextConversationTurn = (contextKey: string): number => {
  let maxTurn = 0
  for (const item of conversationTurns.value) {
    if (item.contextKey !== contextKey) continue
    if (item.turn > maxTurn) maxTurn = item.turn
  }
  return maxTurn + 1
}

const isLikelyPayloadTooLargeError = (msg: string): boolean =>
  /(context|token|length|too\s*long|maximum context|request too large|payload|invalid_request|无法加载返回数据|返回数据)/i.test(msg)

const runRequest = async (mode: 'test' | 'analyze') => {
  const key = apiKey.value.trim()
  if (!key) {
    message.warning('请先输入 API Key')
    return
  }
  const questionSnapshot = question.value.trim() || '（空问题）'

  if (mode === 'analyze' && !props.selectedTask) {
    message.warning('请先在日志分析页面选择一个任务')
    return
  }

  const contextKey = currentContextKey.value
  const contextMemory = memoryStateStore.value[contextKey]
  const useMemoryForThisRound = mode === 'analyze' && memoryModeEnabled.value && !!contextMemory
  const forcedProfile = mode === 'analyze' ? quickPromptProfileOverride.value : null
  const forcedFocus = mode === 'analyze' ? quickPromptFocusOverride.value : null
  const focusMode: AnalysisFocusMode = forcedFocus ?? 'general'
  const promptProfile: AnalysisPromptProfile = mode !== 'analyze'
    ? 'diagnostic'
    : (forcedProfile ?? (useMemoryForThisRound && !shouldUseDiagnosticTemplateForQuestion(questionSnapshot) ? 'followup' : 'diagnostic'))
  if (mode === 'analyze') {
    quickPromptProfileOverride.value = null
    quickPromptFocusOverride.value = null
  }
  lastRequestUsedMemory.value = useMemoryForThisRound
  if (mode === 'analyze') {
    activeRoundQuestion.value = questionSnapshot
    resultText.value = ''
    pendingStreamFullText.value = ''
    streamingRenderText.value = ''
    clearStreamFlushTimer()
    usageText.value = 'AI 正在处理请求...'
    analyzingStage.value = 'streaming'
  }

  let usedCompactContext = false
  let userContent = ''
  if (mode === 'test') {
    userContent = '请只输出：连接正常'
  } else if (useMemoryForThisRound) {
    userContent = buildMemoryPrompt(contextMemory as MemoryState, promptProfile, focusMode)
  } else {
    const fullPrompt = buildFullContextPrompt(false, false, focusMode)
    if (fullPrompt.length > ANALYSIS_PROMPT_SOFT_LIMIT) {
      usedCompactContext = true
      const compactPrompt = buildFullContextPrompt(true, false, focusMode)
      userContent = compactPrompt.length > ANALYSIS_PROMPT_SOFT_LIMIT
        ? buildFullContextPrompt(true, true, focusMode)
        : compactPrompt
    } else {
      userContent = fullPrompt
    }
  }

  const sendRequest = (content: string) => requestChatCompletion({
    baseUrl: settings.baseUrl,
    apiKey: key,
    model: settings.model,
    temperature: mode === 'test' ? 0 : settings.temperature,
    maxTokens: mode === 'test'
      ? 256
      : settings.maxTokens,
    stream: mode === 'analyze' ? settings.streamResponse : false,
    responseFormatJson: mode === 'analyze',
    retryOnLength: mode === 'analyze' && settings.maxTokensAuto,
    maxNetworkRetries: mode === 'analyze' ? 2 : 1,
    onDelta: mode === 'analyze' && settings.streamResponse
      ? (_deltaText: string, fullText: string) => {
          pendingStreamFullText.value = fullText
          flushStreamingText(false)
          usageText.value = 'AI 正在流式输出...'
        }
      : undefined,
    timeoutMs: mode === 'test' ? 15000 : ANALYSIS_TIMEOUT_MS,
    messages: [
      { role: 'system', content: getSystemPrompt(promptProfile, focusMode) },
      { role: 'user', content },
    ],
  })

  const roundTokenUsage = makeTokenUsageAccumulator()
  const trackRoundTokenUsage = (resp: ChatCompletionResult) => {
    roundTokenUsage.requestCount += 1
    if (resp.usage?.promptTokens != null) roundTokenUsage.prompt += resp.usage.promptTokens
    if (resp.usage?.completionTokens != null) roundTokenUsage.completion += resp.usage.completionTokens
    if (resp.usage?.totalTokens != null) {
      roundTokenUsage.total += resp.usage.totalTokens
    } else if (resp.usage?.promptTokens != null || resp.usage?.completionTokens != null) {
      roundTokenUsage.total += (resp.usage.promptTokens ?? 0) + (resp.usage.completionTokens ?? 0)
    }
  }

  const sendRequestTracked = async (content: string) => {
    const resp = await sendRequest(content)
    trackRoundTokenUsage(resp)
    return resp
  }

  let response: ChatCompletionResult
  try {
    response = await sendRequestTracked(userContent)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const shouldRetryCompact = mode === 'analyze' && !useMemoryForThisRound && !usedCompactContext && isLikelyPayloadTooLargeError(msg)
    if (!shouldRetryCompact) throw error

    usedCompactContext = true
    message.warning('分析上下文较大，已自动切换压缩上下文重试一次')
    const compactPrompt = buildFullContextPrompt(true, false, focusMode)
    response = await sendRequestTracked(
      compactPrompt.length > ANALYSIS_PROMPT_SOFT_LIMIT
        ? buildFullContextPrompt(true, true, focusMode)
        : compactPrompt
    )
  }

  const usageModeText = mode === 'analyze'
    ? (() => {
      const scope = useMemoryForThisRound ? '记忆上下文' : (usedCompactContext ? '压缩全量上下文' : '全量上下文')
      const profileLabel = promptProfile === 'followup' ? '追问模板' : '诊断模板'
      const focusLabel = focusMode === 'on_error'
        ? 'on_error专项'
        : focusMode === 'hotspot'
          ? '识别热点专项'
          : ''
      const nodeFocusLabel = selectedNodeFocusEnabled.value
        ? (effectiveSelectedNode.value ? '节点焦点' : '任务级(未选节点)')
        : '任务级(焦点关闭)'
      const base = focusLabel ? `${scope} · ${profileLabel} · ${focusLabel}` : `${scope} · ${profileLabel}`
      return `${base} · ${nodeFocusLabel}`
    })()
    : '连接测试'
  const buildTokenStatsSuffix = () => {
    if (mode !== 'analyze') return ''
    const contextTotal = sumContextTokenUsage(contextKey, roundTokenUsage)
    if (roundTokenUsage.requestCount <= 0 && contextTotal.requestCount <= 0) return ''
    return ` | 本轮 ${roundTokenUsage.total}T/${roundTokenUsage.requestCount}次` +
      ` | 累计 ${contextTotal.total}T/${contextTotal.requestCount}次`
  }
  const updateUsageText = (resp: typeof response, extra = '') => {
    if (mode === 'analyze') {
      usageText.value = `${usageModeText}${extra}${buildTokenStatsSuffix()}`
      return
    }
    if (resp.usage?.totalTokens != null) {
      usageText.value = `Token ${resp.usage.totalTokens} (P ${resp.usage.promptTokens ?? '-'} / C ${resp.usage.completionTokens ?? '-'}) | ${usageModeText}${extra}${buildTokenStatsSuffix()}`
    } else {
      usageText.value = `上下文模式: ${usageModeText}${extra}${buildTokenStatsSuffix()}`
    }
  }
  const markPostprocess = () => {
    if (mode !== 'analyze') return
    analyzingStage.value = 'postprocess'
    if (!usageText.value.includes('后处理中')) {
      usageText.value = `${usageText.value} | 后处理中`
    }
  }
  updateUsageText(response)
  if (mode === 'analyze') {
    pendingStreamFullText.value = response.text
    flushStreamingText(true)
  }
  let outputTruncated = response.finishReason === 'length'

  if (mode === 'analyze' && outputTruncated && settings.truncateAutoRetryEnabled) {
      message.warning('检测到输出被截断，已自动发起一次精简重试。')
      await waitForUiPaint()
      try {
      const conciseBase = (() => {
        if (useMemoryForThisRound) {
          return buildMemoryPrompt(contextMemory as MemoryState, promptProfile, focusMode)
        }
        const compactPrompt = buildFullContextPrompt(true, false, focusMode)
        return compactPrompt.length > ANALYSIS_PROMPT_SOFT_LIMIT
          ? buildFullContextPrompt(true, true, focusMode)
          : compactPrompt
      })()
      const concisePrompt = buildConciseRetryPrompt(conciseBase, promptProfile)
      response = await sendRequestTracked(concisePrompt)
      updateUsageText(response, ' | 精简重试')
      pendingStreamFullText.value = response.text
      flushStreamingText(true)
      outputTruncated = response.finishReason === 'length'
      if (outputTruncated) {
        usageText.value = `${usageText.value} | 仍截断`
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      message.warning(`精简重试失败，保留截断结果：${msg}`)
      usageText.value = `${usageText.value} | 输出截断`
    }
  } else if (mode === 'analyze' && outputTruncated && !settings.truncateAutoRetryEnabled) {
    usageText.value = `${usageText.value} | 输出截断`
  } else if (outputTruncated) {
    usageText.value = `${usageText.value} | 输出截断`
  }

  if (mode === 'test') {
    resultText.value = response.text
    return
  }

  if (outputTruncated) {
    message.warning('模型输出仍被截断，请继续缩小范围或拆分问题后重试。')
  }

  let parsed = tryParseStructuredOutput(response.text)
  if (!parsed && !outputTruncated) {
    markPostprocess()
    appendUsageNote('检测到非JSON，修复中')
    message.info('检测到返回不是标准 JSON，正在自动修复...')
    await waitForUiPaint()
    try {
      parsed = await repairStructuredOutput(response.text, key, trackRoundTokenUsage)
      updateUsageText(response, ' | JSON修复')
      if (parsed) {
        message.warning('模型原始输出不是标准 JSON，已自动修复后继续。')
        await waitForUiPaint()
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn('[AI][structured-repair] failed:', error)
      appendUsageNote('JSON修复失败')
      message.warning(`JSON 自动修复失败：${msg}`)
      await waitForUiPaint()
    }
  }

  if (parsed && !outputTruncated) {
    const conflictIssue = detectParentRelationConflict(parsed.answer)
    if (conflictIssue) {
      const relationFacts = collectParentRelationFacts(props.selectedTask)
      markPostprocess()
      appendUsageNote('检测到术语冲突，修正中')
      message.info('检测到“直接父节点/上游来源”术语冲突，正在自动修正...')
      await waitForUiPaint()
      try {
        const repaired = await repairParentRelationConsistency(parsed, key, conflictIssue, relationFacts, trackRoundTokenUsage)
        updateUsageText(response, ' | 术语修正')
        if (repaired) {
          parsed = repaired
          message.warning('检测到“直接父节点/上游来源”术语冲突，已自动修正。')
          await waitForUiPaint()
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn('[AI][parent-relation-repair] failed:', error)
        appendUsageNote('术语修正失败')
        message.warning(`术语修正请求失败：${msg}`)
        await waitForUiPaint()
      }

      const stillConflict = detectParentRelationConflict(parsed.answer)
      if (stillConflict) {
        message.warning(`检测到术语冲突，远程修正未生效：${stillConflict.reason}`)
        await waitForUiPaint()
      }
    }
  }

  const answerTextRaw = parsed?.answer?.trim() || response.text
  const answerText = sanitizeAnswerForUser(answerTextRaw)
  resultText.value = answerText

  if (mode === 'analyze') {
    const nextTurn = getNextConversationTurn(contextKey)
    const nextTurnItem: ConversationTurn = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      turn: nextTurn,
      contextKey,
      question: clipForStorage(questionSnapshot, CONVERSATION_QUESTION_MAX_CHARS),
      answer: clipForStorage(answerText, CONVERSATION_ANSWER_MAX_CHARS),
      usedMemory: useMemoryForThisRound,
      timestamp: Date.now(),
      roundPromptTokens: roundTokenUsage.prompt,
      roundCompletionTokens: roundTokenUsage.completion,
      roundTotalTokens: roundTokenUsage.total,
      roundRequestCount: roundTokenUsage.requestCount,
    }
    const sameContextTurns = conversationTurns.value
      .filter(item => item.contextKey === contextKey)
      .concat(nextTurnItem)
      .sort((a, b) => a.turn - b.turn)
      .slice(-CONVERSATION_MAX_TURNS)
    const otherContextTurns = conversationTurns.value.filter(item => item.contextKey !== contextKey)
    conversationTurns.value = [...otherContextTurns, ...sameContextTurns]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-CONVERSATION_MAX_TOTAL_TURNS)
  }

  if (!memoryModeEnabled.value || outputTruncated) return

  const nextMemorySummary = parsed?.memory_update?.trim() || buildFallbackMemory(answerText, question.value)
  const prevMemory = memoryStateStore.value[contextKey]
  const nextTurns = (prevMemory?.turns ?? 0) + 1
  const mergedSummary = appendMemorySummary(prevMemory?.summary ?? '', nextMemorySummary, nextTurns)

  const nextState: MemoryState = {
    summary: mergedSummary,
    contextKey,
    turns: nextTurns,
    updatedAt: Date.now(),
  }
  const nextEntries = Object.entries({
    ...memoryStateStore.value,
    [contextKey]: nextState,
  })
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, MEMORY_STORE_MAX_CONTEXTS)
  memoryStateStore.value = Object.fromEntries(nextEntries)
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
  analyzingStage.value = 'streaming'
  try {
    await runRequest('analyze')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    message.error(`AI 分析失败: ${msg}`)
  } finally {
    analyzing.value = false
    analyzingStage.value = 'idle'
    activeRoundQuestion.value = ''
    pendingStreamFullText.value = ''
    streamingRenderText.value = ''
    clearStreamFlushTimer()
  }
}
</script>

<template>
  <div class="ai-view-root">
    <div class="ai-view-grid">
      <n-card size="small" title="连接与输入" class="ai-left-card" data-tour="ai-input-panel">
        <div class="left-panel-shell">
          <n-flex vertical style="gap: 12px" class="left-panel-content">
          <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
            <n-text depth="3" style="font-size: 12px">API Key（会话内）</n-text>
            <n-button text size="tiny" @click="showApiKeyHint = !showApiKeyHint">
              {{ showApiKeyHint ? '隐藏说明' : '显示说明' }}
            </n-button>
          </n-flex>
          <n-text v-if="showApiKeyHint" depth="3" style="font-size: 12px">
            纯前端 BYOK 模式：API Key 仅保存到当前会话，不写入本地长期存储。
          </n-text>

          <n-input
            v-model:value="apiKey"
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
                <n-button text size="tiny" @click="globalSettingsCollapsed = !globalSettingsCollapsed">
                  {{ globalSettingsCollapsed ? '展开' : '收起' }}
                </n-button>
              </n-flex>

              <n-text depth="3" style="font-size: 12px">
                {{ settings.model }} · {{ settings.maxTokens }} tokens · {{ settings.streamResponse ? '流式开' : '流式关' }}
              </n-text>

              <template v-if="!globalSettingsCollapsed">
                <n-text depth="3" style="font-size: 12px">
                  Base URL：{{ settings.baseUrl }}
                </n-text>
                <n-text depth="3" style="font-size: 12px">
                  模型：{{ settings.model }} · 温度：{{ settings.temperature }}
                </n-text>
                <n-text depth="3" style="font-size: 12px">
                  最大输出：{{ settings.maxTokens }} · 自动截断重试（提额）：{{ settings.maxTokensAuto ? '开' : '关' }}
                </n-text>
                <n-text depth="3" style="font-size: 12px">
                  知识包：{{ settings.includeKnowledgePack ? '开' : '关' }} · 信号线：{{ settings.includeSignalLines ? '开' : '关' }} · 节点焦点：{{ settings.includeSelectedNodeFocus ? '开' : '关' }} · 流式：{{ settings.streamResponse ? '开' : '关' }}
                </n-text>
                <n-text depth="3" style="font-size: 12px">
                  截断精简重试：{{ settings.truncateAutoRetryEnabled ? '开' : '关' }} · 精简上限：{{ settings.conciseAnswerMaxChars }} 字
                </n-text>
              </template>
            </n-flex>
          </n-card>

          <n-checkbox v-model:checked="memoryModeEnabled">启用上下文记忆模式（追问时不重复发送全量 JSON）</n-checkbox>
          <n-checkbox v-model:checked="settings.includeSelectedNodeFocus">注入选中节点焦点上下文</n-checkbox>

          <n-flex align="center" style="gap: 8px; flex-wrap: wrap">
            <n-tag :type="memoryApplicable ? 'success' : 'default'">{{ memoryStatusText }}</n-tag>
            <n-button size="tiny" @click="clearCurrentTaskMemory">清空当前任务记忆</n-button>
            <n-button size="tiny" @click="clearMemory">清空记忆</n-button>
          </n-flex>

          <n-flex style="gap: 8px; flex-wrap: wrap">
            <n-button @click="clearApiKey">清空 Key</n-button>
            <n-button :loading="testing" @click="handleTest">测试连接</n-button>
          </n-flex>

          <n-card size="small" :bordered="true">
            <n-flex vertical style="gap: 6px">
              <n-text depth="3">当前任务：{{ selectedTaskTitle }}</n-text>
              <n-text depth="3">当前日志源：{{ sourceLabel }}</n-text>
              <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
                <n-tag size="small" :type="selectedNodeFocusEnabled ? 'success' : 'default'">
                  {{ selectedNodeFocusEnabled ? '节点焦点：开' : '节点焦点：关' }}
                </n-tag>
                <n-text depth="3" style="font-size: 12px">{{ selectedNodeFocusDetail }}</n-text>
              </n-flex>
            </n-flex>
          </n-card>

          <n-card size="small" :bordered="true" class="left-context-card">
            <n-flex vertical style="gap: 8px; height: 100%">
              <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
                <n-text depth="3" style="font-size: 12px">当前任务记忆摘要</n-text>
                <n-flex align="center" style="gap: 6px">
                  <n-tag size="small" :type="currentMemoryState ? 'success' : 'default'">
                    {{ currentMemoryState ? `已积累 ${currentMemoryState.turns} 轮` : '未建立' }}
                  </n-tag>
                  <n-button size="tiny" quaternary :disabled="!currentMemoryState" @click="memoryDialogVisible = true">
                    查看全文
                  </n-button>
                </n-flex>
              </n-flex>

              <div class="memory-preview-box">
                <pre class="memory-preview-text">{{ currentMemoryPreview }}</pre>
              </div>

              <n-text depth="3" style="font-size: 12px">快捷提问</n-text>
              <n-flex style="gap: 6px; flex-wrap: wrap">
                <n-button
                  v-for="item in quickPrompts"
                  :key="item.label"
                  size="tiny"
                  quaternary
                  @click="applyQuickPrompt(item)"
                >
                  {{ item.label }}
                </n-button>
              </n-flex>
            </n-flex>
          </n-card>

          </n-flex>

          <div class="left-analyze-block">
            <n-input
              class="question-input-fill"
              v-model:value="question"
              type="textarea"
              :autosize="false"
              rows="6"
              placeholder="输入你希望 AI 分析的问题"
            />

            <n-button data-tour="ai-analyze-action" type="primary" :loading="analyzing" @click="handleAnalyze">
              分析当前任务
            </n-button>
          </div>
        </div>
      </n-card>

      <n-card size="small" title="AI 输出" class="ai-right-card" data-tour="ai-output-panel">
        <template #header-extra>
          <n-text class="usage-text" depth="3" :title="usageText">{{ usageText }}</n-text>
        </template>

        <n-card
          v-if="onErrorPreview.chains.length || anchorPreview.windowCount || jumpBackPreview.caseCount"
          size="small"
          class="evidence-panel-card"
        >
          <n-flex vertical style="gap: 8px">
            <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
              <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
                <n-text depth="3" style="font-size: 12px">证据链诊断（当前任务）</n-text>
                <n-tag size="small" type="info">on_error {{ onErrorPreview.total }}</n-tag>
                <n-tag size="small" type="info">anchor {{ anchorPreview.windowCount }}</n-tag>
                <n-tag size="small" type="info">jump_back {{ jumpBackPreview.caseCount }}</n-tag>
              </n-flex>
              <n-button size="tiny" quaternary @click="evidencePanelCollapsed = !evidencePanelCollapsed">
                {{ evidencePanelCollapsed ? '展开证据链' : '收起证据链' }}
              </n-button>
            </n-flex>

            <n-text v-if="evidencePanelCollapsed" depth="3" style="font-size: 12px">
              证据链已折叠，当前可集中查看对话与结论。
            </n-text>

            <template v-else>
              <n-card v-if="onErrorPreview.chains.length" size="small" class="on-error-preview-card">
                <n-flex vertical style="gap: 6px">
                  <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
                    <n-text depth="3" style="font-size: 12px">on_error 证据链预览</n-text>
                    <n-tag size="small" type="info">共 {{ onErrorPreview.total }} 条</n-tag>
                  </n-flex>
                  <div class="on-error-preview-list">
                    <div
                      v-for="(chain, index) in onErrorPreview.chains"
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

              <n-card v-if="anchorPreview.windowCount" size="small" class="diagnostic-preview-card">
                <n-flex vertical style="gap: 6px">
                  <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
                    <n-text depth="3" style="font-size: 12px">anchor 解析诊断</n-text>
                    <n-tag size="small" type="info">窗口 {{ anchorPreview.windowCount }}</n-tag>
                  </n-flex>
                  <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
                    <n-tag size="small" :type="anchorPreview.unresolvedAnchorLikelyCount > 0 ? 'error' : 'success'">
                      未解析疑似 {{ anchorPreview.unresolvedAnchorLikelyCount }}
                    </n-tag>
                    <n-tag size="small" :type="anchorPreview.failedAfterAnchorResolvedCount > 0 ? 'warning' : 'default'">
                      已解析后失败 {{ anchorPreview.failedAfterAnchorResolvedCount }}
                    </n-tag>
                  </n-flex>
                  <n-text depth="3" style="font-size: 12px; line-height: 1.45">
                    {{ anchorPreview.summary }}
                  </n-text>
                  <div v-if="anchorPreview.cases.length" class="diagnostic-preview-list">
                    <div
                      v-for="(item, index) in anchorPreview.cases"
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

              <n-card v-if="jumpBackPreview.caseCount" size="small" class="diagnostic-preview-card">
                <n-flex vertical style="gap: 6px">
                  <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
                    <n-text depth="3" style="font-size: 12px">jump_back 回跳诊断</n-text>
                    <n-tag size="small" type="info">窗口 {{ jumpBackPreview.caseCount }}</n-tag>
                  </n-flex>
                  <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
                    <n-tag size="small" :type="jumpBackPreview.hitThenFailedNoReturnCount > 0 ? 'error' : 'success'">
                      命中后失败未回跳 {{ jumpBackPreview.hitThenFailedNoReturnCount }}
                    </n-tag>
                    <n-tag size="small" :type="jumpBackPreview.hitThenReturnedCount > 0 ? 'success' : 'default'">
                      命中并回跳 {{ jumpBackPreview.hitThenReturnedCount }}
                    </n-tag>
                    <n-tag size="small" :type="jumpBackPreview.terminalBounceCount > 0 ? 'warning' : 'default'">
                      回跳但命中节点疑似无后继 {{ jumpBackPreview.terminalBounceCount }}
                    </n-tag>
                  </n-flex>
                  <n-text depth="3" style="font-size: 12px; line-height: 1.45">
                    {{ jumpBackPreview.summary }}
                  </n-text>
                  <div v-if="jumpBackPreview.cases.length" class="diagnostic-preview-list">
                    <div
                      v-for="(item, index) in jumpBackPreview.cases"
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

        <div v-if="conversationTurnViews.length || showStreamingTurn" class="conversation-frozen-toolbar">
          <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
            <n-flex align="center" style="gap: 6px; flex-wrap: wrap">
              <n-text depth="3" style="font-size: 12px">多轮对话（聊天气泡模式）</n-text>
              <n-tag size="small" type="info">共 {{ conversationTurnViews.length }} 轮</n-tag>
            </n-flex>
            <n-flex align="center" style="gap: 8px; flex-wrap: wrap">
              <n-checkbox v-model:checked="conversationFollowMode" size="small">
                跟随最新
              </n-checkbox>
              <n-button size="tiny" @click="handleExportConversation">
                导出对话
              </n-button>
            </n-flex>
          </n-flex>
        </div>

        <n-scrollbar ref="aiOutputScrollbarRef" class="ai-output-scroll" content-style="width: 100%">
          <div class="ai-output-wrap">
            <n-empty
              v-if="!resultText && !conversationTurnViews.length && !showStreamingTurn"
              description="暂无结果，先测试连接或发起一次分析"
            />
            <div
              v-else-if="!conversationTurnViews.length && !showStreamingTurn"
              class="ai-output-markdown markdown-body"
              v-html="renderedResultHtml"
            ></div>

            <n-card v-if="conversationTurnViews.length || showStreamingTurn" size="small" class="conversation-card">
              <n-flex vertical style="gap: 8px">
                <div ref="turnListRef" class="turn-list">
                  <div v-for="turn in conversationTurnViews" :key="turn.id" class="turn-item">
                    <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
                      <n-tag size="small" type="success">第 {{ turn.turn }} 轮</n-tag>
                      <n-tag size="small" :type="turn.usedMemory ? 'success' : 'warning'">
                        {{ turn.usedMemory ? '记忆上下文' : '全量上下文' }}
                      </n-tag>
                    </n-flex>
                    <div class="turn-question-box turn-bubble-user">
                      <n-text depth="3" style="font-size: 12px">用户</n-text>
                      <pre class="turn-question-text">{{ turn.question }}</pre>
                    </div>
                    <div class="turn-answer-box turn-bubble-assistant markdown-body" v-html="turn.answerHtml"></div>
                  </div>
                  <div v-if="showStreamingTurn" class="turn-item turn-item-streaming">
                    <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
                      <n-tag size="small" type="warning">进行中</n-tag>
                      <n-tag size="small" type="info">流式输出</n-tag>
                    </n-flex>
                    <div class="turn-question-box turn-bubble-user">
                      <n-text depth="3" style="font-size: 12px">用户</n-text>
                      <pre class="turn-question-text">{{ activeRoundQuestion }}</pre>
                    </div>
                    <div class="turn-answer-box turn-bubble-assistant markdown-body" v-html="streamingAnswerHtml"></div>
                  </div>
                </div>
              </n-flex>
            </n-card>
            <n-text v-if="resultText" depth="3" style="display: block; margin-top: 10px; font-size: 12px">
              上次请求模式：{{ lastRequestUsedMemory ? '记忆上下文' : '全量上下文' }}
            </n-text>
          </div>
        </n-scrollbar>
      </n-card>
    </div>

    <n-modal
      v-model:show="memoryDialogVisible"
      preset="card"
      title="当前任务记忆全文"
      :style="{ width: 'min(860px, 92vw)' }"
    >
      <div class="memory-modal-body">
        <pre class="memory-modal-text">{{ currentMemoryFull }}</pre>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.ai-view-root {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 8px;
  box-sizing: border-box;
}

.ai-view-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(360px, 460px) minmax(0, 1fr);
}

.ai-view-grid > * {
  min-height: 0;
  min-width: 0;
}

.ai-left-card {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

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

.ai-left-card :deep(.n-card__content),
.ai-right-card :deep(.n-card__content) {
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

.usage-text {
  display: block;
  max-width: min(54vw, 720px);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.left-panel-content {
  flex: 0 1 auto;
  min-height: 0;
  max-height: calc(100% - 210px);
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

.memory-modal-body {
  max-height: min(72vh, 760px);
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
}

.memory-modal-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.5;
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

.ai-output-scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
}

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

.turn-item {
  border: 1px solid rgba(127, 231, 196, 0.55);
  border-left: 4px solid rgba(127, 231, 196, 0.9);
  border-radius: 10px;
  padding: 10px 10px 10px 12px;
  background: rgba(127, 231, 196, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.turn-item-streaming {
  border-style: dashed;
  background: rgba(127, 231, 196, 0.12);
}

.turn-question-box {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  padding: 8px 10px;
}

.turn-question-text {
  margin: 4px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.5;
  font-size: 12px;
}

.turn-answer-box {
  border: 1px solid rgba(127, 231, 196, 0.6);
  border-radius: 8px;
  background: rgba(127, 231, 196, 0.14);
  padding: 8px 10px;
}

.turn-bubble-user {
  border-color: rgba(242, 201, 125, 0.65);
  background: rgba(242, 201, 125, 0.12);
}

.turn-bubble-assistant {
  border-color: rgba(127, 231, 196, 0.72);
  background: rgba(127, 231, 196, 0.16);
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
  .ai-view-root {
    overflow: auto;
  }

  .ai-view-grid {
    height: auto;
    min-height: 100%;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 6px;
  }

  .ai-left-card,
  .ai-right-card {
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

  .on-error-preview-list,
  .diagnostic-preview-list {
    max-height: 140px;
  }

  .turn-list {
    gap: 8px;
    padding-right: 0;
  }

  .conversation-frozen-toolbar {
    padding: 6px 7px;
  }

  .turn-item {
    padding: 8px 8px 8px 10px;
    gap: 8px;
  }
}
</style>
