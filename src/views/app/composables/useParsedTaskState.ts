import type { Ref } from 'vue'
import type { NodeInfo, TaskInfo } from '../../../types'
import { isSameTask } from '../../../utils/taskIdentity'

interface UseParsedTaskStateOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  hasFlowItemId: (node: NodeInfo, flowItemId: string | null) => boolean
  resetSelectionState: () => void
  refreshAvailableTaskIds: () => void
  resetAvailableTaskIds: () => void
}

export const useParsedTaskState = (options: UseParsedTaskStateOptions) => {
  const resetAnalysisState = () => {
    options.tasks.value = []
    options.resetSelectionState()
    options.resetAvailableTaskIds()
  }

  const applyParsedTasks = (nextTasks: TaskInfo[], preserveSelection: boolean) => {
    const prevSelectedTask = preserveSelection ? options.selectedTask.value : null
    const prevSelectedNodeId = preserveSelection ? options.selectedNode.value?.node_id : null
    const prevSelectedFlowItemId = preserveSelection ? options.selectedFlowItemId.value : null

    options.tasks.value = nextTasks
    options.refreshAvailableTaskIds()

    if (nextTasks.length === 0) {
      options.resetSelectionState()
      return
    }

    if (prevSelectedTask) {
      const matchedTask = nextTasks.find(task => isSameTask(task, prevSelectedTask))
      if (matchedTask) {
        options.selectedTask.value = matchedTask
        if (prevSelectedNodeId != null) {
          options.selectedNode.value = matchedTask.nodes.find(node => node.node_id === prevSelectedNodeId) || null
          if (options.selectedNode.value && options.hasFlowItemId(options.selectedNode.value, prevSelectedFlowItemId)) {
            options.selectedFlowItemId.value = prevSelectedFlowItemId
          } else {
            options.selectedFlowItemId.value = null
          }
        } else {
          options.selectedNode.value = null
          options.selectedFlowItemId.value = null
        }
        return
      }
    }

    options.selectedTask.value = nextTasks[0]
    options.selectedNode.value = null
    options.selectedFlowItemId.value = null
  }

  return {
    resetAnalysisState,
    applyParsedTasks,
  }
}
