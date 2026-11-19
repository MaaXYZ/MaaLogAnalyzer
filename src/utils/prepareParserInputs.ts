import { readGzipLogHead, readGzipLogContent } from './gzipLog'
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
      const loadContent = () => readGzipLogContent(gzip)
      rows.push({
        ...metadata,
        content: sort ? await readGzipSortSample(gzip) : '',
        source: { ...metadata, size: gzip.size, loadContent },
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
