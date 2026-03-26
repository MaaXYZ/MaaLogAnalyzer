import type { ConversationTurn, MemoryState, MemoryStateStore } from '../types'

export const MEMORY_SESSION_KEY = 'maa-log-analyzer-ai-memory-state'
export const MEMORY_SUMMARY_MAX_CHARS = 12000
export const MEMORY_STORE_MAX_CONTEXTS = 30
export const CONVERSATION_SESSION_KEY = 'maa-log-analyzer-ai-conversation-turns'
export const CONVERSATION_MAX_TURNS = 12
export const CONVERSATION_MAX_TOTAL_TURNS = 80
export const CONVERSATION_QUESTION_MAX_CHARS = 1200
export const CONVERSATION_ANSWER_MAX_CHARS = 28000

export const clipForStorage = (value: string, maxChars: number): string => {
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

export const loadSessionMemoryStateStore = (): MemoryStateStore => {
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

export const saveSessionMemoryStateStore = (value: MemoryStateStore) => {
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

export const appendMemorySummary = (previous: string, next: string, turn: number): string => {
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

export const loadSessionConversationTurns = (): ConversationTurn[] => {
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

export const saveSessionConversationTurns = (turns: ConversationTurn[]) => {
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
