import { ensureLoadedTargetReadyForSource } from './readiness'
import type { LoadedSourceActionOptions } from './optionTypes'
import type { ApplyLoadedTargetAction } from './applyAction'

export const createEnsureLoadedTargetReadyAction = (
  options: LoadedSourceActionOptions,
  applyLoadedTarget: ApplyLoadedTargetAction,
) => {
  return async (): Promise<boolean> => {
    return ensureLoadedTargetReadyForSource({
      sourceMode: options.sourceMode,
      selectedLoadedTargetId: options.selectedLoadedTargetId,
      loadedTargets: options.loadedTargets,
      loadedDefaultTargetId: options.loadedDefaultTargetId,
      fileName: options.fileName,
      fileContent: options.fileContent,
      fileHandle: options.fileHandle,
      applyLoadedTarget,
    })
  }
}
