import type { Node, Edge } from '@vue-flow/core'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { TaskInfo, NodeInfo } from '../types'

export interface FlowNodeData {
  label: string
  status: 'success' | 'failed' | 'not-executed'
  executionOrder: number[]
  nodeInfos: NodeInfo[]
}

export interface FlowEdgeData {
  executed: boolean
  anchor: boolean
  jump_back: boolean
  edgeStatus: 'success' | 'failed' | 'topology'
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 60

const elk = new ELK()

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

export async function buildFlowchartData(task: TaskInfo): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // 1. Collect executed node names with order and info
  const executedNodeMap = new Map<string, { order: number[]; infos: NodeInfo[] }>()
  task.nodes.forEach((node, index) => {
    const existing = executedNodeMap.get(node.name)
    if (existing) {
      existing.order.push(index + 1)
      existing.infos.push(node)
    } else {
      executedNodeMap.set(node.name, { order: [index + 1], infos: [node] })
    }
  })

  // 2. Collect all node names from next_list (unexecuted placeholders)
  const allNodeNames = new Set<string>(executedNodeMap.keys())
  task.nodes.forEach(node => {
    node.next_list.forEach(next => {
      allNodeNames.add(next.name)
    })
  })

  // 3. Build nodes
  const flowNodes: Node[] = []
  allNodeNames.forEach(name => {
    const executed = executedNodeMap.get(name)
    let status: FlowNodeData['status'] = 'not-executed'
    if (executed) {
      const lastInfo = executed.infos[executed.infos.length - 1]
      status = lastInfo.status === 'failed' ? 'failed' : 'success'
    }

    flowNodes.push({
      id: name,
      type: 'flowchartNode',
      position: { x: 0, y: 0 },
      data: {
        label: name,
        status,
        executionOrder: executed?.order ?? [],
        nodeInfos: executed?.infos ?? [],
      } satisfies FlowNodeData,
    })
  })

  // 4. Build edges
  const flowEdges: Edge[] = []
  const edgeSet = new Set<string>()

  // Topology edges from next_list
  task.nodes.forEach(node => {
    node.next_list.forEach(next => {
      const edgeId = `${node.name}->${next.name}`
      if (edgeSet.has(edgeId)) return
      edgeSet.add(edgeId)

      flowEdges.push({
        id: edgeId,
        source: node.name,
        target: next.name,
        data: {
          executed: false,
          anchor: next.anchor,
          jump_back: next.jump_back,
          edgeStatus: 'topology',
        } satisfies FlowEdgeData,
      })
    })
  })

  // Execution edges: consecutive nodes
  for (let i = 0; i < task.nodes.length - 1; i++) {
    const from = task.nodes[i].name
    const to = task.nodes[i + 1].name
    const edgeId = `${from}->${to}`

    const existing = flowEdges.find(e => e.id === edgeId)
    const toNodeStatus = task.nodes[i + 1].status === 'failed' ? 'failed' : 'success'

    if (existing) {
      // Mark topology edge as executed
      existing.data = {
        ...existing.data,
        executed: true,
        edgeStatus: toNodeStatus,
      }
    } else {
      // Create new execution edge (not in topology)
      flowEdges.push({
        id: edgeId,
        source: from,
        target: to,
        data: {
          executed: true,
          anchor: false,
          jump_back: false,
          edgeStatus: toNodeStatus,
        } satisfies FlowEdgeData,
      })
    }
  }

  // 5. ELK layout (layout calculation only)
  const elkGraph: ElkLayoutNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: flowNodes.map(node => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
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

  return { nodes: flowNodes, edges: flowEdges }
}
