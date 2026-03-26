import { hasLoadedContentReady, resolveActiveLoadedTargetId } from './targetSelection'
import type { EnsureLoadedTargetReadyOptions } from './readinessTypes'

export const ensureLoadedSourceReady = async (
  options: EnsureLoadedTargetReadyOptions,
): Promise<boolean> => {
  const targets = options.loadedTargets.value ?? []
  if (targets.length === 0) return false

  const targetId = resolveActiveLoadedTargetId(
    targets,
    options.selectedLoadedTargetId.value,
    options.loadedDefaultTargetId.value,
  )
  if (!targetId) return false

  if (options.selectedLoadedTargetId.value !== targetId) {
    options.selectedLoadedTargetId.value = targetId
  }

  const target = targets.find(item => item.id === targetId)
  if (!target) return false

  const expectedName = target.fileName || target.label
  const contentReady = hasLoadedContentReady(
    options.fileName.value,
    options.fileContent.value,
    options.fileHandle.value,
  )
  const sameTargetLoaded = options.fileName.value === expectedName
  if (!contentReady || !sameTargetLoaded) {
    await options.applyLoadedTarget(target)
  }

  return hasLoadedContentReady(
    options.fileName.value,
    options.fileContent.value,
    options.fileHandle.value,
  )
}
