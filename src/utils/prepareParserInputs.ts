import { readGzipLogHead, readGzipLogContent, readGzipTextChunks } from './gzipLog'
import { extractFirstLogTimestamp, sortPrimaryLogParseInputs } from './logFileDiscovery'
import type { LogParserWorkerInput } from './parserWorkerProtocol'
import { decodeFileContent } from './textEncoding'

export async function readGzipSortSample(blob: Blob) {
  const sampleBytes = 64 * 1024
  const head = await readGzipLogHead(blob, sampleBytes)
  const sample = decodeFileContent(head)
  if (head.length < sampleBytes || extractFirstLogTimestamp(sample)) return sample
  const timestamp = extractFirstLogTimestamp(await readGzipLogContent(blob))
  return timestamp ? `[${timestamp}]` : ''
}

/** Decode each expanded rotation only for the duration of its parse. */
export async function prepareParserInputs(inputs: LogParserWorkerInput[], sort = false) {
  const rows = []
  for (const [index, input] of inputs.entries()) {
    const { gzip, sourceKey, sourcePath, inputIndex = index } = input
    const metadata = { sourceKey, sourcePath, inputIndex }
    if (gzip) {
      // 大日志走「流式解码 + 分块喂入」：整段解码成字符串会让峰值被单段大小拽高
      // （实测 396MB 分卷解码瞬态 ≈1.6GB RSS，12 段串行累积到 3.5–4.3GB）。
      // 分块后峰值只与块大小相关（1MB 块全量峰值 ≈1.4GB vs 整串 ≈3.9GB）。
      // 进度权重用解压后字符数的估算值（这类日志实测压缩比约 18×）。
      rows.push({
        ...metadata,
        content: sort ? await readGzipSortSample(gzip) : '',
        source: {
          ...metadata,
          size: Math.max(1, gzip.size * 18),
          loadChunks: () => readGzipTextChunks(gzip),
        },
      })
    } else {
      const content = input.bytes
        ? decodeFileContent(new Uint8Array(input.bytes))
        : (input.content ?? '')
      input.bytes = undefined
      input.content = undefined
      rows.push({ ...metadata, content, source: { ...metadata, content } })
    }
  }
  const ordered = sort ? sortPrimaryLogParseInputs(rows) : rows
  return ordered.map(({ source, inputIndex }) => ({ ...source, inputIndex }))
}
