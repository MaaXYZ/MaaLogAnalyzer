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

/** 解析时每次交给 parser 的文本块大小（字符数）。 */
export const GZIP_TEXT_CHUNK_CHARS = 1 << 20

/** 判定编码前至少缓冲这么多解压字节：太小的首块容易把 GBK 误判成 UTF-8。 */
const ENCODING_SNIFF_BYTES = 64 * 1024

const TEXT_ENCODINGS = ['utf-8', 'gbk', 'gb18030', 'gb2312'] as const

const pickTextDecoder = (
  firstBytes: Uint8Array,
): { decoder: TextDecoder; text: string } => {
  for (const encoding of TEXT_ENCODINGS) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true })
      return { decoder, text: decoder.decode(firstBytes, { stream: true }) }
    } catch {
      // 换下一种编码
    }
  }
  const decoder = new TextDecoder('utf-8')
  return { decoder, text: decoder.decode(firstBytes, { stream: true }) }
}

/**
 * 把 gzip 日志**流式解码成文本块**。
 *
 * 为什么需要它：2GB+ 的日志若整段解码成字符串，单段 396MB 的解码瞬态就能把 RSS 推到 1.6GB，
 * 12 段串行解码会累积到 3.5–4.3GB（实测）。改为边解压边解码、每次只交一块文本给 parser 后，
 * 峰值与块大小相关（1MB 块实测峰值 RSS ≈1.4GB，对比整串 ≈3.9GB）。
 *
 * 编码判定：先缓冲 64KB 解压字节，按 utf-8 → gbk → gb18030 → gb2312 顺序试（与
 * `decodeFileContent` 的回退顺序一致），选定后用同一个流式 decoder 继续解码。
 */
export async function* readGzipTextChunks(
  blob: Blob,
  chunkChars: number = GZIP_TEXT_CHUNK_CHARS,
): AsyncGenerator<string> {
  const limit = Math.max(1, Math.floor(chunkChars))
  const reader = gzipLogStream(blob).getReader()
  const sniffParts: Uint8Array[] = []
  let sniffLength = 0
  let decoder: TextDecoder | null = null
  let textChunks: string[] = []
  let pendingChars = 0

  const pushText = (text: string): void => {
    if (!text) return
    textChunks.push(text)
    pendingChars += text.length
  }

  /** 把已积累文本切出不超过 limit 的块；剩余部分留到后续块。 */
  const drain = function* (): Generator<string> {
    while (pendingChars >= limit) {
      const joined = textChunks.join('')
      textChunks = []
      pendingChars = 0
      let offset = 0
      while (joined.length - offset >= limit) {
        yield joined.slice(offset, offset + limit)
        offset += limit
      }
      const rest = joined.slice(offset)
      if (rest) {
        textChunks.push(rest)
        pendingChars = rest.length
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue

      if (!decoder) {
        sniffParts.push(value)
        sniffLength += value.byteLength
        if (sniffLength < ENCODING_SNIFF_BYTES) continue
        const sniffed = new Uint8Array(sniffLength)
        let offset = 0
        for (const part of sniffParts) {
          sniffed.set(part, offset)
          offset += part.byteLength
        }
        sniffParts.length = 0
        const picked = pickTextDecoder(sniffed)
        decoder = picked.decoder
        pushText(picked.text)
      } else {
        pushText(decoder.decode(value, { stream: true }))
      }

      yield* drain()
    }

    if (!decoder) {
      // 整段不超过 64KB：一次性判定
      const sniffed = new Uint8Array(sniffLength)
      let offset = 0
      for (const part of sniffParts) {
        sniffed.set(part, offset)
        offset += part.byteLength
      }
      const picked = pickTextDecoder(sniffed)
      decoder = picked.decoder
      pushText(picked.text)
    }
    pushText(decoder.decode())
    yield* drain()
    if (pendingChars > 0) {
      const rest = textChunks.join('')
      if (rest) yield rest
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
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
