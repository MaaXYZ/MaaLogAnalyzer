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
    options.selectLoadedTarget(targetId)
  }

  const target = targets.find((item) => item.id === targetId)
  if (!target) return false

  const expected = {
    id: target.id,
    fileName: target.fileName,
    label: target.label,
    content: target.content,
  }
  const expectedName = expected.fileName || expected.label
  const isExpectedTargetLoaded = () =>
    options.sourceMode.value === 'loaded' &&
    options.selectedLoadedTargetId.value === expected.id &&
    options.fileHandle.value == null &&
    options.fileName.value === expectedName &&
    options.fileContent.value === expected.content &&
    hasLoadedContentReady(
      options.fileName.value,
      options.fileContent.value,
      options.fileHandle.value,
    )

  if (!isExpectedTargetLoaded()) {
    await options.applyLoadedTarget(target)
  }

  const currentTarget = (options.loadedTargets.value ?? []).find((item) => item.id === expected.id)
  return Boolean(
    currentTarget &&
    currentTarget.fileName === expected.fileName &&
    currentTarget.label === expected.label &&
    currentTarget.content === expected.content &&
    isExpectedTargetLoaded(),
  )
}
