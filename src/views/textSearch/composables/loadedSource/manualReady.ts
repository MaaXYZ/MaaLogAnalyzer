import { hasLoadedContentReady } from './targetSelection'
import type { EnsureLoadedTargetReadyOptions } from './readinessTypes'

export const ensureManualSourceReady = (options: EnsureLoadedTargetReadyOptions) => {
  return hasLoadedContentReady(
    options.fileName.value,
    options.fileContent.value,
    options.fileHandle.value,
  )
}
