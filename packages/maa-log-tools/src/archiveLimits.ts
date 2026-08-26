import {
  Unzip,
  UnzipInflate,
  unzipSync,
  type UnzipFile,
  type UnzipFileInfo,
  type Unzipped,
} from 'fflate'

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
    super(`Input ${code} exceeds the configured limit (${actual} > ${limit})`)
  }
}

export type ArchiveFormatCode =
  | 'invalid-structure'
  | 'unsupported-archive'
  | 'invalid-path'
  | 'duplicate-path'
  | 'local-entry-mismatch'
  | 'declared-size-mismatch'
  | 'actual-size-mismatch'
  | 'unsupported-compression'
  | 'missing-entry'

export class ArchiveFormatError extends Error {
  readonly name = 'ArchiveFormatError'

  constructor(
    readonly code: ArchiveFormatCode,
    readonly entryName: string,
    message: string,
  ) {
    super(message)
  }
}

export interface ArchiveEntryMetadata {
  name: string
  size: number
  originalSize: number
  compression: number
}

export interface ArchiveDirectoryBudget {
  totalPathBytes: number
}

export interface ExtractionBudget {
  extractedBytes: number
}

// Keep these build-time defaults aligned with config/archive-limits.json. The
// package test suite reads that shared file and fails if either copy drifts.
export const DEFAULT_ARCHIVE_LIMITS: Readonly<ArchiveLimits> = Object.freeze({
  maxVolumes: 16,
  maxCompressedBytes: 268_435_456,
  maxPathBytes: 4_096,
  maxTotalPathBytes: 8_388_608,
  maxFileBytes: 268_435_456,
  maxImageBytes: 33_554_432,
  maxExtractedBytes: 536_870_912,
  maxCompressionRatio: 500,
  compressionRatioMinBytes: 1_048_576,
})

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

const validateLimits = (limits: ArchiveLimits): Readonly<ArchiveLimits> => {
  for (const key of integerLimitKeys) {
    const value = limits[key]
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`Archive limit ${key} must be a non-negative safe integer`)
    }
  }
  if (!Number.isFinite(limits.maxCompressionRatio) || limits.maxCompressionRatio < 0) {
    throw new RangeError('Archive limit maxCompressionRatio must be a non-negative finite number')
  }
  return Object.freeze(limits)
}

export const resolveArchiveLimits = (
  overrides: Partial<ArchiveLimits> = {},
): Readonly<ArchiveLimits> => validateLimits({
  ...DEFAULT_ARCHIVE_LIMITS,
  ...overrides,
})

export const EMPTY_ARCHIVE_DIRECTORY_BUDGET: Readonly<ArchiveDirectoryBudget> = Object.freeze({
  totalPathBytes: 0,
})

export const EMPTY_EXTRACTION_BUDGET: Readonly<ExtractionBudget> = Object.freeze({
  extractedBytes: 0,
})

const assertMetadataInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid input metadata: ${label} must be a non-negative safe integer`)
  }
}

const addSize = (total: number, value: number, label: string): number => {
  assertMetadataInteger(total, `${label} total`)
  assertMetadataInteger(value, label)
  const next = total + value
  if (!Number.isSafeInteger(next)) {
    throw new Error(`Invalid input metadata: ${label} total exceeds the safe integer range`)
  }
  return next
}

const throwLimitError = (
  code: ArchiveLimitCode,
  actual: number,
  limit: number,
): never => {
  throw new ArchiveLimitError(code, actual, limit)
}

export const assertArchiveInputsWithinLimits = (
  inputs: readonly { size: number }[],
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): void => {
  if (inputs.length > limits.maxVolumes) {
    throwLimitError('volume-count', inputs.length, limits.maxVolumes)
  }

  let total = 0
  for (const input of inputs) {
    total = addSize(total, input.size, 'compressed size')
    if (total > limits.maxCompressedBytes) {
      throwLimitError('compressed-size', total, limits.maxCompressedBytes)
    }
  }
}

const utf8Encoder = new TextEncoder()

interface CanonicalArchivePath {
  canonical: string
  identity: string
}

const throwFormatError = (
  code: ArchiveFormatCode,
  entryName: string,
  message: string,
): never => {
  throw new ArchiveFormatError(code, entryName, message)
}

const canonicalizeArchivePath = (rawPath: string): CanonicalArchivePath => {
  if (rawPath.length === 0 || rawPath.includes('\\') || rawPath.normalize('NFC') !== rawPath) {
    throwFormatError('invalid-path', rawPath, `Archive entry uses a non-canonical path: ${rawPath}`)
  }
  if (/[\u0000-\u001f\u007f]/u.test(rawPath) || rawPath.startsWith('/')) {
    throwFormatError('invalid-path', rawPath, `Archive entry uses an unsafe path: ${rawPath}`)
  }

  const isDirectory = rawPath.endsWith('/')
  const canonical = isDirectory ? rawPath.slice(0, -1) : rawPath
  if (canonical.length === 0) {
    throwFormatError('invalid-path', rawPath, `Archive entry uses an empty path: ${rawPath}`)
  }

  const segments = canonical.split('/')
  for (const [index, segment] of segments.entries()) {
    if (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || segment.endsWith('.')
      || segment.endsWith(' ')
      || segment.includes(':')
      || (index === 0 && /^[a-z]:$/iu.test(segment))
    ) {
      throwFormatError('invalid-path', rawPath, `Archive entry uses a path alias: ${rawPath}`)
    }
  }

  return {
    canonical,
    identity: canonical.toLowerCase(),
  }
}

export const addArchiveDirectoryEntry = (
  current: Readonly<ArchiveDirectoryBudget>,
  entry: Pick<ArchiveEntryMetadata, 'name' | 'size' | 'originalSize' | 'compression'>,
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): ArchiveDirectoryBudget => {
  if (typeof entry.name !== 'string') {
    throw new Error('Invalid input metadata: entry name must be a string')
  }
  assertMetadataInteger(entry.size, 'compressed entry size')
  assertMetadataInteger(entry.originalSize, 'original entry size')
  assertMetadataInteger(entry.compression, 'compression method')

  const pathBytes = utf8Encoder.encode(entry.name).byteLength
  if (pathBytes > limits.maxPathBytes) {
    throwLimitError('path-size', pathBytes, limits.maxPathBytes)
  }
  const totalPathBytes = addSize(current.totalPathBytes, pathBytes, 'path size')
  if (totalPathBytes > limits.maxTotalPathBytes) {
    throwLimitError('total-path-size', totalPathBytes, limits.maxTotalPathBytes)
  }

  return { totalPathBytes }
}

const copyEntryMetadata = (entry: UnzipFileInfo): ArchiveEntryMetadata => ({
  name: entry.name,
  size: entry.size,
  originalSize: entry.originalSize,
  compression: entry.compression,
})

interface RawCentralEntry {
  flags: number
  compression: number
  crc32: number
  size: number
  originalSize: number
  localHeaderOffset: number
  rawName: Uint8Array
}

const readU16 = (data: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 2 > data.byteLength) {
    throwFormatError('invalid-structure', '', 'ZIP record is truncated')
  }
  return data[offset] | (data[offset + 1] << 8)
}

const readU32 = (data: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 4 > data.byteLength) {
    throwFormatError('invalid-structure', '', 'ZIP record is truncated')
  }
  return (
    data[offset]
    | (data[offset + 1] << 8)
    | (data[offset + 2] << 16)
    | (data[offset + 3] << 24)
  ) >>> 0
}

const findEndOfCentralDirectory = (data: Uint8Array): number => {
  const minimumOffset = Math.max(0, data.byteLength - 65_557)
  for (let offset = data.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (readU32(data, offset) !== 0x0605_4b50) continue
    const commentBytes = readU16(data, offset + 20)
    if (offset + 22 + commentBytes === data.byteLength) return offset
  }
  return throwFormatError('invalid-structure', '', 'ZIP end-of-central-directory record is missing')
}

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const parseAndValidateRawZipRecords = (data: Uint8Array): RawCentralEntry[] => {
  const eocdOffset = findEndOfCentralDirectory(data)
  const diskNumber = readU16(data, eocdOffset + 4)
  const centralDisk = readU16(data, eocdOffset + 6)
  const entriesOnDisk = readU16(data, eocdOffset + 8)
  const totalEntries = readU16(data, eocdOffset + 10)
  const centralSize = readU32(data, eocdOffset + 12)
  const centralOffset = readU32(data, eocdOffset + 16)
  if (
    diskNumber !== 0
    || centralDisk !== 0
    || entriesOnDisk !== totalEntries
    || totalEntries === 0xffff
    || centralSize === 0xffff_ffff
    || centralOffset === 0xffff_ffff
  ) {
    throwFormatError('unsupported-archive', '', 'Multi-disk and ZIP64 archives are not supported')
  }
  if (centralOffset + centralSize !== eocdOffset) {
    throwFormatError('invalid-structure', '', 'ZIP central-directory bounds are inconsistent')
  }

  const entries: RawCentralEntry[] = []
  let offset = centralOffset
  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(data, offset) !== 0x0201_4b50) {
      throwFormatError('invalid-structure', '', 'ZIP central-directory entry is malformed')
    }
    const nameBytes = readU16(data, offset + 28)
    const extraBytes = readU16(data, offset + 30)
    const commentBytes = readU16(data, offset + 32)
    const recordEnd = offset + 46 + nameBytes + extraBytes + commentBytes
    if (recordEnd > eocdOffset) {
      throwFormatError('invalid-structure', '', 'ZIP central-directory entry is truncated')
    }
    const size = readU32(data, offset + 20)
    const originalSize = readU32(data, offset + 24)
    const localHeaderOffset = readU32(data, offset + 42)
    if (size === 0xffff_ffff || originalSize === 0xffff_ffff || localHeaderOffset === 0xffff_ffff) {
      throwFormatError('unsupported-archive', '', 'ZIP64 entries are not supported')
    }
    entries.push({
      flags: readU16(data, offset + 8),
      compression: readU16(data, offset + 10),
      crc32: readU32(data, offset + 16),
      size,
      originalSize,
      localHeaderOffset,
      rawName: data.subarray(offset + 46, offset + 46 + nameBytes),
    })
    offset = recordEnd
  }
  if (offset !== eocdOffset) {
    throwFormatError('invalid-structure', '', 'ZIP central-directory size does not match its entries')
  }

  const localRanges: Array<{ start: number; end: number }> = []
  const localOffsets = new Set<number>()
  for (const entry of entries) {
    const localOffset = entry.localHeaderOffset
    if (localOffsets.has(localOffset) || readU32(data, localOffset) !== 0x0403_4b50) {
      throwFormatError('local-entry-mismatch', '', 'ZIP local-header offsets are invalid or duplicated')
    }
    localOffsets.add(localOffset)
    const localFlags = readU16(data, localOffset + 6)
    const localCompression = readU16(data, localOffset + 8)
    const localCrc32 = readU32(data, localOffset + 14)
    const localSize = readU32(data, localOffset + 18)
    const localOriginalSize = readU32(data, localOffset + 22)
    const nameBytes = readU16(data, localOffset + 26)
    const extraBytes = readU16(data, localOffset + 28)
    const payloadOffset = localOffset + 30 + nameBytes + extraBytes
    const rawLocalName = data.subarray(localOffset + 30, localOffset + 30 + nameBytes)
    if (
      payloadOffset > centralOffset
      || localFlags !== entry.flags
      || localCompression !== entry.compression
      || !equalBytes(rawLocalName, entry.rawName)
    ) {
      throwFormatError('local-entry-mismatch', '', 'ZIP local and central entry declarations differ')
    }
    if ((localFlags & 1) !== 0) {
      throwFormatError('unsupported-archive', '', 'Encrypted ZIP entries are not supported')
    }

    const usesDescriptor = (localFlags & 8) !== 0
    if (!usesDescriptor && (
      localCrc32 !== entry.crc32
      || localSize !== entry.size
      || localOriginalSize !== entry.originalSize
    )) {
      throwFormatError('declared-size-mismatch', '', 'ZIP local and central sizes differ')
    }
    if (usesDescriptor && (
      (localCrc32 !== 0 && localCrc32 !== entry.crc32)
      || (localSize !== 0 && localSize !== entry.size)
      || (localOriginalSize !== 0 && localOriginalSize !== entry.originalSize)
    )) {
      throwFormatError('declared-size-mismatch', '', 'ZIP streaming local sizes conflict with the central directory')
    }

    const payloadEnd = payloadOffset + entry.size
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > centralOffset) {
      throwFormatError('invalid-structure', '', 'ZIP entry payload exceeds the local-file area')
    }
    let recordEnd = payloadEnd
    if (usesDescriptor) {
      const hasSignature = readU32(data, recordEnd) === 0x0807_4b50
      if (hasSignature) recordEnd += 4
      const descriptorCrc32 = readU32(data, recordEnd)
      const descriptorSize = readU32(data, recordEnd + 4)
      const descriptorOriginalSize = readU32(data, recordEnd + 8)
      recordEnd += 12
      if (
        descriptorCrc32 !== entry.crc32
        || descriptorSize !== entry.size
        || descriptorOriginalSize !== entry.originalSize
      ) {
        throwFormatError('declared-size-mismatch', '', 'ZIP data descriptor conflicts with the central directory')
      }
    }
    if (recordEnd > centralOffset) {
      throwFormatError('invalid-structure', '', 'ZIP local entry overlaps the central directory')
    }
    localRanges.push({ start: localOffset, end: recordEnd })
  }

  localRanges.sort((left, right) => left.start - right.start)
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index].start < localRanges[index - 1].end) {
      throwFormatError('invalid-structure', '', 'ZIP local entries overlap')
    }
  }
  return entries
}

export const inspectZipDirectory = (
  data: Uint8Array,
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): ArchiveEntryMetadata[] => {
  assertArchiveInputsWithinLimits([{ size: data.byteLength }], limits)
  const rawEntries = parseAndValidateRawZipRecords(data)

  const entries: ArchiveEntryMetadata[] = []
  let directoryBudget = EMPTY_ARCHIVE_DIRECTORY_BUDGET
  const rawPaths = new Set<string>()
  const canonicalPaths = new Set<string>()
  unzipSync(data, {
    filter: (entry) => {
      const metadata = copyEntryMetadata(entry)
      const rawEntry = rawEntries[entries.length]
      if (
        !rawEntry
        || rawEntry.size !== metadata.size
        || rawEntry.originalSize !== metadata.originalSize
        || rawEntry.compression !== metadata.compression
      ) {
        throwFormatError(
          'local-entry-mismatch',
          metadata.name,
          `ZIP parsed metadata is inconsistent for ${metadata.name}`,
        )
      }
      const archivePath = canonicalizeArchivePath(metadata.name)
      if (rawPaths.has(metadata.name) || canonicalPaths.has(archivePath.identity)) {
        throwFormatError(
          'duplicate-path',
          metadata.name,
          `Archive contains duplicate or aliased entry paths: ${metadata.name}`,
        )
      }
      rawPaths.add(metadata.name)
      canonicalPaths.add(archivePath.identity)
      directoryBudget = addArchiveDirectoryEntry(directoryBudget, metadata, limits)
      entries.push(metadata)
      return false
    },
  })
  if (entries.length !== rawEntries.length) {
    throwFormatError('invalid-structure', '', 'ZIP entry count is inconsistent')
  }
  return entries
}

const isImageEntry = (name: string): boolean => /\.(?:png|jpe?g)$/i.test(name)

export const addSelectedEntry = (
  current: Readonly<ExtractionBudget>,
  entry: Pick<ArchiveEntryMetadata, 'name' | 'size' | 'originalSize'>,
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
  checkCompressionRatio: boolean = true,
): ExtractionBudget => {
  assertMetadataInteger(current.extractedBytes, 'extracted size total')
  assertMetadataInteger(entry.size, 'compressed entry size')
  assertMetadataInteger(entry.originalSize, 'original entry size')

  if (entry.originalSize > limits.maxFileBytes) {
    throwLimitError('file-size', entry.originalSize, limits.maxFileBytes)
  }
  if (isImageEntry(entry.name) && entry.originalSize > limits.maxImageBytes) {
    throwLimitError('image-size', entry.originalSize, limits.maxImageBytes)
  }

  const extractedBytes = addSize(current.extractedBytes, entry.originalSize, 'extracted size')
  if (extractedBytes > limits.maxExtractedBytes) {
    throwLimitError('extracted-size', extractedBytes, limits.maxExtractedBytes)
  }

  if (
    checkCompressionRatio
    && entry.originalSize >= limits.compressionRatioMinBytes
    && entry.originalSize > 0
  ) {
    const ratio = entry.size === 0 ? Number.POSITIVE_INFINITY : entry.originalSize / entry.size
    if (ratio > limits.maxCompressionRatio) {
      throwLimitError('compression-ratio', ratio, limits.maxCompressionRatio)
    }
  }

  return { extractedBytes }
}

export const assertSelectedEntriesWithinLimits = (
  entries: readonly Pick<ArchiveEntryMetadata, 'name' | 'size' | 'originalSize'>[],
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): void => {
  let budget = EMPTY_EXTRACTION_BUDGET
  for (const entry of entries) {
    budget = addSelectedEntry(budget, entry, limits)
  }
}

export interface ExtractedZipEntries {
  files: Unzipped
  entries: ArchiveEntryMetadata[]
}

const STREAM_INPUT_CHUNK_BYTES = 16 * 1024

const assertLocalEntryMatchesCentral = (
  file: UnzipFile,
  central: ArchiveEntryMetadata,
): void => {
  if (file.compression !== central.compression) {
    throwFormatError(
      'local-entry-mismatch',
      file.name,
      `ZIP local and central compression methods differ for ${file.name}`,
    )
  }
  if (file.size !== undefined && file.size !== central.size) {
    throwFormatError(
      'declared-size-mismatch',
      file.name,
      `ZIP local and central compressed sizes differ for ${file.name}`,
    )
  }
  if (file.originalSize !== undefined && file.originalSize !== central.originalSize) {
    throwFormatError(
      'declared-size-mismatch',
      file.name,
      `ZIP local and central original sizes differ for ${file.name}`,
    )
  }
}

const extractSelectedEntriesStreaming = (
  data: Uint8Array,
  entries: readonly ArchiveEntryMetadata[],
  selectedNames: ReadonlySet<string>,
  limits: Readonly<ArchiveLimits>,
): Unzipped => {
  const centralByName = new Map(entries.map((entry) => [entry.name, entry]))
  const seenLocalNames = new Set<string>()
  const completedNames = new Set<string>()
  const files = Object.create(null) as Unzipped
  let actualExtractedBytes = 0
  let fatalError: unknown = null

  const fail = (error: unknown): void => {
    if (fatalError == null) fatalError = error
  }

  const unzipper = new Unzip((file) => {
    if (fatalError != null) return
    if (seenLocalNames.has(file.name)) {
      fail(new ArchiveFormatError(
        'duplicate-path',
        file.name,
        `ZIP local headers contain a duplicate entry: ${file.name}`,
      ))
      return
    }
    seenLocalNames.add(file.name)

    const central = centralByName.get(file.name)
    if (!central) {
      fail(new ArchiveFormatError(
        'local-entry-mismatch',
        file.name,
        `ZIP local entry is missing from the central directory: ${file.name}`,
      ))
      return
    }

    try {
      canonicalizeArchivePath(file.name)
      assertLocalEntryMatchesCentral(file, central)
    } catch (error) {
      fail(error)
      return
    }

    if (!selectedNames.has(file.name)) return
    if (central.compression !== 0 && central.compression !== 8) {
      fail(new ArchiveFormatError(
        'unsupported-compression',
        file.name,
        `Unsupported ZIP compression method ${central.compression} for ${file.name}`,
      ))
      return
    }

    const output = new Uint8Array(central.originalSize)
    let outputOffset = 0
    file.ondata = (error, chunk, final) => {
      if (fatalError != null) return
      if (error) {
        fail(error)
        return
      }

      const abortOutput = (outputError: Error): never => {
        fail(outputError)
        throw outputError
      }

      const nextFileSize = outputOffset + chunk.byteLength
      const nextTotalSize = actualExtractedBytes + chunk.byteLength
      if (!Number.isSafeInteger(nextFileSize) || nextFileSize > central.originalSize) {
        abortOutput(new ArchiveFormatError(
          'actual-size-mismatch',
          file.name,
          `ZIP entry output exceeds its declared original size: ${file.name}`,
        ))
      }
      if (nextFileSize > limits.maxFileBytes) {
        abortOutput(new ArchiveLimitError('file-size', nextFileSize, limits.maxFileBytes))
      }
      if (isImageEntry(file.name) && nextFileSize > limits.maxImageBytes) {
        abortOutput(new ArchiveLimitError('image-size', nextFileSize, limits.maxImageBytes))
      }
      if (!Number.isSafeInteger(nextTotalSize) || nextTotalSize > limits.maxExtractedBytes) {
        abortOutput(new ArchiveLimitError('extracted-size', nextTotalSize, limits.maxExtractedBytes))
      }
      if (nextFileSize >= limits.compressionRatioMinBytes && nextFileSize > 0) {
        const actualRatio = central.size === 0
          ? Number.POSITIVE_INFINITY
          : nextFileSize / central.size
        if (actualRatio > limits.maxCompressionRatio) {
          abortOutput(new ArchiveLimitError('compression-ratio', actualRatio, limits.maxCompressionRatio))
        }
      }

      output.set(chunk, outputOffset)
      outputOffset = nextFileSize
      actualExtractedBytes = nextTotalSize

      if (!final) return
      if (outputOffset !== central.originalSize) {
        abortOutput(new ArchiveFormatError(
          'actual-size-mismatch',
          file.name,
          `ZIP entry output does not match its declared original size: ${file.name}`,
        ))
      }
      if (file.originalSize !== undefined && outputOffset !== file.originalSize) {
        abortOutput(new ArchiveFormatError(
          'actual-size-mismatch',
          file.name,
          `ZIP entry output does not match its local declared size: ${file.name}`,
        ))
      }
      files[file.name] = output
      completedNames.add(file.name)
    }

    try {
      file.start()
    } catch (error) {
      fail(error)
    }
  })
  unzipper.register(UnzipInflate)

  try {
    for (let offset = 0; offset < data.byteLength; offset += STREAM_INPUT_CHUNK_BYTES) {
      const end = Math.min(offset + STREAM_INPUT_CHUNK_BYTES, data.byteLength)
      unzipper.push(data.subarray(offset, end), end === data.byteLength)
      if (fatalError != null) throw fatalError
    }
  } catch (error) {
    if (fatalError != null) throw fatalError
    throw error
  }

  for (const entry of entries) {
    if (!seenLocalNames.has(entry.name)) {
      throwFormatError(
        'missing-entry',
        entry.name,
        `ZIP central directory entry has no matching local header: ${entry.name}`,
      )
    }
    if (selectedNames.has(entry.name) && !completedNames.has(entry.name)) {
      throwFormatError(
        'missing-entry',
        entry.name,
        `ZIP selected entry did not finish streaming: ${entry.name}`,
      )
    }
  }

  return files
}

export const extractInspectedZipEntriesWithinLimits = (
  data: Uint8Array,
  entries: readonly ArchiveEntryMetadata[],
  shouldExtract: (entryName: string) => boolean,
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): ExtractedZipEntries => {
  const selectedEntries = entries.filter((entry) => shouldExtract(entry.name))
  assertSelectedEntriesWithinLimits(selectedEntries, limits)

  const selectedNames = new Set(selectedEntries.map((entry) => entry.name))
  const files = extractSelectedEntriesStreaming(data, entries, selectedNames, limits)

  return { files, entries: [...entries] }
}

export const extractZipEntriesWithinLimits = (
  data: Uint8Array,
  shouldExtract: (entryName: string) => boolean,
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): ExtractedZipEntries => {
  const entries = inspectZipDirectory(data, limits)
  return extractInspectedZipEntriesWithinLimits(data, entries, shouldExtract, limits)
}

export const createStoredFileMetadata = (
  name: string,
  size: number,
): ArchiveEntryMetadata => ({
  name,
  size,
  originalSize: size,
  compression: 0,
})
