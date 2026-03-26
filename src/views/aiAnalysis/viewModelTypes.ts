import type { AiLoadedTarget } from '../../ai/contextBuilder'
import type { NodeInfo, TaskInfo } from '../../types'

export interface AiAnalysisViewModelProps {
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode: NodeInfo | null
  selectedFlowItemId?: string | null
  loadedTargets: AiLoadedTarget[]
  loadedDefaultTargetId: string
  hasDeferredLoadedTargets?: boolean
  ensureLoadedTargets?: () => Promise<void>
}
