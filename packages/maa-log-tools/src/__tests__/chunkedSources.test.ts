import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync, strToU8 } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeLogSources } from '../index'
import { loadNodeLogSources, readNodeLogTextChunks } from '../nodeInput'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) => rm(root, { recursive: true, force: true })),
  )
})

const makeEventLine = (index: number, message: string, details: Record<string, unknown>): string => {
  const second = Math.floor(index / 1000)
  const millisecond = index % 1000
  return `[2026-04-06 10:00:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const buildLog = (): string =>
  [
    makeEventLine(1, 'Tasker.Task.Starting', { task_id: 1, entry: '任务一', hash: 'h', uuid: 'u' }),
    makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(3, 'Node.PipelineNode.Succeeded', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(4, 'Tasker.Task.Succeeded', { task_id: 1, entry: '任务一', hash: 'h', uuid: 'u' }),
  ].join('\n')

const collect = async (chunks: AsyncIterable<string>): Promise<string[]> => {
  const out: string[] = []
  for await (const chunk of chunks) out.push(chunk)
  return out
}

const makeDir = async (prefix: string): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

describe('chunked Node log sources', () => {
  it('exposes loadChunks for gz logs and decodes to the same text as loadContent', async () => {
    const root = await makeDir('mla-chunk-src-')
    const log = buildLog() + '\n'
    await writeFile(path.join(root, 'maafw.bak.2026.04.06-10.00.00.000.log.gz'), gzipSync(strToU8(log)))

    const loaded = await loadNodeLogSources(root)
    expect(loaded).not.toBeNull()
    const source = loaded!.sources[0]!
    expect(typeof source.loadChunks).toBe('function')

    const chunked = (await collect(source.loadChunks!())).join('')
    expect(chunked).toBe(await source.loadContent())

    // 提前中断/只消费一次时，进度权重也应是解压后的估算值而不是压缩字节数
    expect(source.size).toBeGreaterThan(gzipSync(strToU8(log)).length)
  })

  it('falls back to GBK when the gzip payload is not UTF-8', async () => {
    const root = await makeDir('mla-chunk-gbk-')
    // "中文测试\n" 的 GBK 编码
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4, 0x0a])
    await writeFile(path.join(root, 'maafw.bak.2026.04.06-10.00.00.000.log.gz'), gzipSync(gbk))

    const chunks = await collect(
      readNodeLogTextChunks(path.join(root, 'maafw.bak.2026.04.06-10.00.00.000.log.gz'), {
        gzip: true,
        chunkChars: 3,
      }),
    )
    expect(chunks.join('')).toBe('中文测试\n')
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(3)
  })

  it('decodes plain text logs in chunks without gzip', async () => {
    const root = await makeDir('mla-chunk-plain-')
    const file = path.join(root, 'maa.log')
    await writeFile(file, '第一行\n第二行😀\n')
    const chunks = await collect(readNodeLogTextChunks(file, { chunkChars: 2 }))
    expect(chunks.join('')).toBe('第一行\n第二行😀\n')
  })

  it('parses through loadChunks and produces the same output as the whole-string path', async () => {
    const root = await makeDir('mla-chunk-parse-')
    await writeFile(path.join(root, 'maafw.log'), buildLog() + '\n')

    const loaded = await loadNodeLogSources(root)
    expect(loaded).not.toBeNull()
    const chunkedOutput = await analyzeLogSources({
      sources: loaded!.sources,
      errorImages: loaded!.errorImages,
      visionImages: loaded!.visionImages,
      waitFreezesImages: loaded!.waitFreezesImages,
    })
    const segments = loaded!.getSourceSegments()
    expect(segments).toHaveLength(1)
    expect(segments[0]!.lineCount).toBe(5)

    // 去掉 loadChunks，强制走整段路径做对照
    const wholeOutput = await analyzeLogSources({
      sources: loaded!.sources.map(({ loadChunks: _loadChunks, ...rest }) => rest),
      errorImages: loaded!.errorImages,
      visionImages: loaded!.visionImages,
      waitFreezesImages: loaded!.waitFreezesImages,
    })

    expect(chunkedOutput.tasks).toHaveLength(1)
    expect(JSON.stringify(chunkedOutput.tasks)).toBe(JSON.stringify(wholeOutput.tasks))
    expect(JSON.stringify(chunkedOutput.events)).toBe(JSON.stringify(wholeOutput.events))
  })

  it('parses from a source that only provides loadChunks', async () => {
    const log = buildLog() + '\n'
    const output = await analyzeLogSources({
      sources: [
        {
          sourceKey: 'chunked.log',
          sourcePath: 'chunked.log',
          inputIndex: 0,
          size: log.length,
          loadChunks: async function* () {
            yield log.slice(0, 40)
            yield log.slice(40)
          },
        },
      ],
    })
    expect(output.tasks).toHaveLength(1)
    expect(output.tasks[0]?.entry).toBe('任务一')
    expect(output.events).toHaveLength(4)
  })
})
