import type {
  NestedActionGroup,
  NestedActionNode,
  NodeInfo,
  RecognitionAttempt,
  UnifiedFlowItem,
} from '../shared/types'
import { StringPool } from '../shared/stringPool'

export const summarizeRuntimeStatus = <T extends { status: UnifiedFlowItem['status'] }>(
  items: readonly T[],
): UnifiedFlowItem['status'] => {
  if (items.some((item) => item.status === 'failed')) return 'failed'
  if (items.some((item) => item.status === 'running')) return 'running'
  return 'success'
}

export type SubTaskActionSnapshot = {
  action_id: number | undefined
  name: string
  ts: string
  end_ts?: string
  status: 'success' | 'failed' | 'running'
  action_details?: NodeInfo['action_details']
}

type SubTaskPipelineNodeSnapshot = NestedActionNode

/**
 * Sub-task event collector that manages non-current-task Recognition/Action/PipelineNode events.
 */
export class SubTaskCollector {
  private recognitions = new Map<number, RecognitionAttempt[]>()
  private recognitionNodes = new Map<number, RecognitionAttempt[]>()
  private actions = new Map<number, SubTaskActionSnapshot[]>()
  private pipelineNodes = new Map<number, SubTaskPipelineNodeSnapshot[]>()

  addRecognition(taskId: number, attempt: RecognitionAttempt): void {
    if (!this.recognitions.has(taskId)) {
      this.recognitions.set(taskId, [])
    }
    this.recognitions.get(taskId)!.push(attempt)
  }

  addAction(taskId: number, action: SubTaskActionSnapshot): void {
    if (!this.actions.has(taskId)) {
      this.actions.set(taskId, [])
    }
    this.actions.get(taskId)!.push(action)
  }

  addPipelineNode(taskId: number, node: SubTaskPipelineNodeSnapshot): void {
    if (!this.pipelineNodes.has(taskId)) {
      this.pipelineNodes.set(taskId, [])
    }
    this.pipelineNodes.get(taskId)!.push(node)
  }

  consumeRecognitions(taskId: number): RecognitionAttempt[] {
    const result = this.recognitions.get(taskId) || []
    this.recognitions.delete(taskId)
    return result
  }

  addRecognitionNode(taskId: number, attempt: RecognitionAttempt): void {
    if (!this.recognitionNodes.has(taskId)) {
      this.recognitionNodes.set(taskId, [])
    }
    this.recognitionNodes.get(taskId)!.push(attempt)
  }

  consumeRecognitionNodes(taskId: number): RecognitionAttempt[] {
    const result = this.recognitionNodes.get(taskId) || []
    this.recognitionNodes.delete(taskId)
    return result
  }

  consumeOrphanRecognitionNodes(): RecognitionAttempt[] {
    const result: RecognitionAttempt[] = []
    for (const recognitions of this.recognitionNodes.values()) {
      result.push(...recognitions)
    }
    this.recognitionNodes.clear()
    return result
  }

  consumeOrphanRecognitions(): RecognitionAttempt[] {
    const result: RecognitionAttempt[] = []
    for (const recognitions of this.recognitions.values()) {
      result.push(...recognitions)
    }
    this.recognitions.clear()
    return result
  }

  consumeActions(taskId: number): SubTaskActionSnapshot[] {
    const result = this.actions.get(taskId) || []
    this.actions.delete(taskId)
    return result
  }

  peekActions(taskId: number): SubTaskActionSnapshot[] {
    return this.actions.get(taskId) || []
  }

  /** Convert collected sub-task pipeline nodes to NestedActionGroup[] format. */
  consumeAsNestedActionGroups(stringPool: StringPool): NestedActionGroup[] {
    const groups = Array.from(this.pipelineNodes.entries()).map(([taskId, nodes]) => {
      return {
        task_id: taskId,
        name: stringPool.intern(nodes[0]?.name || 'SubTask'),
        ts: stringPool.intern(nodes[0]?.ts || ''),
        status: summarizeRuntimeStatus(nodes),
        nested_actions: nodes,
      }
    })
    this.pipelineNodes.clear()
    return groups
  }

  /** Read current sub-task pipeline snapshots without consuming internal state. */
  peekAsNestedActionGroups(stringPool: StringPool): NestedActionGroup[] {
    return Array.from(this.pipelineNodes.entries()).map(([taskId, nodes]) => {
      return {
        task_id: taskId,
        name: stringPool.intern(nodes[0]?.name || 'SubTask'),
        ts: stringPool.intern(nodes[0]?.ts || ''),
        status: summarizeRuntimeStatus(nodes),
        nested_actions: nodes,
      }
    })
  }

  clear(): void {
    this.recognitions.clear()
    this.recognitionNodes.clear()
    this.actions.clear()
    this.pipelineNodes.clear()
  }
}
