import type { LoadedSourceActionOptions } from './optionTypes'
import { createApplyLoadedTargetAction } from './applyAction'
import { createEnsureDeferredLoadedTargetsReadyAction } from './ensureDeferredAction'
import { createEnsureLoadedTargetReadyAction } from './ensureReadyAction'

export const createLoadedSourceActions = (options: LoadedSourceActionOptions) => {
  const applyLoadedTarget = createApplyLoadedTargetAction(options)
  const ensureLoadedTargetReady = createEnsureLoadedTargetReadyAction(options, applyLoadedTarget)
  const ensureDeferredLoadedTargetsReady = createEnsureDeferredLoadedTargetsReadyAction(options)

  return {
    applyLoadedTarget,
    ensureLoadedTargetReady,
    ensureDeferredLoadedTargetsReady,
  }
}
