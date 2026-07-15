export const LARGE_TEXT_CONTENT_THRESHOLD_BYTES = 5 * 1024 * 1024

const METRICS_CHUNK_SIZE = 4 * 1024 * 1024
const yieldToMainThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export const analyzeTextContent = async (content: string) => {
  if (!content) return { byteLength: 0, lineCount: 0 }

  let byteLength = 0
  let lineCount = 1
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index)
    if (code === 10) lineCount += 1

    if (code <= 0x7f) {
      byteLength += 1
    } else if (code <= 0x7ff) {
      byteLength += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = content.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        byteLength += 4
        index += 1
      } else {
        byteLength += 3
      }
    } else {
      byteLength += 3
    }

    if (index > 0 && index % METRICS_CHUNK_SIZE === 0) await yieldToMainThread()
  }

  return { byteLength, lineCount }
}
