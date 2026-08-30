import type { LoadedSearchTarget } from '../types'
import { applyLoadedTargetToState } from './applyTarget'
import type { LoadedSourceActionOptions } from './optionTypes'

export type ApplyLoadedTargetAction = (target: LoadedSearchTarget | undefined) => Promise<void>

export const createApplyLoadedTargetAction = (
  options: LoadedSourceActionOptions,
  applyTarget: typeof applyLoadedTargetToState = applyLoadedTargetToState,
): ApplyLoadedTargetAction => {
  let activeLoad: {
    targetId: string
    fileName: string
    label: string
    content: string
    generation: number
    promise: Promise<void>
  } | null = null

  return async (target: LoadedSearchTarget | undefined) => {
    if (
      target &&
      activeLoad?.targetId === target.id &&
      activeLoad.fileName === target.fileName &&
      activeLoad.label === target.label &&
      activeLoad.content === target.content &&
      activeLoad.generation === options.sourceLoadGeneration.value &&
      options.sourceMode.value === 'loaded' &&
      options.selectedLoadedTargetId.value === target.id
    ) {
      await activeLoad.promise
      return
    }

    const generation = ++options.sourceLoadGeneration.value
    options.resetSearchResultsOnly()

    if (
      !target ||
      options.sourceMode.value !== 'loaded' ||
      options.selectedLoadedTargetId.value !== target.id
    ) {
      options.isLoadingFile.value = false
      return
    }

    const promise = applyTarget(
      {
        fileName: options.fileName,
        fileContent: options.fileContent,
        fileHandle: options.fileHandle,
        fileSizeInMB: options.fileSizeInMB,
        isLargeFile: options.isLargeFile,
        totalLines: options.totalLines,
        showFileContent: options.showFileContent,
        contentKey: options.contentKey,
        isLoadingFile: options.isLoadingFile,
        shouldApply: () =>
          generation === options.sourceLoadGeneration.value &&
          options.sourceMode.value === 'loaded' &&
          options.selectedLoadedTargetId.value === target.id,
      },
      target,
    )
    activeLoad = {
      targetId: target.id,
      fileName: target.fileName,
      label: target.label,
      content: target.content,
      generation,
      promise,
    }

    try {
      await promise
    } finally {
      if (activeLoad?.promise === promise) {
        activeLoad = null
      }
    }
  }
}
