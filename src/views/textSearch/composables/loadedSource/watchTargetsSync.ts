import { watch } from 'vue'
import { resolveDefaultLoadedTargetId } from './targetSelection'
import type { LoadedSourceSyncOptions } from './optionTypes'

export const setupLoadedTargetTargetsSync = (options: LoadedSourceSyncOptions) => {
  watch(
    () => [options.loadedTargets.value, options.loadedDefaultTargetId.value] as const,
    async ([targets, defaultId]) => {
      const safeTargets = targets ?? []
      if (safeTargets.length === 0) {
        if (options.sourceMode.value === 'loaded') {
          options.prepareSourceMode('manual')
        }
        return
      }

      if (options.sourceMode.value !== 'loaded') {
        if (!options.fileName.value) {
          options.prepareSourceMode('loaded')
        } else {
          return
        }
      }

      const preferredId = resolveDefaultLoadedTargetId(safeTargets, defaultId)

      if (preferredId && options.selectedLoadedTargetId.value !== preferredId) {
        options.prepareLoadedTarget(preferredId)
        return
      }

      if (preferredId) {
        await options.applyLoadedTarget(safeTargets.find((item) => item.id === preferredId))
      }
    },
    { immediate: true, deep: true },
  )
}
