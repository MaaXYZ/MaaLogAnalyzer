import {
  createFileRuntimeActions,
  useFileLines,
  type TextSearchFileRuntimeOptions,
} from './fileRuntime'
export const useTextSearchFileRuntime = (options: TextSearchFileRuntimeOptions) => {
  const { handleFileUpload, clearContent, jumpToLine } = createFileRuntimeActions(options)

  const fileLines = useFileLines({
    fileContent: options.fileContent,
    filterDebugInfo: options.filterDebugInfo,
  })

  return {
    handleFileUpload,
    clearContent,
    jumpToLine,
    fileLines,
  }
}
