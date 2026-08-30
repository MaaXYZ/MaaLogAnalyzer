import { readContextLinesFromContent, readContextLinesFromFile } from './contextRead'
import { toastError } from '../../../../utils/toast'
import type { LoadContextLinesOptions } from './types'

export const loadContextLinesForRuntime = async (
  options: LoadContextLinesOptions,
  targetLine: number,
  dependencies: {
    readFromFile?: typeof readContextLinesFromFile
    readFromContent?: typeof readContextLinesFromContent
    reportError?: (error: unknown) => void
    shouldApply?: () => boolean
  } = {},
) => {
  const sourceGeneration = options.sourceLoadGeneration.value
  const file = options.fileHandle.value
  const fileContent = options.fileContent.value
  const totalLines = options.totalLines.value
  const isCurrent = () =>
    options.sourceLoadGeneration.value === sourceGeneration &&
    (dependencies.shouldApply?.() ?? true)
  const readFromFile = dependencies.readFromFile ?? readContextLinesFromFile
  const readFromContent = dependencies.readFromContent ?? readContextLinesFromContent
  const reportError =
    dependencies.reportError ??
    ((error: unknown) => {
      toastError('加载上下文失败: ' + error)
    })

  try {
    const { lines, startLine } = file
      ? await readFromFile({
          file,
          totalLines,
          targetLine,
        })
      : await readFromContent(fileContent, {
          totalLines,
          targetLine,
        })
    if (!isCurrent()) return

    options.contextLines.value = lines
    options.contextStartLine.value = startLine
  } catch (error) {
    if (isCurrent()) {
      reportError(error)
    }
  }
}
