import { gunzipSync } from 'node:zlib'
import { addSelectedEntry, type ArchiveLimits } from './archiveLimits'

export const isGzipLog = (path: string) => /\.log\.gz$/i.test(path)

export function expandGzipLog(
  path: string,
  data: Uint8Array,
  limits: Readonly<ArchiveLimits>,
  extractedBytes: number,
) {
  const ratioLimit = Math.max(
    limits.compressionRatioMinBytes - 1,
    Math.floor(data.length * limits.maxCompressionRatio),
  )
  const limit = Math.min(limits.maxFileBytes, limits.maxExtractedBytes - extractedBytes, ratioLimit)
  const check = (size: number) =>
    addSelectedEntry(
      { extractedBytes },
      { name: path, size: data.length, originalSize: size },
      limits,
    )
  try {
    const output = gunzipSync(data, { maxOutputLength: Math.max(1, limit) })
    check(output.length)
    return output
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') check(limit + 1)
    throw error
  }
}

export function expandSelectedGzipLogs(
  files: Record<string, Uint8Array>,
  paths: readonly string[],
  limits: Readonly<ArchiveLimits>,
) {
  const selected = paths.filter(isGzipLog)
  if (!selected.length) return
  let extracted = Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0)
  for (const path of selected) {
    const compressed = files[path]
    if (!compressed) continue
    extracted -= compressed.length
    files[path] = expandGzipLog(path, compressed, limits, extracted)
    extracted += files[path].length
  }
}
