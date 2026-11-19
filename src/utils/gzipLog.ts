import { ArchiveLimitError, type ArchiveLimits } from './archiveLimits'
import type { FilePrimaryLogFile } from './logFileDiscovery'
import { decodeFileContent } from './textEncoding'

export const isGzipLog = (path: string): boolean => /\.log\.gz$/i.test(path)

/** Replace the selected gzip members' stored sizes with their actual output sizes. */
export function createGzipBudget(limits: Readonly<ArchiveLimits>, otherBytes: number) {
  let extracted = otherBytes
  return (compressed: number, size: number, chunk: number) => {
    extracted += chunk
    if (size > limits.maxFileBytes)
      throw new ArchiveLimitError('file-size', size, limits.maxFileBytes)
    if (extracted > limits.maxExtractedBytes) {
      throw new ArchiveLimitError('extracted-size', extracted, limits.maxExtractedBytes)
    }
    if (size >= limits.compressionRatioMinBytes && size / compressed > limits.maxCompressionRatio) {
      throw new ArchiveLimitError(
        'compression-ratio',
        size / compressed,
        limits.maxCompressionRatio,
      )
    }
  }
}

export function createPrimaryFileSource(path: string, file: File): FilePrimaryLogFile {
  const loadContent = async () =>
    isGzipLog(file.name)
      ? readGzipLogContent(file)
      : decodeFileContent(new Uint8Array(await file.arrayBuffer()))
  return { path, name: file.name, file, loadContent }
}

function gzipLogStream(blob: Blob) {
  return blob.stream().pipeThrough(new DecompressionStream('gzip'))
}

export async function readGzipLogHead(blob: Blob, length: number) {
  const reader = gzipLogStream(blob).getReader()
  const head = new Uint8Array(length)
  let offset = 0
  try {
    while (offset < length) {
      const { done, value } = await reader.read()
      if (done) break
      const part = value.subarray(0, length - offset)
      head.set(part, offset)
      offset += part.length
    }
  } finally {
    await reader.cancel()
  }
  return head.subarray(0, offset)
}

export async function readGzipLogContent(blob: Blob) {
  return decodeFileContent(new Uint8Array(await new Response(gzipLogStream(blob)).arrayBuffer()))
}

/** Expand bounded imports once so preflight and parsing consume the validated bytes. */
export async function expandGzipFile(
  file: File,
  charge?: ReturnType<typeof createGzipBudget>,
): Promise<File> {
  const compressedSize = file.size
  let stream = gzipLogStream(file)
  if (charge) {
    let size = 0
    stream = stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          size += chunk.byteLength
          charge(compressedSize, size, chunk.byteLength)
          controller.enqueue(chunk)
        },
      }),
    )
  }
  return new File([await new Response(stream).blob()], file.name.replace(/\.gz$/i, ''))
}

export async function openArchiveGzipLog(
  path: string,
  file: File,
  charge?: ReturnType<typeof createGzipBudget>,
) {
  const source = createPrimaryFileSource(path, charge ? await expandGzipFile(file, charge) : file)
  return { ...source, name: file.name }
}
