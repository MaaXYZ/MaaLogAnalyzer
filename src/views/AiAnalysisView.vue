<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NCheckbox, NEmpty, NFlex, NInput, NInputNumber, NScrollbar, NTag, NText, useMessage } from 'naive-ui'
import type { TaskInfo } from '../types'
import { requestChatCompletion } from '../ai/client'
import { buildAiAnalysisContext, buildEventChainDiagnostics, type AiLoadedTarget } from '../ai/contextBuilder'
import { tryParseStructuredOutput, type StructuredAiOutput } from '../ai/structuredOutput'
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

interface ConversationTurn {
  id: string
  turn: number
  contextKey: string
  question: string
  answer: string
  usedMemory: boolean
  timestamp: number
}

interface ConversationTurnView extends ConversationTurn {
  answerHtml: string
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
const MEMORY_SESSION_KEY = 'maa-log-analyzer-ai-memory-state'
const MEMORY_SUMMARY_MAX_CHARS = 12000
const CONVERSATION_SESSION_KEY = 'maa-log-analyzer-ai-conversation-turns'
const CONVERSATION_MAX_TURNS = 20
const loadSessionMemoryState = (): MemoryState | null => {
  try {
    const raw = sessionStorage.getItem(MEMORY_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MemoryState>
    if (!parsed || typeof parsed !== 'object') return null
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
  } catch {
    return null
  }
}
const saveSessionMemoryState = (value: MemoryState | null) => {
  try {
    if (!value) {
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
const memoryState = ref<MemoryState | null>(loadSessionMemoryState())
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
        question: item.question as string,
        answer: item.answer as string,
        usedMemory: item.usedMemory as boolean,
        timestamp: item.timestamp as number,
      }))
      .slice(-CONVERSATION_MAX_TURNS)
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
    sessionStorage.setItem(CONVERSATION_SESSION_KEY, JSON.stringify(turns.slice(-CONVERSATION_MAX_TURNS)))
  } catch {
    // ignore write errors
  }
}

const conversationTurns = ref<ConversationTurn[]>(loadSessionConversationTurns())

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

watch(memoryState, (value) => {
  saveSessionMemoryState(value)
}, { deep: true })

watch(conversationTurns, (value) => {
  saveSessionConversationTurns(value)
}, { deep: true })

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
  let paragraphLines: string[] = []

  const closeList = () => {
    if (!listType) return
    out.push(listType === 'ul' ? '</ul>' : '</ol>')
    listType = null
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

    if (!trimmed) {
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
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${renderInlineMarkdown(ul[1])}</li>`)
      i += 1
      continue
    }

    const ol = raw.match(/^\s*\d+\.\s+(.+)$/)
    if (ol) {
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${renderInlineMarkdown(ol[1])}</li>`)
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

const renderedResultHtml = computed(() => renderMarkdown(resultText.value))

const conversationTurnViews = computed<ConversationTurnView[]>(() => {
  return [...conversationTurns.value]
    .sort((a, b) => a.turn - b.turn)
    .map(item => ({
      ...item,
      answerHtml: renderMarkdown(item.answer),
    }))
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
  saveSessionMemoryState(null)
  conversationTurns.value = []
  saveSessionConversationTurns([])
  lastRequestUsedMemory.value = false
  message.success('已清空上下文记忆与多轮对话')
}

const ANALYSIS_PROMPT_SOFT_LIMIT = 110000
const ANALYSIS_TIMEOUT_MS = 180000
const getSystemPrompt = () => {
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
    '在下结论前，必须先做“量化盘点”：至少引用 timelineDiagnostics.longStayNodes 与 timelineDiagnostics.recoFailuresByName。',
    '若 deterministicFindings.findings 非空，优先基于它构建结论骨架，再补充细节证据。',
    '必须优先区分“流程现象”与“真实失败”：若任务成功且无 PipelineNode.Failed，不得把循环/重试直接当根因。',
    '必须检查 eventChainDiagnostics：用 onErrorChains 明确 on_error 触发源（action_failed / reco_timeout_or_nohit / error_handling_loop）。',
    '必须区分“现象”和“根因”：ERR 可能是症状，只有与节点停留/重试模式相关联时才能作为主因。',
    '证据必须给 E1/E2...，并引用明确字段路径（如 timelineDiagnostics.longStayNodes[0]、signalDiagnostics.failureTypeBreakdown[0]、deterministicFindings.findings[0]）。',
    '根因候选至少 2 条，每条包含：置信度(0-100)、关键证据编号、反证点。',
    '排查步骤至少 3 条；每条都要包含：操作、期望现象、若不符合下一步。',
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

  return {
    ...context,
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
    knowledge: toObjectArray(context.knowledge).slice(0, 16),
  }
}

const buildFullContextPrompt = (compact: boolean, minifiedJson = false) => {
  const rawContext = buildAiAnalysisContext({
    tasks: props.tasks,
    selectedTask: props.selectedTask,
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
    '- 先列证据清单(E1/E2...)，再给结论。',
    '- 必须先量化长时间停留节点（引用 timelineDiagnostics.longStayNodes）。',
    '- 必须检查识别热点（引用 timelineDiagnostics.recoFailuresByName 与 timelineDiagnostics.hotspotRecoPairs）。',
    '- 必须检查 eventChainDiagnostics.onErrorChains，明确 on_error 的触发源与后续结果。',
    '- 仅把 nextRecognitionChains / actionFailureChains 作为补充证据，不可替代 onErrorChains。',
    '- 若存在 deterministicFindings.findings，至少引用其中 1 条并映射到 E 证据编号。',
    '- 给出至少2个根因候选并排序。',
    '- 排查步骤必须可执行且可验证。',
    '',
    '完整上下文 JSON:',
    contextText,
  ].join('\n')
}

const buildMemoryPrompt = (memory: MemoryState) => {
  return [
    '这是同一上下文下的追问。优先基于已有记忆回答，并保持证据编号连续。',
    `用户追问: ${question.value}`,
    '',
    `上下文指纹: ${memory.contextKey}`,
    '追问要求:',
    '- 若新问题未覆盖已知矛盾，优先处理未决风险。',
    '- 继续引用 timelineDiagnostics、signalDiagnostics、deterministicFindings 的字段路径。',
    '- 维持“结论/根因候选/证据/排查步骤”结构。',
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

const repairStructuredOutput = async (
  rawOutput: string,
  key: string
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
    timeoutMs: 30000,
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

  return tryParseStructuredOutput(repair.text)
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

  const contextKey = buildContextKey()
  const useMemoryForThisRound = mode === 'analyze' && memoryModeEnabled.value && !!memoryState.value && memoryState.value.contextKey === contextKey
  lastRequestUsedMemory.value = useMemoryForThisRound
  if (mode === 'analyze') {
    resultText.value = ''
    usageText.value = 'AI 正在处理请求...'
  }

  let usedCompactContext = false
  let userContent = ''
  if (mode === 'test') {
    userContent = '请只输出：连接正常'
  } else if (useMemoryForThisRound) {
    userContent = buildMemoryPrompt(memoryState.value as MemoryState)
  } else {
    const fullPrompt = buildFullContextPrompt(false)
    if (fullPrompt.length > ANALYSIS_PROMPT_SOFT_LIMIT) {
      usedCompactContext = true
      const compactPrompt = buildFullContextPrompt(true)
      userContent = compactPrompt.length > ANALYSIS_PROMPT_SOFT_LIMIT
        ? buildFullContextPrompt(true, true)
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
      : (settings.maxTokensAuto ? undefined : settings.maxTokens),
    stream: mode === 'analyze' ? settings.streamResponse : false,
    responseFormatJson: mode === 'analyze',
    retryOnLength: mode === 'analyze',
    maxNetworkRetries: mode === 'analyze' ? 2 : 1,
    onDelta: mode === 'analyze' && settings.streamResponse
      ? (_deltaText: string, fullText: string) => {
          resultText.value = fullText
          usageText.value = 'AI 正在流式输出...'
        }
      : undefined,
    timeoutMs: mode === 'test' ? 15000 : ANALYSIS_TIMEOUT_MS,
    messages: [
      { role: 'system', content: getSystemPrompt() },
      { role: 'user', content },
    ],
  })

  let response
  try {
    response = await sendRequest(userContent)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const shouldRetryCompact = mode === 'analyze' && !useMemoryForThisRound && !usedCompactContext && isLikelyPayloadTooLargeError(msg)
    if (!shouldRetryCompact) throw error

    usedCompactContext = true
    message.warning('分析上下文较大，已自动切换压缩上下文重试一次')
    const compactPrompt = buildFullContextPrompt(true)
    response = await sendRequest(
      compactPrompt.length > ANALYSIS_PROMPT_SOFT_LIMIT
        ? buildFullContextPrompt(true, true)
        : compactPrompt
    )
  }

  const usageModeText = mode === 'analyze'
    ? (useMemoryForThisRound ? '记忆上下文' : (usedCompactContext ? '压缩全量上下文' : '全量上下文'))
    : '连接测试'

  if (response.usage?.totalTokens != null) {
    usageText.value = `Token 使用: ${response.usage.totalTokens} (prompt ${response.usage.promptTokens ?? '-'} / completion ${response.usage.completionTokens ?? '-'}) | ${usageModeText}`
  } else {
    usageText.value = `上下文模式: ${usageModeText}`
  }
  const outputTruncated = response.finishReason === 'length'
  if (outputTruncated) {
    usageText.value = `${usageText.value} | 输出截断`
  }

  if (mode === 'test') {
    resultText.value = response.text
    return
  }

  if (outputTruncated) {
    message.warning('模型输出达到最大长度并被截断，请提高“最大输出”或缩短问题后重试。')
  }

  let parsed = tryParseStructuredOutput(response.text)
  if (!parsed) {
    try {
      parsed = await repairStructuredOutput(response.text, key)
      if (parsed) {
        message.warning('模型原始输出不是标准 JSON，已自动修复后继续。')
      }
    } catch {
      // ignore repair failures and keep raw fallback
    }
  }
  const answerText = parsed?.answer?.trim() || response.text
  resultText.value = answerText

  if (mode === 'analyze') {
    const nextTurn = getNextConversationTurn(contextKey)
    const history: ConversationTurn[] = [
      ...conversationTurns.value,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        turn: nextTurn,
        contextKey,
        question: questionSnapshot,
        answer: answerText,
        usedMemory: useMemoryForThisRound,
        timestamp: Date.now(),
      },
    ]
    conversationTurns.value = history.slice(-CONVERSATION_MAX_TURNS)
  }

  if (!memoryModeEnabled.value || outputTruncated) return

  const nextMemorySummary = parsed?.memory_update?.trim() || buildFallbackMemory(answerText, question.value)
  const hasSameContextMemory = memoryState.value?.contextKey === contextKey
  const nextTurns = (hasSameContextMemory ? memoryState.value?.turns ?? 0 : 0) + 1
  const mergedSummary = hasSameContextMemory
    ? appendMemorySummary(memoryState.value?.summary ?? '', nextMemorySummary, nextTurns)
    : appendMemorySummary('', nextMemorySummary, 1)

  memoryState.value = {
    summary: mergedSummary,
    contextKey,
    turns: nextTurns,
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
            <n-input-number v-model:value="settings.maxTokens" :min="256" :max="4096" :step="64" :disabled="settings.maxTokensAuto" />
            <n-checkbox v-model:checked="settings.maxTokensAuto">自动</n-checkbox>
          </n-flex>

          <n-flex vertical style="gap: 6px">
            <n-checkbox v-model:checked="settings.includeKnowledgePack">注入 Maa 领域知识包</n-checkbox>
            <n-checkbox v-model:checked="settings.includeSignalLines">注入日志中的 [WRN]/[ERR] 片段</n-checkbox>
            <n-checkbox v-model:checked="settings.streamResponse">分析请求使用流式响应（stream=true）</n-checkbox>
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

        <n-card v-if="onErrorPreview.chains.length" size="small" class="on-error-preview-card">
          <n-flex vertical style="gap: 6px">
            <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
              <n-text depth="3" style="font-size: 12px">on_error 证据链预览（当前任务）</n-text>
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

        <n-scrollbar class="ai-output-scroll" content-style="width: 100%">
          <div class="ai-output-wrap">
            <n-empty v-if="!resultText && !conversationTurnViews.length" description="暂无结果，先测试连接或发起一次分析" />
            <div
              v-else-if="!conversationTurnViews.length"
              class="ai-output-markdown markdown-body"
              v-html="renderedResultHtml"
            ></div>

            <n-card v-if="conversationTurnViews.length" size="small" class="conversation-card">
              <n-flex vertical style="gap: 8px">
                <n-flex align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
                  <n-text depth="3" style="font-size: 12px">多轮对话（聊天气泡模式）</n-text>
                  <n-tag size="small" type="info">共 {{ conversationTurnViews.length }} 轮</n-tag>
                </n-flex>
                <div class="turn-list">
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

.ai-left-card,
.ai-right-card {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-right-card :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-output-scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
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
  .ai-view-grid {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
}
</style>
