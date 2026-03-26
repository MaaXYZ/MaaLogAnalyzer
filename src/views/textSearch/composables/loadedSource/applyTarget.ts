import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'

interface ApplyLoadedTargetState {
  fileName: Ref<string>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  fileSizeInMB: Ref<number>
  isLargeFile: Ref<boolean>
  totalLines: Ref<number>
  showFileContent: Ref<boolean>
  contentKey: Ref<number>
  isLoadingFile: Ref<boolean>
  resetSearchResultsOnly: () => void
}

export const applyLoadedTargetToState = async (
  state: ApplyLoadedTargetState,
  target: LoadedSearchTarget | undefined,
) => {
  if (!target) return
  state.isLoadingFile.value = true
  try {
    state.resetSearchResultsOnly()
    state.fileName.value = target.fileName || target.label
    state.fileContent.value = target.content ?? ''
    state.fileSizeInMB.value = new Blob([state.fileContent.value]).size / 1024 / 1024
    state.isLargeFile.value = false
    state.fileHandle.value = null
    state.totalLines.value = state.fileContent.value ? state.fileContent.value.split('\n').length : 0
    state.showFileContent.value = false
    state.contentKey.value += 1
  } finally {
    state.isLoadingFile.value = false
  }
}
