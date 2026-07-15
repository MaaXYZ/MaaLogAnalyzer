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

export const readContextLinesFromContent = async (
  content: string,
  options: Omit<ReadContextLinesOptions, 'file'>,
): Promise<ReadContextLinesResult> => {
  const beforeLines = options.beforeLines ?? 3
  const afterLines = options.afterLines ?? 50
  const startLine = Math.max(1, options.targetLine - beforeLines)
  const endLine = Math.min(options.totalLines, options.targetLine + afterLines)
  const lines: string[] = []
  let cursor = 0
  let lineNumber = 1
  let nextYieldAt = 1024 * 1024

  while (cursor <= content.length && lineNumber <= endLine) {
    let lineEnd = content.indexOf('\n', cursor)
    if (lineEnd < 0) lineEnd = content.length
    if (lineNumber >= startLine) lines.push(content.slice(cursor, lineEnd))
    if (lineEnd >= content.length) break
    cursor = lineEnd + 1
    lineNumber += 1

    if (cursor >= nextYieldAt) {
      nextYieldAt = cursor + 1024 * 1024
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  return { lines, startLine }
}
