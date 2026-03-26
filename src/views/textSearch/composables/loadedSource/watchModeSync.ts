import { nextTick, watch } from 'vue'
import { resolveActiveLoadedTargetId } from './targetSelection'
import type { LoadedSourceSyncOptions } from './optionTypes'

export const setupLoadedTargetModeSync = (options: LoadedSourceSyncOptions) => {
  watch(options.sourceMode, async (mode) => {
    if (mode !== 'loaded') return
    if (
      (options.loadedTargets.value?.length ?? 0) === 0
      && options.hasDeferredLoadedTargets.value
      && options.ensureLoadedTargets.value
    ) {
      await options.ensureLoadedTargets.value()
      await nextTick()
    }
    const targets = options.loadedTargets.value ?? []
    if (targets.length === 0) {
      options.sourceMode.value = 'manual'
      return
    }
    const nextId = resolveActiveLoadedTargetId(
      targets,
      options.selectedLoadedTargetId.value,
      options.loadedDefaultTargetId.value,
    )
    if (!nextId) return
    if (options.selectedLoadedTargetId.value !== nextId) {
      options.selectedLoadedTargetId.value = nextId
    } else {
      await options.applyLoadedTarget(targets.find(item => item.id === nextId))
    }
  })
}
