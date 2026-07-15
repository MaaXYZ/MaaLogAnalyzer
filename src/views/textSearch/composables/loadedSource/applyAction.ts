import type { LoadedSearchTarget } from '../types'
import { applyLoadedTargetToState } from './applyTarget'
import type { LoadedSourceActionOptions } from './optionTypes'

export type ApplyLoadedTargetAction = (target: LoadedSearchTarget | undefined) => Promise<void>

export const createApplyLoadedTargetAction = (
  options: LoadedSourceActionOptions,
): ApplyLoadedTargetAction => {
  let applyToken = 0
  return async (target: LoadedSearchTarget | undefined) => {
    const token = ++applyToken
    await applyLoadedTargetToState(
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
        resetSearchResultsOnly: options.resetSearchResultsOnly,
        shouldApply: () => token === applyToken,
      },
      target,
    )
  }
}
