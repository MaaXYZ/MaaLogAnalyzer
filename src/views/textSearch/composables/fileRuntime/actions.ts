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

export const createFileRuntimeActions = (
  options: TextSearchFileRuntimeOptions,
  dependencies: {
    loadContextLines?: typeof loadContextLinesForRuntime
  } = {},
) => {
  let contextRequestId = 0
  const loadContext = dependencies.loadContextLines ?? loadContextLinesForRuntime

  const handleFileUpload = async (event: Event) => {
    await handleRuntimeFileUpload(buildHandleFileUploadOptions(options), event)
  }

  const clearContent = () => {
    clearRuntimeContent(buildClearRuntimeOptions(options))
  }

  const loadContextLines = async (targetLine: number) => {
    const requestId = ++contextRequestId
    await loadContext(buildLoadContextLinesOptions(options), targetLine, {
      shouldApply: () => requestId === contextRequestId,
    })
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
