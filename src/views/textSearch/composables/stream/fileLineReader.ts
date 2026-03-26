interface ForEachFileLineOptions {
  file: File
  shouldAbort?: () => boolean
}

type ForEachFileLineCallback = (
  line: string,
  lineNumber: number,
) => boolean | void | Promise<boolean | void>

export const forEachFileLine = async (
  options: ForEachFileLineOptions,
  onLine: ForEachFileLineCallback,
) => {
  const reader = options.file.stream().getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lineNumber = 0

  try {
    while (true) {
      if (options.shouldAbort?.()) return

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (options.shouldAbort?.()) return
        lineNumber++
        const shouldContinue = await onLine(line, lineNumber)
        if (shouldContinue === false) return
      }
    }

    if (buffer && !options.shouldAbort?.()) {
      lineNumber++
      await onLine(buffer, lineNumber)
    }
  } finally {
    reader.releaseLock()
  }
}
