import { computed, type Ref } from 'vue'
import type { TaskInfo } from '../../../types'
import {
  buildAnchorResolutionDiagnostics,
  buildEventChainDiagnostics,
  buildJumpBackFlowDiagnostics,
} from '../../../ai/contextBuilder'

export const useDiagnosticsPreview = (
  selectedTask: Ref<TaskInfo | null>,
) => {
  const onErrorPreview = computed(() => {
    const task = selectedTask.value
    if (!task) {
      return {
        total: 0,
        chains: [] as ReturnType<typeof buildEventChainDiagnostics>['onErrorChains'],
      }
    }

    const diagnostics = buildEventChainDiagnostics(task.events ?? [])
    return {
      total: diagnostics.onErrorChains.length,
      chains: diagnostics.onErrorChains.slice(0, 8),
    }
  })

  const anchorPreview = computed(() => {
    const task = selectedTask.value
    if (!task) {
      return {
        windowCount: 0,
        unresolvedAnchorLikelyCount: 0,
        failedAfterAnchorResolvedCount: 0,
        summary: '',
        cases: [] as ReturnType<typeof buildAnchorResolutionDiagnostics>['suspiciousCases'],
      }
    }

    const diagnostics = buildAnchorResolutionDiagnostics(task.events ?? [])
    return {
      windowCount: diagnostics.windowCount,
      unresolvedAnchorLikelyCount: diagnostics.unresolvedAnchorLikelyCount,
      failedAfterAnchorResolvedCount: diagnostics.failedAfterAnchorResolvedCount,
      summary: diagnostics.summary,
      cases: diagnostics.suspiciousCases.slice(0, 8),
    }
  })

  const jumpBackPreview = computed(() => {
    const task = selectedTask.value
    if (!task) {
      return {
        caseCount: 0,
        hitThenReturnedCount: 0,
        hitThenFailedNoReturnCount: 0,
        hitNoReturnObservedCount: 0,
        terminalBounceCount: 0,
        summary: '',
        cases: [] as ReturnType<typeof buildJumpBackFlowDiagnostics>['suspiciousCases'],
      }
    }

    const diagnostics = buildJumpBackFlowDiagnostics(task.events ?? [])
    return {
      caseCount: diagnostics.caseCount,
      hitThenReturnedCount: diagnostics.hitThenReturnedCount,
      hitThenFailedNoReturnCount: diagnostics.hitThenFailedNoReturnCount,
      hitNoReturnObservedCount: diagnostics.hitNoReturnObservedCount,
      terminalBounceCount: diagnostics.terminalBounceCount,
      summary: diagnostics.summary,
      cases: diagnostics.suspiciousCases.slice(0, 8),
    }
  })

  return {
    onErrorPreview,
    anchorPreview,
    jumpBackPreview,
  }
}
