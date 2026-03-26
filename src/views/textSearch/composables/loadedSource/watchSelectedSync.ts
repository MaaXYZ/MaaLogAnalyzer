import { watch } from 'vue'
import type { LoadedSourceSyncOptions } from './optionTypes'

export const setupLoadedTargetSelectedSync = (options: LoadedSourceSyncOptions) => {
  watch(options.selectedLoadedTargetId, async (id) => {
    if (options.sourceMode.value !== 'loaded') return
    const target = (options.loadedTargets.value ?? []).find(item => item.id === id)
    await options.applyLoadedTarget(target)
  })
}
