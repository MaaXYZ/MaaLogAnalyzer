export const MINIMAP_CONFIG = {
  width: 16,
  colors: {
    success: '#18a058',
    warning: '#f0a020',
    failed: '#d03050',
    running: '#2080f0',
    default: '#808080',
  },
  priority: {
    failed: 4,
    warning: 3,
    running: 2,
    success: 1,
  },
  minNodesToShow: 20,
  viewportColor: 'rgba(128, 128, 128, 0.2)',
  viewportBorderColor: 'rgba(128, 128, 128, 0.4)',
  selectedBorderColor: 'rgba(128, 128, 128, 0.9)',
}

type NodeStatus = 'success' | 'failed' | 'running' | 'warning'

export const getMinimapColor = (status: NodeStatus): string => {
  return MINIMAP_CONFIG.colors[status] ?? MINIMAP_CONFIG.colors.default
}

export const getMinimapPriority = (status: NodeStatus): number => {
  return MINIMAP_CONFIG.priority[status] ?? 0
}

const WARNING_FLOW_TYPES = new Set(['task', 'pipeline_node', 'action', 'action_node'])

export const resolveNodeEffectiveStatus = (node: {
  status: string
  node_flow?: Array<{ status?: string; type?: string }>
  child_tasks?: Array<{ status?: string; nested_actions?: Array<{ status?: string }> }>
}): NodeStatus => {
  if (node.status === 'failed' || node.status === 'running') {
    return node.status
  }

  if (node.child_tasks && node.child_tasks.length > 0) {
    for (const group of node.child_tasks) {
      if (group.status === 'failed') return 'warning'
      if (group.nested_actions) {
        for (const action of group.nested_actions) {
          if (action.status === 'failed') return 'warning'
        }
      }
    }
  }

  if (node.node_flow && node.node_flow.length > 0) {
    for (const item of node.node_flow) {
      if (item.status === 'failed' && WARNING_FLOW_TYPES.has(item.type ?? '')) {
        return 'warning'
      }
    }
  }

  return node.status as NodeStatus
}
