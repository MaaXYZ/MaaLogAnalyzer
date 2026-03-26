import { nextTick } from 'vue'
import type { JumpToLineRuntimeOptions } from './types'

export const jumpToLineRuntime = async (
  options: JumpToLineRuntimeOptions,
  lineNumber: number,
  loadContextLines: (targetLine: number) => Promise<void>,
) => {
  options.selectedLine.value = lineNumber

  if (options.isLargeFile.value && options.fileHandle.value) {
    await loadContextLines(lineNumber)
    return
  }

  const needsInitialRender = !options.showFileContent.value
  if (needsInitialRender) {
    options.showFileContent.value = true
  }

  if (needsInitialRender) {
    await nextTick()
    setTimeout(() => options.contentPaneRef.value?.scrollToLine(lineNumber), 150)
  } else {
    nextTick(() => options.contentPaneRef.value?.scrollToLine(lineNumber))
  }
}
