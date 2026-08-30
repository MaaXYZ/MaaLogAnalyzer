import { computed, type Ref } from 'vue'
import type { FlowEdgeData } from '../../../utils/flowchartBuilder'

const DEFAULT_NODE_WIDTH = 120
const DEFAULT_NODE_HEIGHT = 44

interface UseFlowchartEdgesOptions {
  flowNodes: Ref<any[]>
  flowEdges: Ref<any[]>
  focusedNodeId: Ref<string | null>
  edgeStyle: Ref<string>
  edgeFlowEnabled: Ref<boolean>
  getNodeById: (nodeId: string) => any
}

const parseSizeValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

const resolveNodeSize = (node: any): { width: number; height: number } => {
  const width =
    parseSizeValue(node?.dimensions?.width) ??
    parseSizeValue(node?.width) ??
    parseSizeValue(node?.style?.width) ??
    parseSizeValue(node?.data?.nodeWidth) ??
    DEFAULT_NODE_WIDTH

  const height =
    parseSizeValue(node?.dimensions?.height) ??
    parseSizeValue(node?.height) ??
    parseSizeValue(node?.style?.height) ??
    parseSizeValue(node?.data?.nodeHeight) ??
    DEFAULT_NODE_HEIGHT

  return { width, height }
}

export const useFlowchartEdges = (options: UseFlowchartEdgesOptions) => {
  const getBaseEdgeStyle = (edgeData: FlowEdgeData) => {
    if (!edgeData.executed) {
      const style: Record<string, string | number> = {
        stroke: '#999',
        strokeWidth: 1,
        opacity: 0.5,
      }
      if (edgeData.jump_back) {
        style.strokeDasharray = '8 4'
      } else if (edgeData.anchor) {
        style.strokeDasharray = '3 3'
      }
      return style
    }

    const transitionType = edgeData.transitionType
    if (transitionType === 'next') {
      return {
        stroke: '#18a058',
        strokeWidth: 3,
        opacity: 1,
        strokeDasharray: '7 4',
      }
    }
    if (transitionType === 'jump-back') {
      return {
        stroke: '#f0a020',
        strokeWidth: 3,
        opacity: 1,
        strokeDasharray: '10 5',
      }
    }
    if (transitionType === 'jump-back-return') {
      return {
        stroke: '#f0a020',
        strokeWidth: 3,
        opacity: 1,
        strokeDasharray: '2 6',
      }
    }
    if (transitionType === 'on-error') {
      return {
        stroke: '#d03050',
        strokeWidth: 3,
        opacity: 1,
        strokeDasharray: '7 4',
      }
    }

    const color =
      edgeData.edgeStatus === 'failed'
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
      if (
        edge.source === options.focusedNodeId.value ||
        edge.target === options.focusedNodeId.value
      ) {
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
      const flowMode: FlowEdgeData['flowMode'] = !shouldAnimate
        ? 'none'
        : hasDashArray
          ? 'dash'
          : 'chevron'
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
    const fallbackNodeMap = new Map<string, any>(
      options.flowNodes.value.map((node: any) => [node.id, node]),
    )

    options.flowEdges.value = options.flowEdges.value.map((edge: any) => {
      // Prefer live positions managed by VueFlow during drag; fall back to local array.
      const sourceNode = options.getNodeById(edge.source) ?? fallbackNodeMap.get(edge.source)
      const targetNode = options.getNodeById(edge.target) ?? fallbackNodeMap.get(edge.target)
      if (!sourceNode || !targetNode) return edge

      const sourceSize = resolveNodeSize(sourceNode)
      const targetSize = resolveNodeSize(targetNode)

      const start = {
        x: sourceNode.position.x + sourceSize.width / 2,
        y: sourceNode.position.y + sourceSize.height,
      }
      const end = {
        x: targetNode.position.x + targetSize.width / 2,
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
