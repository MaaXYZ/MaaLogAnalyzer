import { forEachFileLine } from '../stream/fileLineReader'

interface ReadContextLinesOptions {
  file: File
  totalLines: number
  targetLine: number
  beforeLines?: number
  afterLines?: number
}

interface ReadContextLinesResult {
  lines: string[]
  startLine: number
}

export const readContextLinesFromFile = async (
  options: ReadContextLinesOptions,
): Promise<ReadContextLinesResult> => {
  const beforeLines = options.beforeLines ?? 3
  const afterLines = options.afterLines ?? 50
  const startLine = Math.max(1, options.targetLine - beforeLines)
  const endLine = Math.min(options.totalLines, options.targetLine + afterLines)

  const lines: string[] = []
  await forEachFileLine({ file: options.file }, (line, lineNumber) => {
    if (lineNumber < startLine) return
    if (lineNumber > endLine) return false
    lines.push(line)
  })

  return { lines, startLine }
}
