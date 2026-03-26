import { computed } from 'vue'
import type { AiAnalysisViewModelProps } from '../viewModelTypes'

export const useAiAnalysisPropRefs = (props: AiAnalysisViewModelProps) => {
  const tasks = computed(() => props.tasks)
  const selectedTask = computed(() => props.selectedTask)
  const selectedNode = computed(() => props.selectedNode)
  const selectedFlowItemId = computed(() => props.selectedFlowItemId ?? null)
  const loadedTargets = computed(() => props.loadedTargets)
  const loadedDefaultTargetId = computed(() => props.loadedDefaultTargetId)
  const hasDeferredLoadedTargets = computed(() => props.hasDeferredLoadedTargets)
  const ensureLoadedTargets = computed(() => props.ensureLoadedTargets)

  return {
    tasks,
    selectedTask,
    selectedNode,
    selectedFlowItemId,
    loadedTargets,
    loadedDefaultTargetId,
    hasDeferredLoadedTargets,
    ensureLoadedTargets,
  }
}
