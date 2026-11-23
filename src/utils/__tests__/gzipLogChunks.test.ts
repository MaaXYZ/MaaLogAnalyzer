import { describe, expect, it } from 'vitest'
import { GZIP_TEXT_CHUNK_CHARS, readGzipTextChunks } from '../gzipLog'
import { prepareParserInputs } from '../prepareParserInputs'

const gzipBytes = async (bytes: Uint8Array): Promise<Blob> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Blob([await new Response(stream).arrayBuffer()])
}

const gzipText = async (text: string): Promise<Blob> =>
  gzipBytes(new TextEncoder().encode(text))

const collect = async (blob: Blob, chunkChars?: number): Promise<string[]> => {
  const chunks: string[] = []
  for await (const chunk of readGzipTextChunks(blob, chunkChars)) chunks.push(chunk)
  return chunks
}

describe('readGzipTextChunks', () => {
  it('decodes gzip text into bounded chunks that join back to the original', async () => {
    const text = '第一行 中文🎯\n第二行 abc\n第三行 end\n'
    const chunks = await collect(await gzipText(text), 7)
    expect(chunks.join('')).toBe(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(7)
      expect(chunk.length).toBeGreaterThan(0)
    }
  })

  it('keeps multi-byte characters intact across chunk boundaries', async () => {
    const text = ('中文内容😀'.repeat(500) + '\n').repeat(20)
    const chunks = await collect(await gzipText(text), 5)
    expect(chunks.join('')).toBe(text)
    for (const chunk of chunks) expect(chunk).not.toContain('\uFFFD')
  })

  it('handles payloads larger than the encoding sniff window', async () => {
    const text = 'x'.repeat(200_000) + '\n中文尾巴🎯\n'
    const chunks = await collect(await gzipText(text), 64 * 1024)
    expect(chunks.join('')).toBe(text)
  })

  it('falls back to GBK for non-UTF-8 logs', async () => {
    // "中文测试\n" 的 GBK 编码
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4, 0x0a])
    const chunks = await collect(await gzipBytes(gbk), 4)
    expect(chunks.join('')).toBe('中文测试\n')
  })

  it('produces nothing for an empty payload', async () => {
    expect(await collect(await gzipBytes(new Uint8Array()))).toEqual([])
  })

  it('uses a 1M-char default chunk size', () => {
    expect(GZIP_TEXT_CHUNK_CHARS).toBe(1 << 20)
  })
})

describe('prepareParserInputs', () => {
  it('hands gzip logs to the parser as chunked sources (no whole-string decode)', async () => {
    const text = '2026-04-06 10:00:00.001 [INF] line\n'
    const inputs = await prepareParserInputs([
      { gzip: await gzipText(text), sourceKey: 'a.log.gz', sourcePath: 'a.log.gz' },
    ])
    expect(inputs).toHaveLength(1)
    const input = inputs[0] as {
      content?: string
      size?: number
      loadChunks?: () => AsyncIterable<string>
      loadContent?: unknown
    }
    expect(input.content).toBeUndefined()
    expect(input.loadContent).toBeUndefined()
    expect(typeof input.loadChunks).toBe('function')
    // 进度权重按解压后字符估算，不应等于压缩字节数
    expect(input.size).toBeGreaterThan(16)

    const chunks: string[] = []
    for await (const chunk of input.loadChunks!()) chunks.push(chunk)
    expect(chunks.join('')).toBe(text)
  })

  it('keeps non-gzip inputs as whole strings', async () => {
    const inputs = await prepareParserInputs([
      { bytes: new TextEncoder().encode('plain log').buffer, sourceKey: 'maa.log' },
    ])
    expect(inputs[0]).toMatchObject({ content: 'plain log' })
  })
})
