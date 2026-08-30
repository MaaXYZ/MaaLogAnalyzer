import configuredArchiveLimits from '../../config/archive-limits.json'

export interface ArchiveLimits {
  maxVolumes: number
  maxCompressedBytes: number
  maxPathBytes: number
  maxTotalPathBytes: number
  maxFileBytes: number
  maxImageBytes: number
  maxExtractedBytes: number
  maxCompressionRatio: number
  compressionRatioMinBytes: number
}

export interface ArchiveInputMetadata {
  size: number
}

export interface ArchiveEntryMetadata {
  name: string
  size: number
  originalSize: number
  compression: number
}

export type ArchiveLimitCode =
  | 'volume-count'
  | 'compressed-size'
  | 'path-size'
  | 'total-path-size'
  | 'file-size'
  | 'image-size'
  | 'extracted-size'
  | 'compression-ratio'

export class ArchiveLimitError extends Error {
  readonly name = 'ArchiveLimitError'

  constructor(
    readonly code: ArchiveLimitCode,
    readonly actual: number,
    readonly limit: number,
  ) {
    super(`Archive ${code} exceeds the configured limit (${actual} > ${limit})`)
  }
}

const integerLimitKeys = [
  'maxVolumes',
  'maxCompressedBytes',
  'maxPathBytes',
  'maxTotalPathBytes',
  'maxFileBytes',
  'maxImageBytes',
  'maxExtractedBytes',
  'compressionRatioMinBytes',
] as const satisfies readonly (keyof ArchiveLimits)[]

const validateLimits = (limits: ArchiveLimits): ArchiveLimits => {
  for (const key of integerLimitKeys) {
    const value = limits[key]
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`Archive limit ${key} must be a non-negative safe integer`)
    }
  }
  if (!Number.isFinite(limits.maxCompressionRatio) || limits.maxCompressionRatio < 0) {
    throw new RangeError('Archive limit maxCompressionRatio must be a non-negative finite number')
  }
  return limits
}

export const DEFAULT_ARCHIVE_LIMITS: Readonly<ArchiveLimits> = Object.freeze(
  validateLimits({ ...configuredArchiveLimits }),
)

export const resolveArchiveLimits = (
  overrides: Partial<ArchiveLimits> = {},
): Readonly<ArchiveLimits> =>
  Object.freeze(
    validateLimits({
      ...DEFAULT_ARCHIVE_LIMITS,
      ...overrides,
    }),
  )

const throwLimitError = (code: ArchiveLimitCode, actual: number, limit: number): never => {
  throw new ArchiveLimitError(code, actual, limit)
}

const assertMetadataInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ZIP metadata: ${label} must be a non-negative safe integer`)
  }
}

const addMetadataSize = (total: number, value: number, label: string): number => {
  assertMetadataInteger(value, label)
  const next = total + value
  if (!Number.isSafeInteger(next)) {
    throw new Error(`Invalid ZIP metadata: ${label} total exceeds the safe integer range`)
  }
  return next
}

export const assertArchiveInputsWithinLimits = (
  inputs: readonly ArchiveInputMetadata[],
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): void => {
  if (inputs.length > limits.maxVolumes) {
    throwLimitError('volume-count', inputs.length, limits.maxVolumes)
  }

  let compressedBytes = 0
  for (const input of inputs) {
    compressedBytes = addMetadataSize(compressedBytes, input.size, 'compressed size')
    if (compressedBytes > limits.maxCompressedBytes) {
      throwLimitError('compressed-size', compressedBytes, limits.maxCompressedBytes)
    }
  }
}

const utf8Encoder = new TextEncoder()

export interface ArchiveDirectoryBudget {
  totalPathBytes: number
}

export const EMPTY_ARCHIVE_DIRECTORY_BUDGET: Readonly<ArchiveDirectoryBudget> = Object.freeze({
  totalPathBytes: 0,
})

export const addArchiveDirectoryEntry = (
  current: Readonly<ArchiveDirectoryBudget>,
  entry: ArchiveEntryMetadata,
  limits: Readonly<ArchiveLimits> | null = DEFAULT_ARCHIVE_LIMITS,
): ArchiveDirectoryBudget => {
  assertMetadataInteger(current.totalPathBytes, 'path size')
  if (typeof entry.name !== 'string') {
    throw new Error('Invalid ZIP metadata: entry name must be a string')
  }
  assertMetadataInteger(entry.size, 'compressed entry size')
  assertMetadataInteger(entry.originalSize, 'original entry size')
  assertMetadataInteger(entry.compression, 'compression method')

  if (!limits) return current

  const pathBytes = utf8Encoder.encode(entry.name).byteLength
  if (pathBytes > limits.maxPathBytes) {
    throwLimitError('path-size', pathBytes, limits.maxPathBytes)
  }
  const totalPathBytes = addMetadataSize(current.totalPathBytes, pathBytes, 'path size')
  if (totalPathBytes > limits.maxTotalPathBytes) {
    throwLimitError('total-path-size', totalPathBytes, limits.maxTotalPathBytes)
  }

  return { totalPathBytes }
}

export const addArchiveDirectoryEntries = (
  current: Readonly<ArchiveDirectoryBudget>,
  entries: readonly ArchiveEntryMetadata[],
  limits: Readonly<ArchiveLimits> | null = DEFAULT_ARCHIVE_LIMITS,
): ArchiveDirectoryBudget => {
  let budget = current
  for (const entry of entries) {
    budget = addArchiveDirectoryEntry(budget, entry, limits)
  }
  return budget
}

export const isArchiveImageEntry = (path: string): boolean =>
  /\.(?:png|jpe?g)$/i.test(path.replace(/\\/g, '/'))

export const assertSelectedArchiveEntriesWithinLimits = (
  entries: readonly ArchiveEntryMetadata[],
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): void => {
  let extractedBytes = 0

  for (const entry of entries) {
    assertMetadataInteger(entry.size, 'compressed entry size')
    assertMetadataInteger(entry.originalSize, 'original entry size')

    if (entry.originalSize > limits.maxFileBytes) {
      throwLimitError('file-size', entry.originalSize, limits.maxFileBytes)
    }
    if (isArchiveImageEntry(entry.name) && entry.originalSize > limits.maxImageBytes) {
      throwLimitError('image-size', entry.originalSize, limits.maxImageBytes)
    }

    extractedBytes = addMetadataSize(extractedBytes, entry.originalSize, 'extracted size')
    if (extractedBytes > limits.maxExtractedBytes) {
      throwLimitError('extracted-size', extractedBytes, limits.maxExtractedBytes)
    }

    if (entry.originalSize >= limits.compressionRatioMinBytes && entry.originalSize > 0) {
      const compressionRatio =
        entry.size === 0 ? Number.POSITIVE_INFINITY : entry.originalSize / entry.size
      if (compressionRatio > limits.maxCompressionRatio) {
        throwLimitError('compression-ratio', compressionRatio, limits.maxCompressionRatio)
      }
    }
  }
}
