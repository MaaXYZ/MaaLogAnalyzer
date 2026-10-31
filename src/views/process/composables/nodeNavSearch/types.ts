import type { NodeInfo } from '../../../../types'
import type { NodeExecutionNavStatus } from '@windsland52/maa-log-tools/node-execution-timeline'

export type NodeNavMatchKind = 'node' | 'next-list' | 'flow' | 'focus'
/**
 * 节点导航状态。
 *
 * 比时间线的 NodeExecutionNavStatus 多一个 'not-hit'：识别未命中（节点 failed，但失败发生在识别
 * 阶段、有识别尝试却没有任何 next_list 命中）与「节点执行失败」是两种语义。混用会让
 * 「任务成功 + 节点红点 + 统计记失败」三处互相打脸（small.log 任务 #2）。
 */
export type NodeNavStatus = NodeExecutionNavStatus | 'not-hit'
export type NodeNavFocusKind = 'node' | 'recognition' | 'action' | 'flow'

export interface NodeNavMatchDetail {
  kind: NodeNavMatchKind
  text: string
}

export interface NodeNavViewItem {
  navKey: string
  node: NodeInfo
  originalIndex: number
  primaryText: string
  navStatus: NodeNavStatus
  targetFlowItemId?: string
  focusKind?: NodeNavFocusKind
  focusDisplay?: string
  matchDetails: NodeNavMatchDetail[]
  matchKinds: NodeNavMatchKind[]
  matchHint: string
  matchPreview: string
}
