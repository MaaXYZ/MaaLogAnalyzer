import type { MergedRecognitionItem, NodeInfo, UnifiedFlowItem } from '../../types'

export type StatusButtonType = 'default' | 'info' | 'success' | 'warning'
export type ResultStatusButtonType = 'success' | 'warning' | 'error'
export type NodeFlowStatus = NodeInfo['status'] | UnifiedFlowItem['status']
export type NodeCardStatus = NodeFlowStatus | MergedRecognitionItem['status']

export const resolveStatusButtonType = (status: NodeCardStatus): StatusButtonType => {
  if (status === 'success') return 'success'
  // 运行中使用 warning（橙），与状态圆点、minimap、runtimeStatus 统一；info 只留给中性信息
  if (status === 'running') return 'warning'
  if (status === 'failed') return 'warning'
  return 'default'
}

export const resolveResultStatusButtonType = (status: NodeCardStatus): ResultStatusButtonType => {
  if (status === 'success') return 'success'
  if (status === 'running') return 'warning'
  return 'error'
}
