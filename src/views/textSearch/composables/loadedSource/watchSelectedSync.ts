import { watch } from 'vue'
import type { LoadedSourceSyncOptions } from './optionTypes'

export const setupLoadedTargetSelectedSync = (options: LoadedSourceSyncOptions) => {
  watch(options.selectedLoadedTargetId, async (id) => {
    if (options.sourceMode.value !== 'loaded') return
    // 懒加载策略：目标内容尚未物化时先加载，再应用
    if (options.ensureTargetContentLoaded) {
      await options.ensureTargetContentLoaded(id)
    }
    const target = (options.loadedTargets.value ?? []).find((item) => item.id === id)
    await options.applyLoadedTarget(target)
  })
}
