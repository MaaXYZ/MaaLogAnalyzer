import { computed, ref } from 'vue'
import type { SourceMode } from './loadedSource/types'
import type { LoadedSourceStateOptions } from './loadedSource/optionTypes'
import {
  createLoadedSourceActions,
  createLoadedSourceSyncOptions,
  mapLoadedTargetOptions,
  setupLoadedTargetSourceSync,
} from './loadedSource'
export type { SourceMode }

type UseLoadedTargetSourceOptions = LoadedSourceStateOptions

export const useLoadedTargetSource = (options: UseLoadedTargetSourceOptions) => {
  const sourceMode = ref<SourceMode>('manual')
  const selectedLoadedTargetId = ref('')

  const sourceModeOptions = [
    { label: '已加载目标', value: 'loaded' },
    { label: '手动选择文件', value: 'manual' },
  ]

  const loadedTargetOptions = computed(() => {
    return mapLoadedTargetOptions(options.loadedTargets.value ?? [])
  })

  const {
    applyLoadedTarget,
    ensureLoadedTargetReady,
    ensureDeferredLoadedTargetsReady,
  } = createLoadedSourceActions({
    sourceMode,
    selectedLoadedTargetId,
    ...options,
  })

  setupLoadedTargetSourceSync(createLoadedSourceSyncOptions({
    options,
    sourceMode,
    selectedLoadedTargetId,
    applyLoadedTarget,
  }))

  return {
    sourceMode,
    selectedLoadedTargetId,
    sourceModeOptions,
    loadedTargetOptions,
    applyLoadedTarget,
    ensureLoadedTargetReady,
    ensureDeferredLoadedTargetsReady,
  }
}
