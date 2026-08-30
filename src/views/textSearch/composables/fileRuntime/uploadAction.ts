import { applyUploadedFileToState } from './applyUploadedFile'
import { toastError } from '../../../../utils/toast'
import { readUploadedFile } from './fileUpload'
import type { HandleRuntimeFileUploadOptions } from './types'

export const handleRuntimeFileUpload = async (
  options: HandleRuntimeFileUploadOptions,
  event: Event,
  dependencies: {
    readFile?: typeof readUploadedFile
    reportError?: (error: unknown) => void
  } = {},
) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  options.sourceMode.value = 'manual'
  options.sourceIntentGeneration.value += 1
  const loadGeneration = ++options.sourceLoadGeneration.value
  options.resetSearchResultsOnly()
  options.isLoadingFile.value = true
  const isCurrent = () =>
    options.sourceLoadGeneration.value === loadGeneration && options.sourceMode.value === 'manual'
  const readFile = dependencies.readFile ?? readUploadedFile
  const reportError =
    dependencies.reportError ??
    ((error: unknown) => {
      toastError('文件读取失败: ' + error)
    })

  try {
    const loadedFile = await readFile(file)
    if (!isCurrent()) return

    applyUploadedFileToState(
      {
        fileName: options.fileName,
        fileSizeInMB: options.fileSizeInMB,
        isLargeFile: options.isLargeFile,
        fileContent: options.fileContent,
        fileHandle: options.fileHandle,
        totalLines: options.totalLines,
      },
      loadedFile,
    )
  } catch (error) {
    if (isCurrent()) {
      reportError(error)
    }
  } finally {
    if (isCurrent()) {
      options.isLoadingFile.value = false
    }
  }
}
