import { readFile } from 'node:fs/promises'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  ArchiveFormatError,
  ArchiveLimitError,
  DEFAULT_ARCHIVE_LIMITS,
  extractZipEntriesWithinLimits,
  resolveArchiveLimits,
} from '../archiveLimits'

const findSignature = (data: Uint8Array, signature: number): number => {
  for (let offset = 0; offset <= data.byteLength - 4; offset += 1) {
    const current =
      (data[offset] |
        (data[offset + 1] << 8) |
        (data[offset + 2] << 16) |
        (data[offset + 3] << 24)) >>>
      0
    if (current === signature) return offset
  }
  throw new Error(`ZIP signature ${signature.toString(16)} not found`)
}

const writeU32 = (data: Uint8Array, offset: number, value: number): void => {
  data[offset] = value & 0xff
  data[offset + 1] = (value >>> 8) & 0xff
  data[offset + 2] = (value >>> 16) & 0xff
  data[offset + 3] = (value >>> 24) & 0xff
}

const forgeDeclaredOriginalSize = (
  archive: Uint8Array,
  declaredSize: number,
  locations: 'local' | 'central' | 'both' = 'both',
): Uint8Array => {
  const forged = archive.slice()
  if (locations === 'local' || locations === 'both') {
    writeU32(forged, findSignature(forged, 0x0403_4b50) + 22, declaredSize)
  }
  if (locations === 'central' || locations === 'both') {
    writeU32(forged, findSignature(forged, 0x0201_4b50) + 24, declaredSize)
  }
  return forged
}

const expectLimitCode = (run: () => unknown, code: ArchiveLimitError['code']): void => {
  try {
    run()
    throw new Error('Expected an ArchiveLimitError')
  } catch (error) {
    expect(error).toBeInstanceOf(ArchiveLimitError)
    expect((error as ArchiveLimitError).code).toBe(code)
  }
}

describe('Node archive resource budgets', () => {
  it('keeps package defaults aligned with the shared archive configuration', async () => {
    const configUrl = new URL('../../../../config/archive-limits.json', import.meta.url)
    const configured = JSON.parse(await readFile(configUrl, 'utf8')) as unknown
    expect(DEFAULT_ARCHIVE_LIMITS).toEqual(configured)
  })

  it('rejects invalid budget overrides', () => {
    expect(() => resolveArchiveLimits({ maxPathBytes: -1 })).toThrow(RangeError)
    expect(() => resolveArchiveLimits({ maxCompressionRatio: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    )
  })

  it('rejects oversized archive buffers before inspecting entries', () => {
    const zipData = zipSync({ 'maa.log': strToU8('test') })
    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(zipData, () => true, resolveArchiveLimits({ maxVolumes: 0 })),
      'volume-count',
    )
    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(
          zipData,
          () => true,
          resolveArchiveLimits({ maxCompressedBytes: zipData.byteLength - 1 }),
        ),
      'compressed-size',
    )
  })

  it('bounds central-directory path metadata', () => {
    const zipData = zipSync({
      'maa.log': strToU8('main'),
      'notes.txt': strToU8('notes'),
    })
    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(
          zipData,
          () => true,
          resolveArchiveLimits({ maxPathBytes: 3 }),
        ),
      'path-size',
    )
    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(
          zipData,
          () => true,
          resolveArchiveLimits({ maxTotalPathBytes: 10 }),
        ),
      'total-path-size',
    )
  })

  it('checks selected file, image, aggregate, and compression-ratio sizes before extraction', () => {
    const zipData = zipSync(
      {
        'maa.log': strToU8('main log data'),
        'on_error/image.png': new Uint8Array(32),
      },
      { level: 9 },
    )

    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(
          zipData,
          () => true,
          resolveArchiveLimits({ maxFileBytes: 5 }),
        ),
      'file-size',
    )
    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(
          zipData,
          () => true,
          resolveArchiveLimits({ maxImageBytes: 10 }),
        ),
      'image-size',
    )
    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(
          zipData,
          () => true,
          resolveArchiveLimits({ maxExtractedBytes: 20 }),
        ),
      'extracted-size',
    )
    expectLimitCode(
      () =>
        extractZipEntriesWithinLimits(
          zipData,
          () => true,
          resolveArchiveLimits({ compressionRatioMinBytes: 1, maxCompressionRatio: 1 }),
        ),
      'compression-ratio',
    )
  })

  it('does not charge unselected payloads against extraction budgets', () => {
    const zipData = zipSync({
      'maa.log': strToU8('main'),
      'unrelated.bin': new Uint8Array(1_024),
    })
    const extracted = extractZipEntriesWithinLimits(
      zipData,
      (name) => name === 'maa.log',
      resolveArchiveLimits({ maxFileBytes: 10, maxExtractedBytes: 10 }),
    )
    expect(Object.keys(extracted.files)).toEqual(['maa.log'])
  })

  it.each([
    { label: 'stored', level: 0 as const },
    { label: 'deflate', level: 9 as const },
  ])('rejects forged $label local and central original sizes while streaming', ({ level }) => {
    const archive = zipSync({ 'maa.log': new Uint8Array(4_096) }, { level })
    const forged = forgeDeclaredOriginalSize(archive, 32)
    expect(() =>
      extractZipEntriesWithinLimits(
        forged,
        () => true,
        resolveArchiveLimits({ compressionRatioMinBytes: 10_000 }),
      ),
    ).toThrow(
      expect.objectContaining<Partial<ArchiveFormatError>>({
        name: 'ArchiveFormatError',
        code: 'actual-size-mismatch',
      }),
    )
  })

  it('rejects local and central declarations that disagree before extraction', () => {
    const archive = zipSync({ 'maa.log': strToU8('main log') })
    const forged = forgeDeclaredOriginalSize(archive, 1, 'local')
    expect(() => extractZipEntriesWithinLimits(forged, () => true)).toThrow(
      expect.objectContaining<Partial<ArchiveFormatError>>({
        name: 'ArchiveFormatError',
        code: 'declared-size-mismatch',
      }),
    )
  })

  it('rejects non-canonical and case-aliased archive paths', () => {
    const nonCanonical = zipSync({ './maa.log': strToU8('main') })
    expect(() => extractZipEntriesWithinLimits(nonCanonical, () => true)).toThrow(
      expect.objectContaining<Partial<ArchiveFormatError>>({ code: 'invalid-path' }),
    )

    const aliased = zipSync({
      'maa.log': strToU8('one'),
      'MAA.LOG': strToU8('two'),
    })
    expect(() => extractZipEntriesWithinLimits(aliased, () => true)).toThrow(
      expect.objectContaining<Partial<ArchiveFormatError>>({ code: 'duplicate-path' }),
    )
  })
})
