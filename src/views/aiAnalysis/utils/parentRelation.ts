import type { TaskInfo } from '../../../types'
import { buildJumpBackFlowDiagnostics } from '../../../ai/contextBuilder'
import { buildNodeFlowItems } from '../../../utils/nodeFlow'
import type { ParentRelationConflictIssue, ParentRelationFacts } from '../types'

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

export const detectParentRelationConflict = (answer: string): ParentRelationConflictIssue | null => {
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

export const collectParentRelationFacts = (task: TaskInfo | null): ParentRelationFacts | null => {
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
    const flowItems = buildNodeFlowItems(node)
    const taskItems = flowItems.filter(item => item.type === 'task')
    if (!taskItems.length) continue
    const nestedActions = taskItems.flatMap(item =>
      (item.children ?? []).filter(child => child.type === 'pipeline_node'),
    )
    const hasFailed = taskItems.some(item => item.status === 'failed') || nestedActions.some(item => item.status === 'failed')
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
