import type { NodeInfo } from '../types'

export type RuntimeStatus = NodeInfo['status']
export type RuntimeStatusTagType = 'default' | 'success' | 'warning' | 'error' | 'info'

interface RuntimeStatusTagTypeOptions {
  successType?: RuntimeStatusTagType
  runningType?: RuntimeStatusTagType
  failedType?: RuntimeStatusTagType
}

export const getRuntimeStatusText = (status: RuntimeStatus): string => {
  if (status === 'success') return '成功'
  if (status === 'running') return '运行中'
  return '失败'
}

export const getRuntimeStatusTagType = (
  status: RuntimeStatus,
  options: RuntimeStatusTagTypeOptions = {}
): RuntimeStatusTagType => {
  if (status === 'success') return options.successType ?? 'success'
  if (status === 'running') return options.runningType ?? 'warning'
  return options.failedType ?? 'error'
}
