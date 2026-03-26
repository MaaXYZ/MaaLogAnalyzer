import { nextTick } from 'vue'
import type { EnsureDeferredTargetsReadyOptions } from './readinessTypes'

export const ensureDeferredTargetsReady = async (
  options: EnsureDeferredTargetsReadyOptions,
) => {
  if ((options.loadedTargets.value ?? []).length > 0) return
  if (!options.hasDeferredLoadedTargets.value || !options.ensureLoadedTargets.value) return
  await options.ensureLoadedTargets.value()
  await nextTick()
}
