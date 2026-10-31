import type { NodeInfo } from '../../../../types'
import { buildNodeRecognitionAttempts } from '@windsland52/maa-log-parser/node-flow'
import { resolveNodeMatchedRecognitionName } from '@windsland52/maa-log-tools/node-execution-name'
import {
  isNodeActionFailed,
  type NodeExecutionNavStatus,
} from '@windsland52/maa-log-tools/node-execution-timeline'
import type { NodeNavStatus } from './types'

/**
 * 识别未命中：节点最终 failed，但失败发生在识别阶段——有识别尝试记录、没有任何 next_list 命中，
 * 且不是动作失败。
 *
 * 为什么值得单列：small.log 的任务 #2 卡片写「成功」，节点导航却给红点，运行统计又把它记成
 * 3 成功 / 1 失败，三处自相矛盾。这类「没识别到」并不代表节点执行逻辑出错，任务整体仍可能成功，
 * 所以要有一个区别于 failed 的状态值，而不是被读成节点失败。
 * 为什么要求「有识别尝试记录」：日志被截断或缺失 node_flow 的失败节点没有证据证明是未命中，
 * 继续标 failed 更保守，避免把真正的执行失败洗白。
 */
export const isNodeRecognitionNotHit = (node: NodeInfo): boolean => {
  if (node.status !== 'failed') return false
  if (isNodeActionFailed(node)) return false
  if (resolveNodeMatchedRecognitionName(node)) return false
  return buildNodeRecognitionAttempts(node).length > 0
}

/** 节点级状态（pipeline / focus 模式）：把识别未命中从 failed 里拆出来 */
export const resolveNodeNavStatus = (node: NodeInfo): NodeNavStatus =>
  isNodeRecognitionNotHit(node) ? 'not-hit' : node.status

/**
 * 时间线状态（识别命中模式）：maa-log-tools 的 timeout / failed 是「渲染用的状态」，
 * 这里再用同一条判据补上证据要求——没有识别尝试记录的失败保持原状态，不并入未命中。
 */
export const resolveTimelineNavStatus = (
  timelineStatus: NodeExecutionNavStatus,
  node: NodeInfo,
): NodeNavStatus =>
  (timelineStatus === 'timeout' || timelineStatus === 'failed') && isNodeRecognitionNotHit(node)
    ? 'not-hit'
    : timelineStatus
