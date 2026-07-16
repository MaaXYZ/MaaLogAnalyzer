import { readContextLinesFromContent, readContextLinesFromFile } from './contextRead'
import { toastError } from '../../../../utils/toast'
import type { LoadContextLinesOptions } from './types'

export const loadContextLinesForRuntime = async (
  options: LoadContextLinesOptions,
  targetLine: number,
) => {
  try {
    const file = options.fileHandle.value
    const { lines, startLine } = file
      ? await readContextLinesFromFile({
          file,
          totalLines: options.totalLines.value,
          targetLine,
        })
      : await readContextLinesFromContent(options.fileContent.value, {
          totalLines: options.totalLines.value,
          targetLine,
        })
    options.contextLines.value = lines
    options.contextStartLine.value = startLine
  } catch (error) {
    toastError('加载上下文失败: ' + error)
  }
}
