import { ensureDeferredTargetsReady as ensureDeferredTargetsReadyInternal } from './deferredReady'
import { ensureLoadedSourceReady } from './loadedReady'
import { ensureManualSourceReady } from './manualReady'
import type {
  EnsureDeferredTargetsReadyOptions,
  EnsureLoadedTargetReadyOptions,
} from './readinessTypes'

export const ensureLoadedTargetReadyForSource = async (
  options: EnsureLoadedTargetReadyOptions,
): Promise<boolean> => {
  if (options.sourceMode.value !== 'loaded') {
    return ensureManualSourceReady(options)
  }

  return ensureLoadedSourceReady(options)
}

export const ensureDeferredTargetsReady = async (
  options: EnsureDeferredTargetsReadyOptions,
) => {
  await ensureDeferredTargetsReadyInternal(options)
}
