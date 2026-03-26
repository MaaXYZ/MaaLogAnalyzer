import { computed, ref, type Ref } from 'vue'
import type { NodeInfo } from '../../../types'
import {
  collectNodeNavMatchDetails,
  getNodeNavMatchKinds,
  normalizeSearchText,
} from './nodeNavSearch/match'
import {
  formatNodeNavMatchHint,
  formatNodeNavMatchPreview,
} from './nodeNavSearch/format'
import type { NodeNavViewItem } from './nodeNavSearch/types'

export type {
  NodeNavMatchDetail,
  NodeNavMatchKind,
  NodeNavViewItem,
} from './nodeNavSearch/types'

export const useNodeNavSearch = (currentNodes: Ref<NodeInfo[]>) => {
  const nodeNavSearchText = ref('')
  const normalizedNodeNavSearchText = computed(() => normalizeSearchText(nodeNavSearchText.value))
  const nodeNavFailedOnly = ref(false)

  const toggleNodeNavFailedOnly = () => {
    nodeNavFailedOnly.value = !nodeNavFailedOnly.value
  }

  const nodeNavItems = computed<NodeNavViewItem[]>(() => {
    const query = normalizedNodeNavSearchText.value
    return currentNodes.value
      .map((node, originalIndex) => ({
        node,
        originalIndex,
        matchDetails: collectNodeNavMatchDetails(node, query),
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
      .filter((item) => !nodeNavFailedOnly.value || item.node.status === 'failed')
      .filter((item) => !query || item.matchDetails.length > 0)
  })

  const nodeNavEmptyDescription = computed(() => {
    if (currentNodes.value.length === 0) return '暂无节点数据'
    if (normalizedNodeNavSearchText.value) return '未找到匹配节点'
    if (nodeNavFailedOnly.value) return '暂无失败节点'
    return '暂无节点数据'
  })

  return {
    nodeNavSearchText,
    normalizedNodeNavSearchText,
    nodeNavFailedOnly,
    toggleNodeNavFailedOnly,
    nodeNavItems,
    nodeNavEmptyDescription,
    formatNodeNavMatchHint,
    formatNodeNavMatchPreview,
  }
}
