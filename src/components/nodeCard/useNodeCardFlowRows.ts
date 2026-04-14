import { computed, type Ref } from 'vue'
import type { NodeInfo, UnifiedFlowItem } from '../../types'
import {
  buildNodeActionRepeatCount,
  buildNodeActionRootItem,
  buildNodeActionTimelineItems,
  buildNodeRecognitionFlowItems,
} from '@windsland52/maa-log-parser/node-flow'
import { flattenFlowItems } from '../../utils/flowTree'

interface UseNodeCardFlowRowsParams {
  node: Ref<NodeInfo>
  isActionFlowItemExpanded: (flowItemId: string) => boolean
  isRecognitionNestedFlowItemExpanded: (flowItemId: string) => boolean
}

export const useNodeCardFlowRows = (params: UseNodeCardFlowRowsParams) => {
  const actionRootItem = computed(() => buildNodeActionRootItem(params.node.value))
  const actionRepeatCount = computed(() => buildNodeActionRepeatCount(params.node.value))
  const actionTimelineItems = computed(() => buildNodeActionTimelineItems(params.node.value))
  const actionTimelineRows = computed(() =>
    flattenFlowItems(actionTimelineItems.value, params.isActionFlowItemExpanded)
  )

  const recognitionRootFlowItems = computed(() => buildNodeRecognitionFlowItems(params.node.value))
  const recognitionNestedRowsByAttemptIndex = computed(() => {
    const rowsByIndex = new Map<number, ReturnType<typeof flattenFlowItems>>()
    recognitionRootFlowItems.value.forEach((item, index) => {
      const children = item.children ?? []
      if (children.length === 0) return
      rowsByIndex.set(
        index,
        flattenFlowItems(children, params.isRecognitionNestedFlowItemExpanded, 1)
      )
    })
    return rowsByIndex
  })
  const getRecognitionNestedRows = (attemptIndex: number) =>
    recognitionNestedRowsByAttemptIndex.value.get(attemptIndex) ?? []
  const hasRecognitionNestedRows = (attemptIndex: number): boolean =>
    getRecognitionNestedRows(attemptIndex).length > 0

  const waitFreezesItems = computed(() =>
    flattenFlowItems(actionTimelineItems.value, () => true)
      .map(row => row.item)
      .filter(item => item.type === 'wait_freezes')
  )
  const repeatWaitFreezesIndexById = computed<Map<string, number>>(() => {
    const indexById = new Map<string, number>()
    let repeatIndex = 0
    for (const item of waitFreezesItems.value) {
      if (item.wait_freezes_details?.phase === 'repeat') {
        repeatIndex += 1
        indexById.set(item.id, repeatIndex)
      }
    }
    return indexById
  })

  const formatWaitFreezesMeta = (item: UnifiedFlowItem): string => {
    const phase = item.wait_freezes_details?.phase
    const elapsed = item.wait_freezes_details?.elapsed
    const suffix: string[] = []
    if (phase) {
      if (phase === 'repeat') {
        const repeatIndex = repeatWaitFreezesIndexById.value.get(item.id)
        suffix.push(repeatIndex ? `repeat#${repeatIndex}` : phase)
      } else {
        suffix.push(phase)
      }
    }
    if (typeof elapsed === 'number') suffix.push(`${elapsed}ms`)
    return suffix.length > 0 ? ` · ${suffix.join(' · ')}` : ''
  }

  const formatActionDisplayName = (name: string): string => {
    const repeatCount = actionRepeatCount.value
    if (repeatCount && repeatCount > 1) {
      return `${name} ×${repeatCount}`
    }
    return name
  }
  const getActionTimelineItemDisplayName = (item: UnifiedFlowItem): string => {
    if (item.type !== 'action' && item.type !== 'action_node') return item.name
    if (actionRootItem.value && item.id !== actionRootItem.value.id) return item.name
    return formatActionDisplayName(item.name)
  }

  const hasActionSection = computed(() =>
    actionTimelineItems.value.length > 0 || !!params.node.value.action_details
  )
  const hasActionNestedChildren = computed(() => actionTimelineRows.value.length > 0)

  return {
    actionTimelineRows,
    getRecognitionNestedRows,
    hasRecognitionNestedRows,
    formatWaitFreezesMeta,
    getActionTimelineItemDisplayName,
    hasActionSection,
    hasActionNestedChildren,
  }
}
