import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'
import type { SourceMode } from '../loadedSource/types'

interface EnsureSearchSourceReadyOptions {
  sourceMode: Ref<SourceMode>
  fileName: Ref<string>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  ensureDeferredLoadedTargetsReady: () => Promise<void>
  ensureLoadedTargetReady: () => Promise<boolean>
}

export const ensureSearchSourceReady = async (
  options: EnsureSearchSourceReadyOptions,
): Promise<boolean> => {
  await options.ensureDeferredLoadedTargetsReady()

  if (
    options.sourceMode.value !== 'loaded'
    && !options.fileName.value
    && (options.loadedTargets.value?.length ?? 0) > 0
  ) {
    options.sourceMode.value = 'loaded'
  }

  if (options.sourceMode.value === 'loaded') {
    return options.ensureLoadedTargetReady()
  }

  return Boolean(options.fileName.value && (options.fileContent.value || options.fileHandle.value))
}
