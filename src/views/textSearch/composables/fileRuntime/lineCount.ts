export const countLinesInFile = async (file: File): Promise<number> => {
  let lineCount = 0
  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      lineCount += lines.length - 1
      buffer = lines[lines.length - 1]
    }

    if (buffer) lineCount++
  } finally {
    reader.releaseLock()
  }

  return lineCount
}
