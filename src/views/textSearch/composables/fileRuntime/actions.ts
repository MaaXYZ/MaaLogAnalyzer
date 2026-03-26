import type { TextSearchFileRuntimeOptions } from './types'
import { clearRuntimeContent } from './clearAction'
import { handleRuntimeFileUpload } from './uploadAction'
import { jumpToLineRuntime } from './jumpAction'
import { loadContextLinesForRuntime } from './contextLoader'
import {
  buildClearRuntimeOptions,
  buildHandleFileUploadOptions,
  buildJumpToLineOptions,
  buildLoadContextLinesOptions,
} from './optionBuilders'

export const createFileRuntimeActions = (options: TextSearchFileRuntimeOptions) => {
  const handleFileUpload = async (event: Event) => {
    await handleRuntimeFileUpload(buildHandleFileUploadOptions(options), event)
  }

  const clearContent = () => {
    clearRuntimeContent(buildClearRuntimeOptions(options))
  }

  const loadContextLines = async (targetLine: number) => {
    await loadContextLinesForRuntime(buildLoadContextLinesOptions(options), targetLine)
  }

  const jumpToLine = async (lineNumber: number) => {
    await jumpToLineRuntime(buildJumpToLineOptions(options), lineNumber, loadContextLines)
  }

  return {
    handleFileUpload,
    clearContent,
    jumpToLine,
  }
}
