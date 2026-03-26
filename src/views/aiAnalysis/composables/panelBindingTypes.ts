import type { Ref } from 'vue'

export interface OnErrorPreviewItem {
  triggerType: string
  riskLevel: string
  triggerLine: number | null
  triggerNode: string
  summary: string
  outcomeEvent: string
}

export interface AnchorPreviewItem {
  classification: string
  startNode: string
  summary: string
  startLine: number | null
  outcomeEvent: string
}

export interface JumpBackPreviewItem {
  classification: string
  startNode: string
  summary: string
  startLine: number | null
  hitCandidate: string
  returnObserved: boolean
}

export interface ConversationTurnView {
  id: string
  turn: number
  usedMemory: boolean
  question: string
  answerHtml: string
}

export interface PanelPreviewRefs {
  onErrorPreview: Ref<{
    total: number
    chains: OnErrorPreviewItem[]
  }>
  anchorPreview: Ref<{
    windowCount: number
    unresolvedAnchorLikelyCount: number
    failedAfterAnchorResolvedCount: number
    summary: string
    cases: AnchorPreviewItem[]
  }>
  jumpBackPreview: Ref<{
    caseCount: number
    hitThenReturnedCount: number
    hitThenFailedNoReturnCount: number
    terminalBounceCount: number
    summary: string
    cases: JumpBackPreviewItem[]
  }>
}
