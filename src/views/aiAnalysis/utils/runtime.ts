import type { ConversationTurn, TokenUsageAccumulator } from '../types'

export const makeTokenUsageAccumulator = (): TokenUsageAccumulator => ({
  prompt: 0,
  completion: 0,
  total: 0,
  requestCount: 0,
})

export const accumulateTokenUsage = (
  sum: TokenUsageAccumulator,
  usage: {
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
  } | null | undefined,
) => {
  sum.requestCount += 1
  if (usage?.promptTokens != null) sum.prompt += usage.promptTokens
  if (usage?.completionTokens != null) sum.completion += usage.completionTokens
  if (usage?.totalTokens != null) {
    sum.total += usage.totalTokens
  } else if (usage?.promptTokens != null || usage?.completionTokens != null) {
    sum.total += (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0)
  }
}

export const sumContextTokenUsage = (
  turns: ConversationTurn[],
  contextKey: string,
  extraRound?: TokenUsageAccumulator,
): TokenUsageAccumulator => {
  const sum = makeTokenUsageAccumulator()
  for (const turn of turns) {
    if (turn.contextKey !== contextKey) continue
    if (typeof turn.roundPromptTokens === 'number') sum.prompt += turn.roundPromptTokens
    if (typeof turn.roundCompletionTokens === 'number') sum.completion += turn.roundCompletionTokens
    if (typeof turn.roundTotalTokens === 'number') {
      sum.total += turn.roundTotalTokens
    } else if (typeof turn.roundPromptTokens === 'number' || typeof turn.roundCompletionTokens === 'number') {
      sum.total += (turn.roundPromptTokens ?? 0) + (turn.roundCompletionTokens ?? 0)
    }
    if (typeof turn.roundRequestCount === 'number') {
      sum.requestCount += turn.roundRequestCount
    } else if (
      typeof turn.roundPromptTokens === 'number'
      || typeof turn.roundCompletionTokens === 'number'
      || typeof turn.roundTotalTokens === 'number'
    ) {
      sum.requestCount += 1
    }
  }

  if (extraRound) {
    sum.prompt += extraRound.prompt
    sum.completion += extraRound.completion
    sum.total += extraRound.total
    sum.requestCount += extraRound.requestCount
  }

  return sum
}

export const getNextConversationTurn = (
  turns: ConversationTurn[],
  contextKey: string,
): number => {
  let maxTurn = 0
  for (const item of turns) {
    if (item.contextKey !== contextKey) continue
    if (item.turn > maxTurn) maxTurn = item.turn
  }
  return maxTurn + 1
}

export const isLikelyPayloadTooLargeError = (msg: string): boolean =>
  /(context|token|length|too\s*long|maximum context|request too large|payload|invalid_request|无法加载返回数据|返回数据)/i.test(msg)
