import { computed, ref, watch, type Ref } from 'vue'
import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import {
  collectNodeNavMatchDetails,
  getNodeNavMatchKinds,
  normalizeSearchText as normalizeNodeNavMatchText,
  normalizeSearchText,
} from './nodeNavSearch/match'
import { formatNodeNavMatchHint, formatNodeNavMatchPreview } from './nodeNavSearch/format'
import {
  buildActionFocusCardData,
  buildNodeFocusCardData,
  buildRecognitionFocusCardData,
} from '../../detail/composables/focus'
import { buildNodeFlowItems } from '@windsland52/maa-log-parser/node-flow'
import { buildNodeExecutionTimeline } from '@windsland52/maa-log-tools/node-execution-timeline'
import type {
  NodeNavFocusKind,
  NodeNavMatchDetail,
  NodeNavStatus,
  NodeNavViewItem,
} from './nodeNavSearch/types'

export type {
  NodeNavMatchDetail,
  NodeNavMatchKind,
  NodeNavStatus,
  NodeNavViewItem,
} from './nodeNavSearch/types'

export type NodeNavMode = 'pipeline' | 'next-list-hit' | 'focus'

type SourceEntry = {
  navKey: string
  node: NodeInfo
  originalIndex: number
  primaryText: string
  primaryMatchKind: 'node' | 'next-list' | 'focus'
  navStatus: NodeNavStatus
  targetFlowItemId?: string
  focusKind?: NodeNavFocusKind
  focusDisplay?: string
  matchDetails?: NodeNavMatchDetail[]
}

const hasFocusValue = (value: unknown): boolean => value !== null && value !== undefined

const stringifyFocusPreview = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const readFocusCardDisplay = (entries: Array<{ display: string[] }>): string => {
  const channels = entries
    .flatMap((entry) => entry.display)
    .filter(
      (channel, index, items) => channel.trim().length > 0 && items.indexOf(channel) === index,
    )
  return channels.length > 0 ? channels.join('/') : 'log'
}

const getFlowItemFocusKind = (item: UnifiedFlowItem): NodeNavFocusKind => {
  if (item.type === 'recognition' || item.type === 'recognition_node') return 'recognition'
  if (item.type === 'action' || item.type === 'action_node') return 'action'
  return 'flow'
}

const flattenFlowItems = (
  items: UnifiedFlowItem[] | undefined,
  output: UnifiedFlowItem[] = [],
): UnifiedFlowItem[] => {
  if (!items || items.length === 0) return output
  for (const item of items) {
    output.push(item)
    if (item.children?.length) flattenFlowItems(item.children, output)
  }
  return output
}

export const useNodeNavSearch = (
  currentNodes: Ref<NodeInfo[]>,
  selectedRootTaskId: Ref<number | null>,
) => {
  const nodeNavSearchText = ref('')
  // Add debouncing to prevent UI freeze during typing for large logs (e.g. 50MB+)
  const debouncedNodeNavSearchText = ref('')

  let searchTimeout: ReturnType<typeof setTimeout> | null = null
  watch(nodeNavSearchText, (newVal) => {
    if (searchTimeout) clearTimeout(searchTimeout)
    // Avoid delay when clearing the search box
    if (!newVal) {
      debouncedNodeNavSearchText.value = newVal
    } else {
      searchTimeout = setTimeout(() => {
        debouncedNodeNavSearchText.value = newVal
      }, 300)
    }
  })

  const normalizedNodeNavSearchText = computed(() =>
    normalizeSearchText(debouncedNodeNavSearchText.value),
  )
  const nodeNavMode = ref<NodeNavMode>('pipeline')
  const nodeNavFailedOnly = ref(false)

  const rootTaskEntries = computed(() => {
    const entries = currentNodes.value.map((node, originalIndex) => ({ node, originalIndex }))
    const rootTaskId = selectedRootTaskId.value
    if (rootTaskId == null) return entries
    return entries.filter((entry) => entry.node.task_id === rootTaskId)
  })

  const pipelineEntries = computed<SourceEntry[]>(() => {
    return currentNodes.value.map((node, originalIndex) => ({
      navKey: `pipeline:${originalIndex}`,
      node,
      originalIndex,
      primaryText: node.name || '未命名节点',
      primaryMatchKind: 'node',
      navStatus: node.status,
    }))
  })

  const recognitionEntries = computed<SourceEntry[]>(() => {
    const timelineItems = buildNodeExecutionTimeline(currentNodes.value, {
      rootTaskId: selectedRootTaskId.value,
    })
    return timelineItems.map((item, timelineIndex) => ({
      navKey: `recognition:${timelineIndex}:${item.originalIndex}`,
      node: item.nodeInfo,
      originalIndex: item.originalIndex,
      primaryText: item.navName,
      primaryMatchKind: item.matchedRecognitionName ? 'next-list' : 'node',
      navStatus: item.navStatus,
    }))
  })

  const focusEntries = computed<SourceEntry[]>(() => {
    const entries: SourceEntry[] = []
    for (const { node, originalIndex } of rootTaskEntries.value) {
      const nodeFocusCard = buildNodeFocusCardData(node)
      if (nodeFocusCard) {
        const focusPreview = stringifyFocusPreview(node.focus)
        entries.push({
          navKey: `focus:node:${originalIndex}`,
          node,
          originalIndex,
          primaryText: node.name || '未命名节点',
          primaryMatchKind: 'focus',
          navStatus: node.status,
          focusKind: 'node',
          focusDisplay: readFocusCardDisplay(nodeFocusCard.entries),
          matchDetails: [
            { kind: 'node', text: node.name || '未命名节点' },
            { kind: 'focus', text: focusPreview },
          ],
        })
      }

      const flowItems = flattenFlowItems(buildNodeFlowItems(node))
      for (const item of flowItems) {
        if (!hasFocusValue(item.focus)) continue
        const focusKind = getFlowItemFocusKind(item)
        const focusCard =
          focusKind === 'recognition'
            ? buildRecognitionFocusCardData(item, node)
            : focusKind === 'action'
              ? buildActionFocusCardData(item, node)
              : null
        if (!focusCard) continue
        const focusPreview = stringifyFocusPreview(item.focus)
        entries.push({
          navKey: `focus:flow:${originalIndex}:${item.id}`,
          node,
          originalIndex,
          primaryText: item.name || node.name || '未命名节点',
          primaryMatchKind: 'focus',
          navStatus: item.status,
          targetFlowItemId: item.id,
          focusKind,
          focusDisplay: readFocusCardDisplay(focusCard.entries),
          matchDetails: [
            { kind: 'node', text: node.name || '未命名节点' },
            { kind: 'flow', text: item.name || '未命名流程项' },
            { kind: 'focus', text: focusPreview },
          ],
        })
      }
    }
    return entries
  })

  const sourceEntries = computed<SourceEntry[]>(() => {
    if (nodeNavMode.value === 'pipeline') return pipelineEntries.value
    if (nodeNavMode.value === 'next-list-hit') return recognitionEntries.value
    return focusEntries.value
  })

  const appendPrimaryMatches = (entry: SourceEntry, query: string) => {
    const details =
      nodeNavMode.value === 'focus'
        ? query
          ? (entry.matchDetails ?? []).filter((detail) =>
              normalizeNodeNavMatchText(detail.text).includes(query),
            )
          : [...(entry.matchDetails ?? [])]
        : collectNodeNavMatchDetails(entry.node, query)
    if (!query) return details

    const withPrimary = normalizeNodeNavMatchText(entry.primaryText).includes(query)
    if (withPrimary) {
      details.unshift({ kind: entry.primaryMatchKind, text: entry.primaryText })
    }

    return details
  }

  const toggleNodeNavFailedOnly = () => {
    nodeNavFailedOnly.value = !nodeNavFailedOnly.value
  }

  const nodeNavItems = computed<NodeNavViewItem[]>(() => {
    const query = normalizedNodeNavSearchText.value
    return sourceEntries.value
      .map((entry) => ({
        navKey: entry.navKey,
        node: entry.node,
        originalIndex: entry.originalIndex,
        primaryText: entry.primaryText,
        navStatus: entry.navStatus,
        targetFlowItemId: entry.targetFlowItemId,
        focusKind: entry.focusKind,
        focusDisplay: entry.focusDisplay,
        matchDetails: appendPrimaryMatches(entry, query),
      }))
      .map((item) => {
        const matchKinds = getNodeNavMatchKinds(item.matchDetails)
        return {
          ...item,
          matchKinds,
          matchHint: formatNodeNavMatchHint(matchKinds),
          matchPreview: formatNodeNavMatchPreview(item.matchDetails),
        }
      })
      .filter((item) => {
        if (!nodeNavFailedOnly.value) return true
        if (nodeNavMode.value === 'pipeline') {
          return item.navStatus === 'failed'
        }
        if (nodeNavMode.value === 'focus') {
          return item.navStatus === 'failed'
        }
        return (
          item.navStatus === 'failed' ||
          item.navStatus === 'timeout' ||
          item.navStatus === 'action-failed'
        )
      })
      .filter((item) => !query || item.matchDetails.length > 0)
  })

  const nodeNavEmptyDescription = computed(() => {
    if (currentNodes.value.length === 0) return '暂无节点数据'
    if (nodeNavMode.value === 'next-list-hit') {
      if (rootTaskEntries.value.length === 0) return '暂无根层节点数据'
      if (recognitionEntries.value.length === 0) return '暂无识别模式节点'
    }
    if (nodeNavMode.value === 'focus' && focusEntries.value.length === 0) return '暂无 Focus 配置'
    if (normalizedNodeNavSearchText.value) return '未找到匹配节点'
    if (nodeNavFailedOnly.value) {
      if (nodeNavMode.value === 'pipeline') return '暂无失败节点'
      if (nodeNavMode.value === 'focus') return '暂无失败 Focus'
      return '暂无异常状态节点'
    }
    return '暂无节点数据'
  })

  const setNodeNavMode = (mode: NodeNavMode) => {
    nodeNavMode.value = mode
  }

  return {
    nodeNavSearchText,
    normalizedNodeNavSearchText,
    nodeNavFailedOnly,
    nodeNavMode,
    setNodeNavMode,
    toggleNodeNavFailedOnly,
    nodeNavItems,
    nodeNavEmptyDescription,
    formatNodeNavMatchHint,
    formatNodeNavMatchPreview,
  }
}
