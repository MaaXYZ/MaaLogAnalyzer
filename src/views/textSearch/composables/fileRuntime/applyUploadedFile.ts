import type { Ref } from 'vue'
import type { readUploadedFile } from './fileUpload'

type UploadedFilePayload = Awaited<ReturnType<typeof readUploadedFile>>

interface ApplyUploadedFileState {
  fileName: Ref<string>
  fileSizeInMB: Ref<number>
  isLargeFile: Ref<boolean>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  totalLines: Ref<number>
}

export const applyUploadedFileToState = (
  state: ApplyUploadedFileState,
  file: UploadedFilePayload,
) => {
  state.fileName.value = file.fileName
  state.fileSizeInMB.value = file.fileSizeInMB
  state.isLargeFile.value = file.isLargeFile
  state.fileContent.value = file.fileContent
  state.fileHandle.value = file.fileHandle
  state.totalLines.value = file.totalLines
}
