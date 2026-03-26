import type { LoadedSearchTarget } from '../types'

export const mapLoadedTargetOptions = (targets: LoadedSearchTarget[]) => {
  return targets.map(target => ({
    label: target.label,
    value: target.id,
  }))
}

export const resolveDefaultLoadedTargetId = (
  targets: LoadedSearchTarget[],
  defaultId: string | undefined,
): string => {
  if (targets.length === 0) return ''
  if (defaultId && targets.some(item => item.id === defaultId)) {
    return defaultId
  }
  return targets[0]?.id ?? ''
}

export const resolveActiveLoadedTargetId = (
  targets: LoadedSearchTarget[],
  selectedId: string,
  defaultId: string | undefined,
): string => {
  if (targets.length === 0) return ''
  if (selectedId && targets.some(item => item.id === selectedId)) {
    return selectedId
  }
  return resolveDefaultLoadedTargetId(targets, defaultId)
}

export const hasLoadedContentReady = (
  fileName: string,
  fileContent: string,
  fileHandle: File | null,
): boolean => {
  return Boolean(fileName && (fileContent || fileHandle))
}
