import type { Node, Edge } from '@vue-flow/core'
import type ELK from 'elkjs/lib/elk.bundled.js'
import type { TaskInfo, NodeInfo } from '../types'
import { sortNodesByGlobalExecutionOrder } from '@windsland52/maa-log-tools/task-execution-order'
import {
  resolveNodeExecutionName,
  resolveNodeMatchedNextListItem,
} from '@windsland52/maa-log-tools/node-execution-name'

export interface FlowNodeData {
  label: string
  status: 'success' | 'failed' | 'running' | 'not-executed'
  executionOrder: number[]
  nodeInfos: NodeInfo[]
  nodeWidth?: number
  nodeHeight?: number
}

export interface FlowEdgeData {
  executed: boolean
  anchor: boolean
  jump_back: boolean
  edgeStatus: 'success' | 'failed' | 'running' | 'topology'
  transitionType?: 'topology' | 'next' | 'jump-back' | 'on-error' | 'jump-back-return'
  flowMode?: 'none' | 'chevron' | 'dash'
  routePoints?: Array<{ x: number; y: number }>
}

const NODE_MIN_WIDTH = 88
const NODE_HEIGHT = 44
const NODE_HORIZONTAL_PADDING = 20
const NARROW_CHAR_WIDTH = 7
const WIDE_CHAR_WIDTH = 13

const WIDE_CHAR_REGEX = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/u

const estimateLabelWidth = (label: string): number => {
  if (!label) return 0

  let width = 0
  for (const char of label) {
    width += WIDE_CHAR_REGEX.test(char) ? WIDE_CHAR_WIDTH : NARROW_CHAR_WIDTH
  }
  return width
}

const resolveNodeWidth = (label: string): number => {
  return Math.max(NODE_MIN_WIDTH, Math.ceil(estimateLabelWidth(label) + NODE_HORIZONTAL_PADDING))
}

type ElkLayoutEngine = InstanceType<typeof ELK>

let elkPromise: Promise<ElkLayoutEngine> | null = null

const getElk = async (): Promise<ElkLayoutEngine> => {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then((module) => {
      const ElkConstructor = module.default
      return new ElkConstructor()
    })
  }

  return elkPromise
}

interface ElkLayoutNode {
  id: string
  width?: number
  height?: number
  x?: number
  y?: number
  children?: ElkLayoutNode[]
  edges?: ElkLayoutEdge[]
  layoutOptions?: Record<string, string>
}

interface ElkLayoutEdge {
  id: string
  sources: string[]
  targets: string[]
}

export interface BuildFlowchartOptions {
  ignoreUnexecutedNodes?: boolean
}

const hasFailedAction = (node: NodeInfo): boolean => {
  if (node.action_details && node.action_details.success === false) return true
  return (node.node_flow || []).some(
    (item) => (item.type === 'action' || item.type === 'action_node') && item.status === 'failed'
  )
}

const resolveFlowNodeStatus = (
  infos: NodeInfo[] | undefined,
): FlowNodeData['status'] => {
  if (!infos || infos.length === 0) return 'not-executed'

  // Prefer "failed" whenever any execution contains a failed action.
  if (infos.some((info) => info.status === 'failed' || hasFailedAction(info))) {
    return 'failed'
  }

  if (infos.some((info) => info.status === 'running')) {
    return 'running'
  }

  return 'success'
}

export async function buildFlowchartData(task: TaskInfo, options: BuildFlowchartOptions = {}): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const elk = await getElk()
  const orderedNodes = sortNodesByGlobalExecutionOrder(task.nodes)
  const orderedExecutions = orderedNodes.map((node) => ({
    node,
    executionName: resolveNodeExecutionName(node),
    matchedNext: resolveNodeMatchedNextListItem(node),
  }))

  // 1. Collect executed node names with order and info
  const executedNodeMap = new Map<string, { order: number[]; infos: NodeInfo[] }>()
  orderedExecutions.forEach(({ node, executionName }, index) => {
    const existing = executedNodeMap.get(executionName)
    if (existing) {
      existing.order.push(index + 1)
      existing.infos.push(node)
    } else {
      executedNodeMap.set(executionName, { order: [index + 1], infos: [node] })
    }
  })

  const ignoreUnexecutedNodes = options.ignoreUnexecutedNodes === true

  // 2. Collect all node names (optionally keep only executed nodes)
  const allNodeNames = new Set<string>(executedNodeMap.keys())
  if (!ignoreUnexecutedNodes) {
    task.nodes.forEach(node => {
      allNodeNames.add(node.name)
      node.next_list.forEach(next => {
        allNodeNames.add(next.name)
      })
    })
  }

  // 3. Build nodes
  const flowNodes: Node[] = []
  const nodeSizeByName = new Map<string, { width: number; height: number }>()
  allNodeNames.forEach(name => {
    const executed = executedNodeMap.get(name)
    const status = resolveFlowNodeStatus(executed?.infos)
    const nodeWidth = resolveNodeWidth(name)
    const nodeHeight = NODE_HEIGHT

    nodeSizeByName.set(name, {
      width: nodeWidth,
      height: nodeHeight,
    })

    flowNodes.push({
      id: name,
      type: 'flowchartNode',
      position: { x: 0, y: 0 },
      data: {
        label: name,
        status,
        executionOrder: executed?.order ?? [],
        nodeInfos: executed?.infos ?? [],
        nodeWidth,
        nodeHeight,
      } satisfies FlowNodeData,
    })
  })

  // 4. Build edges
  const flowEdges: Edge[] = []
  const flowEdgeById = new Map<string, Edge>()
  const edgeSet = new Set<string>()

  const toEdgeStatus = (status: NodeInfo['status']): FlowEdgeData['edgeStatus'] => {
    return status === 'failed'
      ? 'failed'
      : status === 'running'
        ? 'running'
        : 'success'
  }

  const upsertExecutedEdge = (
    source: string,
    target: string,
    toNodeStatus: FlowEdgeData['edgeStatus'],
    transitionType: Exclude<NonNullable<FlowEdgeData['transitionType']>, 'topology'>,
  ) => {
    if (!source || !target || source === target) return

    const edgeId = `${source}->${target}`
    const existing = flowEdgeById.get(edgeId)

    if (existing) {
      existing.data = {
        ...(existing.data as FlowEdgeData),
        executed: true,
        edgeStatus: toNodeStatus,
        transitionType,
      }
      return
    }

    const flowEdge: Edge = {
      id: edgeId,
      source,
      target,
      data: {
        executed: true,
        anchor: false,
        jump_back: false,
        edgeStatus: toNodeStatus,
        transitionType,
      } satisfies FlowEdgeData,
    }
    flowEdges.push(flowEdge)
    flowEdgeById.set(edgeId, flowEdge)
  }

  // Topology edges from next_list
  task.nodes.forEach(node => {
    node.next_list.forEach(next => {
      if (!allNodeNames.has(node.name) || !allNodeNames.has(next.name)) return
      const edgeId = `${node.name}->${next.name}`
      if (edgeSet.has(edgeId)) return
      edgeSet.add(edgeId)

      const flowEdge: Edge = {
        id: edgeId,
        source: node.name,
        target: next.name,
        data: {
          executed: false,
          anchor: next.anchor,
          jump_back: next.jump_back,
          edgeStatus: 'topology',
          transitionType: 'topology',
        } satisfies FlowEdgeData,
      }
      flowEdges.push(flowEdge)
      flowEdgeById.set(edgeId, flowEdge)
    })
  })

  // Execution edges: consecutive nodes
  const jumpbackStack: string[] = []

  for (let i = 0; i < orderedExecutions.length - 1; i++) {
    const current = orderedExecutions[i]
    const nextExecution = orderedExecutions[i + 1]

    const currentParentName = current.node.name
    const currentIsFailed = current.node.status === 'failed'
    const currentIsJumpBackHit =
      !currentIsFailed &&
      current.matchedNext?.nextItem.jump_back === true &&
      !!currentParentName

    if (currentIsJumpBackHit) {
      jumpbackStack.push(currentParentName)
    }

    const stackTop = jumpbackStack.length > 0 ? jumpbackStack[jumpbackStack.length - 1] : undefined
    const returnedToJumpPoint =
      !currentIsFailed &&
      !!stackTop &&
      nextExecution.node.name === stackTop &&
      allNodeNames.has(stackTop)

    const toNodeStatus = toEdgeStatus(nextExecution.node.status)

    if (returnedToJumpPoint) {
      // Last node in jump_back path returns to the jump point.
      upsertExecutedEdge(current.executionName, stackTop, toNodeStatus, 'jump-back-return')

      // Then parent context continues from its own next-list hit.
      const reenterTransitionType = nextExecution.matchedNext?.nextItem.jump_back === true
        ? 'jump-back'
        : 'next'
      upsertExecutedEdge(stackTop, nextExecution.executionName, toNodeStatus, reenterTransitionType)

      jumpbackStack.pop()
      continue
    }

    const transitionType = currentIsFailed
      ? 'on-error'
      : currentIsJumpBackHit
        ? 'jump-back'
        : 'next'

    upsertExecutedEdge(current.executionName, nextExecution.executionName, toNodeStatus, transitionType)
  }

  // 5. ELK layout (layout calculation only)
  const elkGraph: ElkLayoutNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.edgeNode': '25',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.unnecessaryBendpoints': 'false',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: flowNodes.map(node => ({
      id: node.id,
      width: nodeSizeByName.get(node.id)?.width ?? NODE_MIN_WIDTH,
      height: nodeSizeByName.get(node.id)?.height ?? NODE_HEIGHT,
    })),
    edges: flowEdges.map(edge => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }

  const layouted = await elk.layout(elkGraph)

  // Apply positions; fallback keeps previous zero positions if ELK omits a node
  const positionedMap = new Map((layouted.children ?? []).map(n => [n.id, n]))
  flowNodes.forEach(node => {
    const positioned = positionedMap.get(node.id)
    if (positioned && typeof positioned.x === 'number' && typeof positioned.y === 'number') {
      node.position = {
        x: positioned.x,
        y: positioned.y,
      }
    }
  })

  // Apply ELK orthogonal edge route points
  const edgeMap = new Map<string, any>((layouted.edges ?? []).map((e: any) => [e.id, e]))
  flowEdges.forEach(edge => {
    const layoutEdge = edgeMap.get(edge.id)
    const section = layoutEdge?.sections?.[0]
    if (!section) return

    const points: Array<{ x: number; y: number }> = []
    if (section.startPoint && typeof section.startPoint.x === 'number' && typeof section.startPoint.y === 'number') {
      points.push({ x: section.startPoint.x, y: section.startPoint.y })
    }
    if (Array.isArray(section.bendPoints)) {
      section.bendPoints.forEach((p: { x?: unknown; y?: unknown }) => {
        if (typeof p.x === 'number' && typeof p.y === 'number') {
          points.push({ x: p.x, y: p.y })
        }
      })
    }
    if (section.endPoint && typeof section.endPoint.x === 'number' && typeof section.endPoint.y === 'number') {
      points.push({ x: section.endPoint.x, y: section.endPoint.y })
    }

    if (points.length >= 2) {
      // Remove consecutive duplicate points to avoid zero-length segments.
      const deduped = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
      edge.data = {
        ...(edge.data as FlowEdgeData),
        routePoints: deduped,
      } satisfies FlowEdgeData
      edge.type = 'orthogonalEdge'
    }
  })

  return { nodes: flowNodes, edges: flowEdges }
}

