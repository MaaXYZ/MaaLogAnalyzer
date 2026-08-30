import type { UnifiedFlowItem } from '../types'

const FLOW_ITEM_SHORT_LABELS: Partial<Record<UnifiedFlowItem['type'], string>> = {
  task: 'T',
  pipeline_node: 'P',
  resource_loading: 'RL',
  recognition: 'R',
  recognition_node: 'RN',
  wait_freezes: 'WF',
  action: 'A',
  action_node: 'AN',
}

export const getFlowItemShortLabel = (type: UnifiedFlowItem['type']): string => {
  return FLOW_ITEM_SHORT_LABELS[type] ?? type
}

export type FlowItemButtonType = 'success' | 'warning' | 'error' | 'info'

export const getFlowItemButtonType = (
  item: Pick<UnifiedFlowItem, 'status' | 'type'>,
): FlowItemButtonType => {
  if (item.status === 'success') return 'success'
  if (item.status === 'running') return 'info'
  if (
    item.type === 'recognition' ||
    item.type === 'recognition_node' ||
    item.type === 'wait_freezes' ||
    item.type === 'resource_loading'
  ) {
    return 'warning'
  }
  return 'error'
}
