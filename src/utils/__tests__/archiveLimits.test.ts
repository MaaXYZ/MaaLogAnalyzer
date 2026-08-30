import { describe, expect, it } from 'vitest'
import {
  addArchiveDirectoryEntries,
  ArchiveLimitError,
  assertArchiveInputsWithinLimits,
  assertSelectedArchiveEntriesWithinLimits,
  DEFAULT_ARCHIVE_LIMITS,
  EMPTY_ARCHIVE_DIRECTORY_BUDGET,
  resolveArchiveLimits,
  type ArchiveEntryMetadata,
  type ArchiveLimitCode,
} from '../archiveLimits'

const entry = (overrides: Partial<ArchiveEntryMetadata> = {}): ArchiveEntryMetadata => ({
  name: 'entry.log',
  size: 1,
  originalSize: 1,
  compression: 8,
  ...overrides,
})

const captureLimitError = (action: () => void, code: ArchiveLimitCode): ArchiveLimitError => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(ArchiveLimitError)
    expect(error).toMatchObject({ code })
    return error as ArchiveLimitError
  }
  throw new Error(`Expected archive limit error: ${code}`)
}

describe('archive limits', () => {
  it('loads the shared default resource budgets', () => {
    expect(DEFAULT_ARCHIVE_LIMITS).toEqual({
      maxVolumes: 16,
      maxCompressedBytes: 256 * 1024 * 1024,
      maxPathBytes: 4_096,
      maxTotalPathBytes: 8 * 1024 * 1024,
      maxFileBytes: 256 * 1024 * 1024,
      maxImageBytes: 32 * 1024 * 1024,
      maxExtractedBytes: 512 * 1024 * 1024,
      maxCompressionRatio: 500,
      compressionRatioMinBytes: 1024 * 1024,
    })
  })

  it('applies volume and aggregate compressed-size limits', () => {
    const limits = resolveArchiveLimits({
      maxVolumes: 1,
      maxCompressedBytes: 5,
    })

    captureLimitError(
      () => assertArchiveInputsWithinLimits([{ size: 1 }, { size: 1 }], limits),
      'volume-count',
    )
    captureLimitError(
      () =>
        assertArchiveInputsWithinLimits([{ size: 3 }, { size: 3 }], {
          ...limits,
          maxVolumes: 2,
        }),
      'compressed-size',
    )
  })

  it('applies UTF-8 path budgets', () => {
    captureLimitError(
      () =>
        addArchiveDirectoryEntries(
          EMPTY_ARCHIVE_DIRECTORY_BUDGET,
          [entry({ name: '\u4e2d' })],
          resolveArchiveLimits({ maxPathBytes: 2 }),
        ),
      'path-size',
    )
    captureLimitError(
      () =>
        addArchiveDirectoryEntries(
          EMPTY_ARCHIVE_DIRECTORY_BUDGET,
          [entry({ name: 'ab' }), entry({ name: 'cd' })],
          resolveArchiveLimits({ maxTotalPathBytes: 3 }),
        ),
      'total-path-size',
    )
  })

  it('applies selected file, image, total expansion, and ratio budgets', () => {
    captureLimitError(
      () =>
        assertSelectedArchiveEntriesWithinLimits(
          [entry({ originalSize: 6 })],
          resolveArchiveLimits({ maxFileBytes: 5 }),
        ),
      'file-size',
    )
    captureLimitError(
      () =>
        assertSelectedArchiveEntriesWithinLimits(
          [entry({ name: 'image.png', originalSize: 4 })],
          resolveArchiveLimits({ maxFileBytes: 10, maxImageBytes: 3 }),
        ),
      'image-size',
    )
    captureLimitError(
      () =>
        assertSelectedArchiveEntriesWithinLimits(
          [entry({ originalSize: 4 }), entry({ originalSize: 3 })],
          resolveArchiveLimits({ maxFileBytes: 10, maxExtractedBytes: 6 }),
        ),
      'extracted-size',
    )
    captureLimitError(
      () =>
        assertSelectedArchiveEntriesWithinLimits(
          [entry({ size: 1, originalSize: 10 })],
          resolveArchiveLimits({
            maxFileBytes: 10,
            maxExtractedBytes: 10,
            maxCompressionRatio: 9,
            compressionRatioMinBytes: 10,
          }),
        ),
      'compression-ratio',
    )

    expect(() =>
      assertSelectedArchiveEntriesWithinLimits(
        [entry({ size: 0, originalSize: 9 })],
        resolveArchiveLimits({
          maxFileBytes: 10,
          maxExtractedBytes: 10,
          maxCompressionRatio: 1,
          compressionRatioMinBytes: 10,
        }),
      ),
    ).not.toThrow()
  })
})
