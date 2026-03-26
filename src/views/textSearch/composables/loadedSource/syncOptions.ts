import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'
import type { SourceMode } from './types'
import type { LoadedSourceStateOptions, LoadedSourceSyncOptions } from './optionTypes'

interface CreateLoadedSourceSyncOptionsInput {
  options: LoadedSourceStateOptions
  sourceMode: Ref<SourceMode>
  selectedLoadedTargetId: Ref<string>
  applyLoadedTarget: (target: LoadedSearchTarget | undefined) => Promise<void>
}

export const createLoadedSourceSyncOptions = (
  input: CreateLoadedSourceSyncOptionsInput,
): LoadedSourceSyncOptions => {
  return {
    loadedTargets: input.options.loadedTargets,
    loadedDefaultTargetId: input.options.loadedDefaultTargetId,
    hasDeferredLoadedTargets: input.options.hasDeferredLoadedTargets,
    ensureLoadedTargets: input.options.ensureLoadedTargets,
    fileName: input.options.fileName,
    sourceMode: input.sourceMode,
    selectedLoadedTargetId: input.selectedLoadedTargetId,
    applyLoadedTarget: input.applyLoadedTarget,
  }
}
