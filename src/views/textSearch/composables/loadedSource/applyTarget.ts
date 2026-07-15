import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'
import { analyzeTextContent, LARGE_TEXT_CONTENT_THRESHOLD_BYTES } from '../contentMetrics'

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
  shouldApply?: () => boolean
}

export const applyLoadedTargetToState = async (
  state: ApplyLoadedTargetState,
  target: LoadedSearchTarget | undefined,
) => {
  if (!target) return
  state.isLoadingFile.value = true
  try {
    const content = target.content ?? ''
    const metrics = await analyzeTextContent(content)
    if (state.shouldApply && !state.shouldApply()) return

    state.resetSearchResultsOnly()
    state.fileName.value = target.fileName || target.label
    state.fileContent.value = content
    state.fileSizeInMB.value = metrics.byteLength / 1024 / 1024
    state.isLargeFile.value = metrics.byteLength >= LARGE_TEXT_CONTENT_THRESHOLD_BYTES
    state.fileHandle.value = null
    state.totalLines.value = metrics.lineCount
    state.showFileContent.value = false
    state.contentKey.value += 1
  } finally {
    if (!state.shouldApply || state.shouldApply()) {
      state.isLoadingFile.value = false
    }
  }
}
