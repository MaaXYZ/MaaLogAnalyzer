import { ensureDeferredTargetsReady } from './readiness'
import type { LoadedSourceActionOptions } from './optionTypes'

export const createEnsureDeferredLoadedTargetsReadyAction = (
  options: LoadedSourceActionOptions,
) => {
  return async () => {
    await ensureDeferredTargetsReady({
      loadedTargets: options.loadedTargets,
      hasDeferredLoadedTargets: options.hasDeferredLoadedTargets,
      ensureLoadedTargets: options.ensureLoadedTargets,
    })
  }
}
