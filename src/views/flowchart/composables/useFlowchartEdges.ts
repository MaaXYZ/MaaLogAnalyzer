import { computed, type Ref } from 'vue'
import type { FlowEdgeData } from '../../../utils/flowchartBuilder'

const FLOW_NODE_WIDTH = 180
const FLOW_NODE_HEIGHT = 60

interface UseFlowchartEdgesOptions {
  flowNodes: Ref<any[]>
  flowEdges: Ref<any[]>
  focusedNodeId: Ref<string | null>
  edgeStyle: Ref<string>
  edgeFlowEnabled: Ref<boolean>
  getNodeById: (nodeId: string) => { position: { x: number; y: number } } | undefined
}

export const useFlowchartEdges = (options: UseFlowchartEdgesOptions) => {
  const getBaseEdgeStyle = (edgeData: FlowEdgeData) => {
    if (!edgeData.executed) {
      const style: Record<string, string | number> = { stroke: '#999', strokeWidth: 1, opacity: 0.5 }
      if (edgeData.jump_back) {
        style.strokeDasharray = '8 4'
      } else if (edgeData.anchor) {
        style.strokeDasharray = '3 3'
      }
      return style
    }

    const color = edgeData.edgeStatus === 'failed'
      ? '#d03050'
      : edgeData.edgeStatus === 'running'
        ? '#f0a020'
        : '#18a058'

    const style: Record<string, string | number> = { stroke: color, strokeWidth: 3, opacity: 1 }
    if (edgeData.jump_back) {
      style.strokeDasharray = '8 4'
    } else if (edgeData.anchor) {
      style.strokeDasharray = '3 3'
    }
    return style
  }

  const highlightedNodeIds = computed(() => {
    if (!options.focusedNodeId.value) return null
    const ids = new Set<string>([options.focusedNodeId.value])
    options.flowEdges.value.forEach((edge: any) => {
      if (edge.source === options.focusedNodeId.value) ids.add(edge.target)
      if (edge.target === options.focusedNodeId.value) ids.add(edge.source)
    })
    return ids
  })

  const highlightedEdgeIds = computed(() => {
    if (!options.focusedNodeId.value) return null
    const ids = new Set<string>()
    options.flowEdges.value.forEach((edge: any) => {
      if (edge.source === options.focusedNodeId.value || edge.target === options.focusedNodeId.value) {
        ids.add(edge.id)
      }
    })
    return ids
  })

  const getEdgeRenderType = (edge: any): string | undefined => {
    const edgeData = edge.data as FlowEdgeData | undefined
    const routePoints = edgeData?.routePoints
    const hasRoutePoints = Array.isArray(routePoints) && routePoints.length >= 2
    if (edgeData?.flowMode === 'chevron') return 'orthogonalEdge'
    if (options.edgeStyle.value === 'orthogonal' && hasRoutePoints) return 'orthogonalEdge'
    return undefined
  }

  const decorateInitialEdges = (edges: any[]): any[] => {
    return edges.map((edge) => {
      const edgeData = edge.data as FlowEdgeData
      return {
        ...edge,
        style: getBaseEdgeStyle(edgeData),
        type: getEdgeRenderType(edge),
        animated: false,
      }
    })
  }

  const applyEdgeRenderTypes = () => {
    options.flowEdges.value = options.flowEdges.value.map((edge: any) => ({
      ...edge,
      type: getEdgeRenderType(edge),
    }))
  }

  const applyFocusStyles = () => {
    const activeEdgeIds = highlightedEdgeIds.value
    options.flowEdges.value = options.flowEdges.value.map((edge: any) => {
      const edgeData = edge.data as FlowEdgeData
      const baseStyle = getBaseEdgeStyle(edgeData)
      const hasFocusedNode = activeEdgeIds != null
      const isActiveEdge = !hasFocusedNode || activeEdgeIds.has(edge.id)
      const shouldAnimate = options.edgeFlowEnabled.value && edgeData.executed && isActiveEdge
      const hasDashArray = Object.prototype.hasOwnProperty.call(baseStyle, 'strokeDasharray')
      const flowMode: FlowEdgeData['flowMode'] = !shouldAnimate ? 'none' : (hasDashArray ? 'dash' : 'chevron')
      const nextData: FlowEdgeData = { ...edgeData, flowMode }
      const dimmed = activeEdgeIds != null && !activeEdgeIds.has(edge.id)
      return {
        ...edge,
        data: nextData,
        style: {
          ...baseStyle,
          opacity: dimmed ? 0.12 : (baseStyle.opacity ?? 1),
        },
        animated: flowMode === 'dash',
        type: getEdgeRenderType({ ...edge, data: nextData }),
      }
    })
  }

  const recomputeEdgeRoutesForCurrentNodes = () => {
    const fallbackNodeMap = new Map<string, any>(options.flowNodes.value.map((node: any) => [node.id, node]))

    options.flowEdges.value = options.flowEdges.value.map((edge: any) => {
      // Prefer live positions managed by VueFlow during drag; fall back to local array.
      const sourceNode = options.getNodeById(edge.source) ?? fallbackNodeMap.get(edge.source)
      const targetNode = options.getNodeById(edge.target) ?? fallbackNodeMap.get(edge.target)
      if (!sourceNode || !targetNode) return edge

      const start = {
        x: sourceNode.position.x + FLOW_NODE_WIDTH / 2,
        y: sourceNode.position.y + FLOW_NODE_HEIGHT,
      }
      const end = {
        x: targetNode.position.x + FLOW_NODE_WIDTH / 2,
        y: targetNode.position.y,
      }

      const points: Array<{ x: number; y: number }> = []
      if (Math.abs(start.x - end.x) < 0.5) {
        points.push(start, end)
      } else {
        const midY = (start.y + end.y) / 2
        points.push(start, { x: start.x, y: midY }, { x: end.x, y: midY }, end)
      }

      const nextData: FlowEdgeData = {
        ...(edge.data as FlowEdgeData),
        routePoints: points,
      }

      return {
        ...edge,
        data: nextData,
        type: getEdgeRenderType({ ...edge, data: nextData }),
      }
    })

    applyFocusStyles()
  }

  return {
    highlightedNodeIds,
    applyEdgeRenderTypes,
    applyFocusStyles,
    recomputeEdgeRoutesForCurrentNodes,
    decorateInitialEdges,
  }
}
