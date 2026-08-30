import type { NodeInfo, UnifiedFlowItem } from '@windsland52/maa-log-parser/types'
import { buildNodeRecognitionAttempts } from '@windsland52/maa-log-parser/node-flow'
import { resolveRecognitionNextListName } from './nextListPresentation'

export interface ResolvedNodeMatchedNext {
  name: string
  nextItem: NodeInfo['next_list'][number]
}

const normalizeOptionalName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const normalizeHitCandidateName = (value: string): string => {
  const withoutPrefixes = value.replace(/^(?:\[[^\]]+\]\s*)+/u, '').trim()
  const equalIndex = withoutPrefixes.indexOf('=')
  if (equalIndex < 0) return withoutPrefixes
  return withoutPrefixes.slice(0, equalIndex).trim()
}

const resolveCandidateNextName = (
  candidate: unknown,
  nextNames: ReadonlySet<string>,
): string | undefined => {
  const normalized = normalizeOptionalName(candidate)
  if (!normalized) return undefined
  if (nextNames.has(normalized)) return normalized
  const normalizedHit = normalizeHitCandidateName(normalized)
  if (normalizedHit && nextNames.has(normalizedHit)) return normalizedHit
  return undefined
}

const pushSuccessFlowCandidates = (rootItems: UnifiedFlowItem[] | undefined, output: unknown[]) => {
  if (!Array.isArray(rootItems) || rootItems.length === 0) return

  const stack = [...rootItems]
  while (stack.length > 0) {
    const flowItem = stack.pop()
    if (!flowItem) continue

    if (Array.isArray(flowItem.children) && flowItem.children.length > 0) {
      stack.push(...flowItem.children)
    }

    if (flowItem.status !== 'success') continue

    output.push(flowItem.name)
    output.push(flowItem.anchor_name)
    if (flowItem.type === 'recognition') {
      output.push(flowItem.reco_details?.name)
    }
    if (flowItem.type === 'action') {
      output.push(flowItem.action_details?.name)
    }
  }
}

export const resolveNodeMatchedRecognitionName = (node: NodeInfo): string | undefined => {
  return resolveNodeMatchedNextListItem(node)?.name
}

export const resolveNodeMatchedNextListItem = (
  node: NodeInfo,
): ResolvedNodeMatchedNext | undefined => {
  const nextNames = new Set(
    (node.next_list || []).map((item) => item.name).filter((name) => !!name),
  )
  if (nextNames.size === 0) return undefined

  const nextItemByName = new Map<string, NodeInfo['next_list'][number]>()
  for (const nextItem of node.next_list || []) {
    if (!nextItem?.name || nextItemByName.has(nextItem.name)) continue
    nextItemByName.set(nextItem.name, nextItem)
  }

  const attempts = buildNodeRecognitionAttempts(node)

  for (const attempt of attempts) {
    if (attempt.status !== 'success') continue
    const matchedCandidate = resolveRecognitionNextListName(attempt, nextNames)
    const matchedNextName = resolveCandidateNextName(matchedCandidate, nextNames)
    if (!matchedNextName) continue
    const nextItem = nextItemByName.get(matchedNextName)
    if (nextItem) return { name: matchedNextName, nextItem }
  }

  for (const attempt of attempts) {
    if (attempt.status !== 'running') continue
    const matchedCandidate = resolveRecognitionNextListName(attempt, nextNames)
    const matchedNextName = resolveCandidateNextName(matchedCandidate, nextNames)
    if (!matchedNextName) continue
    const nextItem = nextItemByName.get(matchedNextName)
    if (nextItem) return { name: matchedNextName, nextItem }
  }

  const fallbackCandidates: unknown[] = [
    node.node_details?.name,
    node.action_details?.name,
    node.reco_details?.name,
  ]
  pushSuccessFlowCandidates(node.node_flow, fallbackCandidates)
  fallbackCandidates.push(node.name)

  for (const candidate of fallbackCandidates) {
    const matchedNextName = resolveCandidateNextName(candidate, nextNames)
    if (!matchedNextName) continue
    const nextItem = nextItemByName.get(matchedNextName)
    if (nextItem) return { name: matchedNextName, nextItem }
  }

  return undefined
}

export const resolveNodeExecutionName = (node: NodeInfo): string => {
  return resolveNodeMatchedRecognitionName(node) || node.name || '未命名节点'
}
