import type { Ref } from 'vue'
import type { SourceMode } from './types'

interface SourceSelectionActionOptions {
  sourceMode: Ref<SourceMode>
  selectedLoadedTargetId: Ref<string>
  sourceLoadGeneration: Ref<number>
  sourceIntentGeneration: Ref<number>
  isLoadingFile: Ref<boolean>
  resetSearchResultsOnly: () => void
}

export const createSourceSelectionActions = (options: SourceSelectionActionOptions) => {
  const invalidateCurrentSource = (trackUserIntent: boolean) => {
    if (trackUserIntent) {
      options.sourceIntentGeneration.value += 1
    }
    options.sourceLoadGeneration.value += 1
    options.isLoadingFile.value = false
    options.resetSearchResultsOnly()
  }

  const selectSourceMode = (mode: SourceMode) => {
    if (options.sourceMode.value === mode) return
    invalidateCurrentSource(true)
    options.sourceMode.value = mode
  }

  const selectLoadedTarget = (id: string) => {
    if (options.selectedLoadedTargetId.value === id) return
    invalidateCurrentSource(true)
    options.selectedLoadedTargetId.value = id
  }

  const beginManualFileSelection = () => {
    invalidateCurrentSource(true)
    options.sourceMode.value = 'manual'
  }

  const prepareSourceMode = (mode: SourceMode) => {
    if (options.sourceMode.value === mode) return
    invalidateCurrentSource(false)
    options.sourceMode.value = mode
  }

  const prepareLoadedTarget = (id: string) => {
    if (options.selectedLoadedTargetId.value === id) return
    invalidateCurrentSource(false)
    options.selectedLoadedTargetId.value = id
  }

  return {
    selectSourceMode,
    selectLoadedTarget,
    beginManualFileSelection,
    prepareSourceMode,
    prepareLoadedTarget,
  }
}
