import { describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  ArchiveBudgetError,
  ArchiveIntegrityError,
  assertExtractedEntriesWithinLimits,
  canonicalizeArchivePath,
  createArchiveSelection,
  getArchiveBudgetCode,
  inspectArchiveVolumes,
  readSelectedArchiveVolumes,
  resolveArchiveLimits,
  type ArchiveBudgetCode,
  type ArchiveEntryMetadata,
  type ArchiveLimits,
  type ArchiveVolumeInput,
} from '../src/archiveReader'

const makeZip = (files: Record<string, string>): Uint8Array => zipSync(
  Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])),
  { level: 9 },
)

const findSignature = (bytes: Uint8Array, signature: readonly number[]): number => {
  outer: for (let offset = 0; offset <= bytes.byteLength - signature.length; offset += 1) {
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[offset + index] !== signature[index]) continue outer
    }
    return offset
  }
  throw new Error(`ZIP signature not found: ${signature.join(',')}`)
}

const falsifyFirstEntryOriginalSize = (archive: Uint8Array, declaredSize: number): Uint8Array => {
  const changed = archive.slice()
  const localHeader = findSignature(changed, [0x50, 0x4b, 0x03, 0x04])
  const centralHeader = findSignature(changed, [0x50, 0x4b, 0x01, 0x02])
  const view = new DataView(changed.buffer, changed.byteOffset, changed.byteLength)
  view.setUint32(localHeader + 22, declaredSize, true)
  view.setUint32(centralHeader + 24, declaredSize, true)
  return changed
}

const expectBudgetCode = async (
  operation: Promise<unknown>,
  code: ArchiveBudgetCode,
): Promise<void> => {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(ArchiveBudgetError)
    expect((error as ArchiveBudgetError).code).toBe(code)
    return
  }
  throw new Error(`Expected archive budget error: ${code}`)
}

describe('VS Code archive reader budgets', () => {
  it('recognizes budget errors after their Error prototype identity is lost', () => {
    expect(getArchiveBudgetCode(
      new Error('ArchiveBudgetError: Archive extracted-size exceeds the configured limit (600 > 512)'),
    )).toBe('extracted-size')
  })

  it('rejects oversized stat metadata before reading any volume', async () => {
    const input: ArchiveVolumeInput<string> = { source: 'large.zip', name: 'large.zip', size: 11 }
    const readVolume = vi.fn(async () => makeZip({ 'maa.log': 'log' }))

    await expectBudgetCode(
      inspectArchiveVolumes([input], readVolume, { maxCompressedBytes: 10 }),
      'compressed-size',
    )
    expect(readVolume).not.toHaveBeenCalled()
  })

  it('skips archive budgets when local loading explicitly disables them', async () => {
    const archive = makeZip({ 'debug/maa.log': 'x'.repeat(2 * 1024 * 1024) })
    const input = { source: archive, name: 'large.zip', size: archive.byteLength }
    const readVolume = vi.fn(async ({ source }: ArchiveVolumeInput<Uint8Array>) => source)
    const inspected = await inspectArchiveVolumes([input], readVolume, null)
    const selection = createArchiveSelection(['debug/maa.log'], 'debug')

    await expect(readSelectedArchiveVolumes(
      inspected,
      selection,
      readVolume,
      vi.fn(),
    )).rejects.toMatchObject({ code: 'compression-ratio' })
    await expect(readSelectedArchiveVolumes(
      inspected,
      selection,
      readVolume,
      vi.fn(),
      null,
    )).resolves.toBeUndefined()
  })

  it('rejects too many volume inputs before reading them', async () => {
    const inputs: Array<ArchiveVolumeInput<string>> = [
      { source: 'part01.zip', name: 'part01.zip', size: 1 },
      { source: 'part02.zip', name: 'part02.zip', size: 1 },
    ]
    const readVolume = vi.fn(async () => makeZip({ 'maa.log': 'log' }))

    await expectBudgetCode(
      inspectArchiveVolumes(inputs, readVolume, { maxVolumes: 1 }),
      'volume-count',
    )
    expect(readVolume).not.toHaveBeenCalled()
  })

  it('checks all central-directory UTF-8 path bytes without inflating them', async () => {
    const archive = makeZip({ 'maa.log': 'log', '日志.txt': 'text' })
    const input = { source: archive, name: 'logs.zip', size: archive.byteLength }
    const readVolume = vi.fn(async ({ source }: ArchiveVolumeInput<Uint8Array>) => source)

    await expectBudgetCode(
      inspectArchiveVolumes([input], readVolume, { maxPathBytes: 8 }),
      'path-size',
    )
    await expectBudgetCode(
      inspectArchiveVolumes([input], readVolume, {
        maxPathBytes: 100,
        maxTotalPathBytes: 16,
      }),
      'total-path-size',
    )
  })

  it.each<{
    name: string
    entries: ArchiveEntryMetadata[]
    overrides: Partial<ArchiveLimits>
    code: ArchiveBudgetCode
  }>([
    {
      name: 'single files',
      entries: [{ name: 'maa.log', size: 11, originalSize: 11, compression: 0 }],
      overrides: { maxFileBytes: 10 },
      code: 'file-size',
    },
    {
      name: 'images',
      entries: [{ name: 'on_error/image.png', size: 11, originalSize: 11, compression: 0 }],
      overrides: { maxImageBytes: 10 },
      code: 'image-size',
    },
    {
      name: 'total extracted bytes',
      entries: [
        { name: 'a.txt', size: 6, originalSize: 6, compression: 0 },
        { name: 'b.txt', size: 6, originalSize: 6, compression: 0 },
      ],
      overrides: { maxExtractedBytes: 10 },
      code: 'extracted-size',
    },
    {
      name: 'compression ratios',
      entries: [{ name: 'maa.log', size: 1, originalSize: 11, compression: 8 }],
      overrides: {
        compressionRatioMinBytes: 1,
        maxCompressionRatio: 10,
      },
      code: 'compression-ratio',
    },
  ])('rejects selected $name over budget', async ({ entries, overrides, code }) => {
    await expectBudgetCode(
      Promise.resolve().then(() => assertExtractedEntriesWithinLimits(entries, resolveArchiveLimits(overrides))),
      code,
    )
  })

  it('only inflates selected logs and same-group searchable/debug entries', async () => {
    const archive = makeZip({
      'debug/maa.log': 'selected log',
      'debug/sub/maa.log': 'different-group primary log',
      'debug/maa.bak.log': 'unselected primary log',
      'debug/report.txt': 'search text',
      'debug/on_error/2026.01.01-00.00.00.001_Node.png': 'png',
      'other/huge.txt': 'x'.repeat(1024),
    })
    const input = { source: archive, name: 'logs.zip', size: archive.byteLength }
    const readVolume = vi.fn(async ({ source }: ArchiveVolumeInput<Uint8Array>) => source)
    const inspected = await inspectArchiveVolumes([input], readVolume)
    const consumed: string[] = []

    await readSelectedArchiveVolumes(
      inspected,
      createArchiveSelection(['debug/maa.log'], 'debug'),
      readVolume,
      (_volume, entries) => consumed.push(...entries.keys()),
      { maxFileBytes: 100 },
    )

    expect(consumed.sort()).toEqual([
      'debug/maa.log',
      'debug/on_error/2026.01.01-00.00.00.001_Node.png',
      'debug/report.txt',
    ])
    expect(readVolume).toHaveBeenCalledTimes(2)
  })

  it('rejects a dangerous plan before the second archive read', async () => {
    const archive = makeZip({ 'debug/maa.log': 'x'.repeat(2048) })
    const input = { source: archive, name: 'logs.zip', size: archive.byteLength }
    const readVolume = vi.fn(async ({ source }: ArchiveVolumeInput<Uint8Array>) => source)
    const inspected = await inspectArchiveVolumes([input], readVolume)

    await expectBudgetCode(
      readSelectedArchiveVolumes(
        inspected,
        createArchiveSelection(['debug/maa.log'], 'debug'),
        readVolume,
        vi.fn(),
        { compressionRatioMinBytes: 1, maxCompressionRatio: 2 },
      ),
      'compression-ratio',
    )
    expect(readVolume).toHaveBeenCalledTimes(1)
  })

  it('rechecks archive metadata before inflation if a volume changes during selection', async () => {
    const original = makeZip({ 'debug/maa.log': 'small' })
    const changed = makeZip({ 'debug/maa.log': 'x'.repeat(256) })
    const input = { source: 'logs.zip', name: 'logs.zip', size: original.byteLength }
    const readVolume = vi.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(changed)
    const inspected = await inspectArchiveVolumes([input], readVolume)
    const consumeEntries = vi.fn()

    await expectBudgetCode(
      readSelectedArchiveVolumes(
        inspected,
        createArchiveSelection(['debug/maa.log'], 'debug'),
        readVolume,
        consumeEntries,
        { maxFileBytes: 100 },
      ),
      'file-size',
    )
    expect(consumeEntries).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'stored', level: 0 },
    { name: 'deflated', level: 9 },
  ])('stops $name entries whose actual output exceeds the declared size', async ({ level }) => {
    const honest = zipSync(
      { 'debug/maa.log': strToU8('x'.repeat(2 * 1024 * 1024)) },
      { level: level as 0 | 9 },
    )
    const archive = falsifyFirstEntryOriginalSize(honest, 16)
    const input = { source: archive, name: 'logs.zip', size: archive.byteLength }
    const readVolume = vi.fn(async ({ source }: ArchiveVolumeInput<Uint8Array>) => source)
    const inspected = await inspectArchiveVolumes([input], readVolume)
    const consumeEntries = vi.fn()

    await expect(readSelectedArchiveVolumes(
      inspected,
      createArchiveSelection(['debug/maa.log'], 'debug'),
      readVolume,
      consumeEntries,
      null,
    )).rejects.toBeInstanceOf(ArchiveIntegrityError)
    expect(consumeEntries).not.toHaveBeenCalled()
  })

  it('rejects non-canonical and cross-volume duplicate paths', async () => {
    expect(() => canonicalizeArchivePath('debug/../outside.txt')).toThrow(ArchiveIntegrityError)
    expect(() => canonicalizeArchivePath('/absolute/maa.log')).toThrow(ArchiveIntegrityError)

    const first = makeZip({ 'debug/maa.log': 'first' })
    const second = makeZip({ 'debug\\maa.log': 'second' })
    const inputs = [
      { source: first, name: 'part01.zip', size: first.byteLength },
      { source: second, name: 'part02.zip', size: second.byteLength },
    ]
    const readVolume = vi.fn(async ({ source }: ArchiveVolumeInput<Uint8Array>) => source)

    await expect(inspectArchiveVolumes(inputs, readVolume)).rejects.toBeInstanceOf(ArchiveIntegrityError)
  })

})
