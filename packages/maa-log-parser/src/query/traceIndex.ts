import type { ProtocolEvent } from '../protocol/types'
import { readScopeIdentityFields } from '../trace/scopeId'
import type { ScopeNode } from '../trace/scopeTypes'
import { buildTaskLocalKey, buildTaskNodeKey } from './locator'
import type { NodeExecutionRef, TaskLocalKey, TaskNodeKey } from './queryTypes'

export interface TraceIndex {
  scopeById: Map<string, ScopeNode>
  eventBySeq: Map<number, ProtocolEvent>
  parentScopeIdByScopeId: Map<string, string | null>
  childScopeIdsByScopeId: Map<string, string[]>

  taskScopesByTaskId: Map<number, ScopeNode[]>
  pipelineNodeScopesByTaskIdAndNodeId: Map<TaskNodeKey, ScopeNode[]>
  recognitionScopesByTaskIdAndRecoId: Map<TaskLocalKey, ScopeNode[]>
  actionScopesByTaskIdAndActionId: Map<TaskLocalKey, ScopeNode[]>
  waitFreezesScopesByTaskIdAndWfId: Map<TaskLocalKey, ScopeNode[]>

  nodeExecutionsByTaskIdAndNodeId: Map<TaskNodeKey, NodeExecutionRef[]>
  nodeExecutionByPipelineScopeId: Map<string, NodeExecutionRef>

  controllerScopes: ScopeNode[]
  resourceScopes: ScopeNode[]
}

const pushMapArray = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const current = map.get(key)
  if (current) {
    current.push(value)
    return
  }

  map.set(key, [value])
}

const sortScopesBySeq = (scopes: ScopeNode[]): void => {
  scopes.sort((left, right) => left.seq - right.seq)
}

export const createEmptyTraceIndex = (): TraceIndex => ({
  scopeById: new Map(),
  eventBySeq: new Map(),
  parentScopeIdByScopeId: new Map(),
  childScopeIdsByScopeId: new Map(),
  taskScopesByTaskId: new Map(),
  pipelineNodeScopesByTaskIdAndNodeId: new Map(),
  recognitionScopesByTaskIdAndRecoId: new Map(),
  actionScopesByTaskIdAndActionId: new Map(),
  waitFreezesScopesByTaskIdAndWfId: new Map(),
  nodeExecutionsByTaskIdAndNodeId: new Map(),
  nodeExecutionByPipelineScopeId: new Map(),
  controllerScopes: [],
  resourceScopes: [],
})

const indexScopeNode = (node: ScopeNode, index: TraceIndex): void => {
  const identity = readScopeIdentityFields(node.payload)
  const taskId = node.taskId ?? identity.taskId

  switch (node.kind) {
    case 'task':
      if (taskId != null) {
        pushMapArray(index.taskScopesByTaskId, taskId, node)
      }
      return
    case 'pipeline_node':
      if (taskId != null && identity.nodeId != null) {
        pushMapArray(
          index.pipelineNodeScopesByTaskIdAndNodeId,
          buildTaskNodeKey(taskId, identity.nodeId),
          node,
        )
        pushMapArray(
          index.nodeExecutionsByTaskIdAndNodeId,
          buildTaskNodeKey(taskId, identity.nodeId),
          {
            taskId,
            nodeId: identity.nodeId,
            occurrenceIndex: 0,
            pipelineScopeId: node.id,
            startSeq: node.seq,
            endSeq: node.endSeq,
          },
        )
      }
      return
    case 'recognition':
      if (taskId != null && identity.recoId != null) {
        pushMapArray(
          index.recognitionScopesByTaskIdAndRecoId,
          buildTaskLocalKey(taskId, identity.recoId),
          node,
        )
      }
      return
    case 'action':
      if (taskId != null && identity.actionId != null) {
        pushMapArray(
          index.actionScopesByTaskIdAndActionId,
          buildTaskLocalKey(taskId, identity.actionId),
          node,
        )
      }
      return
    case 'wait_freezes':
      if (taskId != null && identity.wfId != null) {
        pushMapArray(
          index.waitFreezesScopesByTaskIdAndWfId,
          buildTaskLocalKey(taskId, identity.wfId),
          node,
        )
      }
      return
    case 'controller_action':
      index.controllerScopes.push(node)
      return
    case 'resource_loading':
      index.resourceScopes.push(node)
      return
    default:
      return
  }
}

const walkScopeTree = (root: ScopeNode, index: TraceIndex): void => {
  // 显式栈：作用域树会退化成上万层的链（成批缺失终止事件），递归版在这里直接 RangeError。
  // 先序访问顺序与递归版逐条一致（逆序入栈）。
  const stack: Array<{ node: ScopeNode; parentScopeId: string | null }> = [
    { node: root, parentScopeId: null },
  ]

  while (stack.length > 0) {
    const { node, parentScopeId } = stack.pop() as {
      node: ScopeNode
      parentScopeId: string | null
    }
    index.scopeById.set(node.id, node)
    index.parentScopeIdByScopeId.set(node.id, parentScopeId)

    const sortedChildren = [...node.children].sort((left, right) => left.seq - right.seq)
    index.childScopeIdsByScopeId.set(
      node.id,
      sortedChildren.map((child) => child.id),
    )
    indexScopeNode(node, index)

    for (let childIndex = sortedChildren.length - 1; childIndex >= 0; childIndex -= 1) {
      const child = sortedChildren[childIndex]
      if (child) stack.push({ node: child, parentScopeId: node.id })
    }
  }
}

const finalizeNodeExecutions = (index: TraceIndex): void => {
  for (const scopes of index.taskScopesByTaskId.values()) {
    sortScopesBySeq(scopes)
  }
  for (const scopes of index.pipelineNodeScopesByTaskIdAndNodeId.values()) {
    sortScopesBySeq(scopes)
  }
  for (const scopes of index.recognitionScopesByTaskIdAndRecoId.values()) {
    sortScopesBySeq(scopes)
  }
  for (const scopes of index.actionScopesByTaskIdAndActionId.values()) {
    sortScopesBySeq(scopes)
  }
  for (const scopes of index.waitFreezesScopesByTaskIdAndWfId.values()) {
    sortScopesBySeq(scopes)
  }

  index.controllerScopes.sort((left, right) => left.seq - right.seq)
  index.resourceScopes.sort((left, right) => left.seq - right.seq)

  for (const executions of index.nodeExecutionsByTaskIdAndNodeId.values()) {
    executions.sort((left, right) => left.startSeq - right.startSeq)
    executions.forEach((execution, indexInBucket) => {
      execution.occurrenceIndex = indexInBucket + 1
      index.nodeExecutionByPipelineScopeId.set(execution.pipelineScopeId, execution)
    })
  }
}

export const buildTraceIndex = (root: ScopeNode, events: ProtocolEvent[] = []): TraceIndex => {
  const index = createEmptyTraceIndex()

  for (const event of events) {
    index.eventBySeq.set(event.seq, event)
  }

  walkScopeTree(root, index)
  finalizeNodeExecutions(index)
  return index
}
