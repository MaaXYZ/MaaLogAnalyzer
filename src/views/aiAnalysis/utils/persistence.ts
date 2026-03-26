import type { ConversationTurn, MemoryState, MemoryStateStore, TokenUsageAccumulator } from '../types'

interface AppendConversationRoundOptions {
  turns: ConversationTurn[]
  nextTurnItem: ConversationTurn
  maxTurnsPerContext: number
  maxTotalTurns: number
}

export const appendConversationRound = (
  options: AppendConversationRoundOptions,
): ConversationTurn[] => {
  const sameContextTurns = options.turns
    .filter(item => item.contextKey === options.nextTurnItem.contextKey)
    .concat(options.nextTurnItem)
    .sort((a, b) => a.turn - b.turn)
    .slice(-options.maxTurnsPerContext)

  const otherContextTurns = options.turns.filter(item => item.contextKey !== options.nextTurnItem.contextKey)
  return [...otherContextTurns, ...sameContextTurns]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-options.maxTotalTurns)
}

interface UpsertMemoryStateOptions {
  store: MemoryStateStore
  nextState: MemoryState
  maxContexts: number
}

export const upsertMemoryState = (
  options: UpsertMemoryStateOptions,
): MemoryStateStore => {
  const nextEntries = Object.entries({
    ...options.store,
    [options.nextState.contextKey]: options.nextState,
  })
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, options.maxContexts)
  return Object.fromEntries(nextEntries)
}

interface BuildConversationTurnItemOptions {
  contextKey: string
  nextTurn: number
  question: string
  answer: string
  usedMemory: boolean
  roundTokenUsage: TokenUsageAccumulator
  clipForStorage: (value: string, maxChars: number) => string
  questionMaxChars: number
  answerMaxChars: number
  now?: number
}

export const buildConversationTurnItem = (
  options: BuildConversationTurnItemOptions,
): ConversationTurn => {
  const now = options.now ?? Date.now()
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    turn: options.nextTurn,
    contextKey: options.contextKey,
    question: options.clipForStorage(options.question, options.questionMaxChars),
    answer: options.clipForStorage(options.answer, options.answerMaxChars),
    usedMemory: options.usedMemory,
    timestamp: now,
    roundPromptTokens: options.roundTokenUsage.prompt,
    roundCompletionTokens: options.roundTokenUsage.completion,
    roundTotalTokens: options.roundTokenUsage.total,
    roundRequestCount: options.roundTokenUsage.requestCount,
  }
}

interface BuildNextMemoryStateOptions {
  store: MemoryStateStore
  contextKey: string
  memoryUpdate: string
  appendMemorySummary: (previous: string, next: string, turn: number) => string
  maxContexts: number
  now?: number
}

export const buildNextMemoryStore = (
  options: BuildNextMemoryStateOptions,
): MemoryStateStore => {
  const prevMemory = options.store[options.contextKey]
  const nextTurns = (prevMemory?.turns ?? 0) + 1
  const mergedSummary = options.appendMemorySummary(prevMemory?.summary ?? '', options.memoryUpdate, nextTurns)
  const nextState: MemoryState = {
    summary: mergedSummary,
    contextKey: options.contextKey,
    turns: nextTurns,
    updatedAt: options.now ?? Date.now(),
  }
  return upsertMemoryState({
    store: options.store,
    nextState,
    maxContexts: options.maxContexts,
  })
}
