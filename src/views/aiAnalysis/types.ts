export interface MemoryState {
  summary: string
  contextKey: string
  turns: number
  updatedAt: number
}

export type MemoryStateStore = Record<string, MemoryState>

export interface ConversationTurn {
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

export interface TokenUsageAccumulator {
  prompt: number
  completion: number
  total: number
  requestCount: number
}

export type AnalysisFocusMode = 'general' | 'on_error' | 'hotspot'
export type AnalysisPromptProfile = 'diagnostic' | 'followup'

export interface ParentRelationConflictIssue {
  directParents: string[]
  upstreamChains: Array<{ from: string; to: string }>
  reason: string
}

export interface ParentRelationFacts {
  directParentCandidates: Array<{ name: string; failedCount: number }>
  upstreamChains: Array<{ from: string; to: string; hitCount: number; terminalBounceCount: number }>
}
