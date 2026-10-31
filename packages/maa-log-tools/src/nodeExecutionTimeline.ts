import type { NodeInfo } from '@windsland52/maa-log-parser/types'
import { resolveNodeExecutionName, resolveNodeMatchedRecognitionName } from './nodeExecutionName'
import { sortNodesByGlobalExecutionOrder } from './taskExecutionOrder'

export type NodeExecutionNavStatus = NodeInfo['status'] | 'timeout' | 'action-failed'

export interface NodeExecutionTimelineItem {
  index: number
  originalIndex: number
  /** 该节点本次命中的跳转目标（画布联动用），未命中时回退为节点自身名字 */
  executionName: string
  /** 列表展示名：本次真正执行的节点名 + 状态标记（见 resolveNavStatusLabel） */
  navName: string
  navStatus: NodeExecutionNavStatus
  focusNodeId: string
  ts: string
  nodeInfo: NodeInfo
  matchedRecognitionName?: string
}

export interface BuildNodeExecutionTimelineOptions {
  rootTaskId?: number | null
}

/**
 * 该节点是否属于「动作失败」（与「识别未命中」相对）。
 * 导出给应用层复用：节点导航要按同一条规则把 failed 拆成 not-hit / failed，
 * 两处各写一份判据迟早会漂移。
 */
export const isNodeActionFailed = (node: NodeInfo): boolean => {
  if (node.action_details && node.action_details.success === false) return true
  return (node.node_flow || []).some(
    (item) => (item.type === 'action' || item.type === 'action_node') && item.status === 'failed',
  )
}

/**
 * 执行顺序列表要显示的状态标记。
 *
 * 为什么把状态写进名字而不是替换名字：旧实现用「未命中（识别超时）」这样的状态词顶替节点名，
 * 用户在列表里拿不到节点名，也就没法去 pipeline 里搜；改成「真实节点名（状态）」后名字仍可搜索，
 * 状态也没有丢。为什么标记要短：左侧执行顺序面板很窄，长节点名后面再加长标记会被省略号吃掉
 * 「（识别未命中）」，宁可先用「未命中」这类短词，细节交给圆点与节点导航的标签。
 * 为什么只给非 success 加标记：success 由圆点表达即可，满屏后缀反而噪声。
 */
const resolveNavStatusLabel = (status: NodeExecutionNavStatus): string | undefined => {
  if (status === 'action-failed') return '动作失败'
  if (status === 'timeout') return '未命中'
  if (status === 'running') return '运行中'
  if (status === 'failed') return '失败'
  return undefined
}

const appendNavStatusLabel = (name: string, status: NodeExecutionNavStatus): string => {
  const label = resolveNavStatusLabel(status)
  return label ? `${name}（${label}）` : name
}

/**
 * 节点自身名字（本次真正执行的那个节点）。
 *
 * 为什么不直接用 resolveNodeExecutionName：它返回的是 next_list 里命中的**下一个**节点名
 * （画布联动需要这个语义），拿它当列表标题会让执行顺序与节点时间线逐项错位一格。
 */
const resolveNodeName = (node: NodeInfo): string => node.name || '未命名节点'

export const buildNodeExecutionTimeline = (
  nodes: readonly NodeInfo[],
  options: BuildNodeExecutionTimelineOptions = {},
): NodeExecutionTimelineItem[] => {
  const originalIndexByNode = new Map<NodeInfo, number>()
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (!node || originalIndexByNode.has(node)) continue
    originalIndexByNode.set(node, index)
  }

  const filteredNodes =
    options.rootTaskId == null
      ? [...nodes]
      : nodes.filter((node) => node.task_id === options.rootTaskId)
  const orderedNodes = sortNodesByGlobalExecutionOrder(filteredNodes)

  return orderedNodes.map((node, index) => {
    const executionName = resolveNodeExecutionName(node)
    const nodeName = resolveNodeName(node)
    const matchedRecognitionName = resolveNodeMatchedRecognitionName(node)
    const focusNodeId = matchedRecognitionName ?? executionName
    const originalIndex = originalIndexByNode.get(node) ?? index

    let navStatus: NodeExecutionNavStatus = node.status
    if (matchedRecognitionName && isNodeActionFailed(node)) {
      navStatus = 'action-failed'
    } else if (!matchedRecognitionName && node.status === 'failed') {
      // 失败但没有命中任何 next_list 项 = 识别阶段没等到命中（超时/未命中），
      // 与「动作失败」是两种语义：任务可能整体仍然成功（small.log 任务 #2 就是如此）。
      navStatus = 'timeout'
    }

    return {
      index,
      originalIndex,
      executionName,
      navName: appendNavStatusLabel(nodeName, navStatus),
      navStatus,
      focusNodeId,
      ts: node.ts,
      nodeInfo: node,
      matchedRecognitionName,
    }
  })
}
