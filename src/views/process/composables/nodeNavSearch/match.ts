import type { NodeInfo, UnifiedFlowItem } from '../../../../types'
import type { NodeNavMatchDetail, NodeNavMatchKind } from './types'

export const normalizeSearchText = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

const includesSearchText = (value: unknown, query: string): boolean => {
  if (!query) return true
  if (typeof value !== 'string') return false
  return value.toLowerCase().includes(query)
}

const buildNextListDisplayName = (item: NonNullable<NodeInfo['next_list']>[number]): string => {
  const prefixes: string[] = []
  if (item.jump_back) prefixes.push('[JumpBack]')
  if (item.anchor) prefixes.push('[Anchor]')
  if (prefixes.length === 0) return item.name || '未命名 Next'
  return `${prefixes.join(' ')} ${item.name || ''}`.trim()
}

const matchesKeyword = (query: string, keyword: string): boolean => {
  return keyword.includes(query) || query.includes(keyword)
}

const isJumpBackKeyword = (query: string): boolean => {
  return matchesKeyword(query, 'jumpback') || matchesKeyword(query, 'jump back') || matchesKeyword(query, '跳回')
}

const isAnchorKeyword = (query: string): boolean => {
  return matchesKeyword(query, 'anchor') || matchesKeyword(query, '锚点')
}

const pushUniqueNodeNavMatchDetail = (
  output: NodeNavMatchDetail[],
  seen: Set<string>,
  detail: NodeNavMatchDetail,
) => {
  const key = `${detail.kind}:${detail.text}`
  if (seen.has(key)) return
  seen.add(key)
  output.push(detail)
}

const collectNodeFlowMatchDetails = (
  items: UnifiedFlowItem[] | undefined,
  query: string,
  output: NodeNavMatchDetail[],
  seen: Set<string>,
  limit: number,
) => {
  if (!items || items.length === 0) return
  const stack: UnifiedFlowItem[] = [...items]
  while (stack.length > 0 && output.length < limit) {
    const current = stack.pop()
    if (!current) continue
    const candidates = [current.name, current.reco_details?.name, current.action_details?.name]
    for (const candidate of candidates) {
      if (!includesSearchText(candidate, query)) continue
      pushUniqueNodeNavMatchDetail(output, seen, {
        kind: 'flow',
        text: candidate as string,
      })
      if (output.length >= limit) break
    }
    if (output.length >= limit) break
    if (current.children?.length) {
      stack.push(...current.children)
    }
  }
}

export const collectNodeNavMatchDetails = (node: NodeInfo, query: string): NodeNavMatchDetail[] => {
  if (!query) return []

  const details: NodeNavMatchDetail[] = []
  const seen = new Set<string>()
  const limit = 6

  if (includesSearchText(node.name, query)) {
    pushUniqueNodeNavMatchDetail(details, seen, { kind: 'node', text: node.name || '未命名节点' })
  }

  for (const item of node.next_list ?? []) {
    if (details.length >= limit) break
    const display = buildNextListDisplayName(item)
    if (
      includesSearchText(item.name, query) ||
      includesSearchText(display, query) ||
      (item.jump_back && isJumpBackKeyword(query)) ||
      (item.anchor && isAnchorKeyword(query))
    ) {
      pushUniqueNodeNavMatchDetail(details, seen, { kind: 'next-list', text: display })
    }
  }

  if (details.length < limit) {
    collectNodeFlowMatchDetails(node.node_flow, query, details, seen, limit)
  }

  return details
}

export const getNodeNavMatchKinds = (details: NodeNavMatchDetail[]): NodeNavMatchKind[] => {
  const order: NodeNavMatchKind[] = ['node', 'next-list', 'flow']
  return order.filter((kind) => details.some((detail) => detail.kind === kind))
}
