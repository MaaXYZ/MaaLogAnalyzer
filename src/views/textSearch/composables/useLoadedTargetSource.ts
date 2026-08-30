import { computed, ref, watch } from 'vue'
import type { SourceMode } from './loadedSource/types'
import type { LoadedSourceStateOptions } from './loadedSource/optionTypes'
import {
  createLoadedSourceActions,
  createLoadedSourceSyncOptions,
  mapLoadedTargetOptions,
  setupLoadedTargetSourceSync,
} from './loadedSource'
import { createSourceSelectionActions } from './loadedSource/selectionActions'
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
    selectSourceMode,
    selectLoadedTarget,
    beginManualFileSelection,
    prepareSourceMode,
    prepareLoadedTarget,
  } = createSourceSelectionActions({
    sourceMode,
    selectedLoadedTargetId,
    sourceLoadGeneration: options.sourceLoadGeneration,
    sourceIntentGeneration: options.sourceIntentGeneration,
    isLoadingFile: options.isLoadingFile,
    resetSearchResultsOnly: options.resetSearchResultsOnly,
  })

  const { applyLoadedTarget, ensureLoadedTargetReady, ensureDeferredLoadedTargetsReady } =
    createLoadedSourceActions({
      sourceMode,
      selectedLoadedTargetId,
      prepareLoadedTarget,
      ...options,
    })

  setupLoadedTargetSourceSync(
    createLoadedSourceSyncOptions({
      options,
      sourceMode,
      selectedLoadedTargetId,
      applyLoadedTarget,
      prepareSourceMode,
      prepareLoadedTarget,
    }),
  )

  // 目标到达（文件/zip 加载完成、实时快照建立）时自动进入“已加载目标”模式。
  // 共享模型在应用启动时就创建，目标晚于创建到达，因此必须是响应式 watcher 而不是一次性判断。
  // 内容仍是懒加载：真正物化由 ensureTargetContentLoaded / ensureLoadedTargets 按需触发。
  watch(
    () =>
      [
        options.hasDeferredLoadedTargets?.value ?? false,
        (options.loadedTargets.value?.length ?? 0) > 0,
      ] as const,
    ([hasDeferred, hasLoaded]) => {
      console.log('[text-search][debug] targets watcher fired:', {
        hasDeferred,
        hasLoaded,
        mode: sourceMode.value,
        deferredCount: options.hasDeferredLoadedTargets?.value,
        loadedCount: options.loadedTargets.value?.length,
      })
      if (!hasDeferred && !hasLoaded) return
      if (sourceMode.value === 'manual') {
        prepareSourceMode('loaded')
        console.log('[text-search][debug] switched to loaded')
      }
    },
    { immediate: true },
  )

  return {
    sourceMode,
    selectedLoadedTargetId,
    sourceModeOptions,
    loadedTargetOptions,
    applyLoadedTarget,
    selectSourceMode,
    selectLoadedTarget,
    beginManualFileSelection,
    prepareSourceMode,
    ensureLoadedTargetReady,
    ensureDeferredLoadedTargetsReady,
  }
}
