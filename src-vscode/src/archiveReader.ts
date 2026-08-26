import configuredArchiveLimits from '../../config/archive-limits.json'
import { Unzip, UnzipInflate, unzipSync, type UnzipFileInfo } from 'fflate'

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

export type ArchiveBudgetCode =
  | 'volume-count'
  | 'compressed-size'
  | 'path-size'
  | 'total-path-size'
  | 'file-size'
  | 'image-size'
  | 'extracted-size'
  | 'compression-ratio'

const archiveBudgetCodes: ReadonlySet<ArchiveBudgetCode> = new Set([
  'volume-count',
  'compressed-size',
  'path-size',
  'total-path-size',
  'file-size',
  'image-size',
  'extracted-size',
  'compression-ratio',
])

export class ArchiveBudgetError extends Error {
  readonly name = 'ArchiveBudgetError'

  constructor(
    readonly code: ArchiveBudgetCode,
    readonly actual: number,
    readonly limit: number,
  ) {
    super(`Archive ${code} exceeds the configured limit (${actual} > ${limit})`)
  }
}

export const getArchiveBudgetCode = (error: unknown): ArchiveBudgetCode | null => {
  if (error instanceof ArchiveBudgetError) return error.code

  const message = error instanceof Error ? error.message : String(error)
  const match = /Archive ([a-z-]+) exceeds the configured limit/u.exec(message)
  const code = match?.[1]
  return archiveBudgetCodes.has(code as ArchiveBudgetCode)
    ? code as ArchiveBudgetCode
    : null
}

export class ArchiveIntegrityError extends Error {
  readonly name = 'ArchiveIntegrityError'
}

export class LoadOperationCancelledError extends Error {
  readonly name = 'LoadOperationCancelledError'

  constructor() {
    super('Load operation was superseded or cancelled')
  }
}

export class LoadOperationDeliveryError extends Error {
  readonly name = 'LoadOperationDeliveryError'
}

export interface LoadOperation {
  readonly generation: number
  readonly cancelled: boolean
  throwIfCancelled(): void
}

class CoordinatedLoadOperation implements LoadOperation {
  private wasCancelled = false

  constructor(
    readonly generation: number,
    private readonly isStillCurrent: () => boolean,
  ) {}

  get cancelled(): boolean {
    return this.wasCancelled || !this.isStillCurrent()
  }

  cancel(): void {
    this.wasCancelled = true
  }

  throwIfCancelled(): void {
    if (this.cancelled) throw new LoadOperationCancelledError()
  }
}

/** Coordinates latest-wins analysis requests and serializes archive memory use. */
export class LoadOperationCoordinator {
  private nextGeneration = 0
  private currentOperation: CoordinatedLoadOperation | undefined
  private archiveTail: Promise<void> = Promise.resolve()

  begin(): LoadOperation {
    this.currentOperation?.cancel()
    const operation: CoordinatedLoadOperation = new CoordinatedLoadOperation(
      ++this.nextGeneration,
      (): boolean => this.currentOperation === operation,
    )
    this.currentOperation = operation
    return operation
  }

  cancelCurrent(): void {
    this.currentOperation?.cancel()
    this.currentOperation = undefined
  }

  async runArchiveExclusive<T>(
    operation: LoadOperation,
    task: () => PromiseLike<T> | T,
  ): Promise<T> {
    operation.throwIfCancelled()

    const previous = this.archiveTail.catch(() => undefined)
    let release = (): void => {}
    const slot = new Promise<void>((resolve) => {
      release = resolve
    })
    this.archiveTail = previous.then(() => slot)

    try {
      await previous
      operation.throwIfCancelled()
      const result = await task()
      operation.throwIfCancelled()
      return result
    } finally {
      release()
    }
  }
}

export const isLoadOperationCancelled = (error: unknown): boolean => (
  error instanceof LoadOperationCancelledError
)

export interface LoadMessageTarget<TMessage> {
  postMessage(message: TMessage): PromiseLike<boolean>
}

export const deliverLoadOperationMessage = async <TMessage, TTarget extends LoadMessageTarget<TMessage>>(
  operation: LoadOperation,
  getTarget: () => TTarget | undefined,
  message: TMessage,
): Promise<void> => {
  operation.throwIfCancelled()
  const target = getTarget()
  if (!target) {
    throw new LoadOperationDeliveryError('The analysis webview is unavailable')
  }

  let delivered: boolean
  try {
    delivered = await target.postMessage(message)
  } catch (error) {
    operation.throwIfCancelled()
    throw error
  }

  operation.throwIfCancelled()
  if (getTarget() !== target) throw new LoadOperationCancelledError()
  if (!delivered) {
    throw new LoadOperationDeliveryError('The analysis webview rejected the load message')
  }
}

export interface ArchiveEntryMetadata {
  name: string
  size: number
  originalSize: number
  compression: number
}

export type ArchiveActivityCheck = () => void

const noArchiveActivityCheck: ArchiveActivityCheck = () => {}

export interface ArchiveDirectoryBudget {
  totalPathBytes: number
}

export interface ArchiveVolumeInput<T> {
  source: T
  name: string
  size: number
}

export interface InspectedArchiveVolume<T> {
  input: ArchiveVolumeInput<T>
  entries: ArchiveEntryMetadata[]
}

export interface ArchiveSelection {
  selectedPaths: ReadonlySet<string>
  normalizedBasePath: string
}

export type NeededArchiveEntryKind = 'primary-log' | 'text' | 'image'

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

export const DEFAULT_ARCHIVE_LIMITS = validateLimits({ ...configuredArchiveLimits })

export const INSIST_ARCHIVE_LIMIT_OVERRIDES: Readonly<Partial<ArchiveLimits>> = Object.freeze({
  maxCompressedBytes: Number.MAX_SAFE_INTEGER,
  maxFileBytes: Number.MAX_SAFE_INTEGER,
  maxImageBytes: Number.MAX_SAFE_INTEGER,
  maxExtractedBytes: Number.MAX_SAFE_INTEGER,
  maxCompressionRatio: Number.MAX_SAFE_INTEGER,
  compressionRatioMinBytes: Number.MAX_SAFE_INTEGER,
})

export const resolveArchiveLimits = (
  overrides: Partial<ArchiveLimits> = {},
): Readonly<ArchiveLimits> => validateLimits({
  ...DEFAULT_ARCHIVE_LIMITS,
  ...overrides,
})

export const EMPTY_ARCHIVE_DIRECTORY_BUDGET: Readonly<ArchiveDirectoryBudget> = Object.freeze({
  totalPathBytes: 0,
})

const assertMetadataInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid archive metadata: ${label} must be a non-negative safe integer`)
  }
}

const addSize = (total: number, value: number, label: string): number => {
  assertMetadataInteger(value, label)
  const next = total + value
  if (!Number.isSafeInteger(next)) {
    throw new Error(`Invalid archive metadata: ${label} total exceeds the safe integer range`)
  }
  return next
}

const throwBudgetError = (
  code: ArchiveBudgetCode,
  actual: number,
  limit: number,
): never => {
  throw new ArchiveBudgetError(code, actual, limit)
}

export const assertArchiveInputsWithinLimits = (
  inputs: readonly { size: number }[],
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): void => {
  if (inputs.length > limits.maxVolumes) {
    throwBudgetError('volume-count', inputs.length, limits.maxVolumes)
  }

  let total = 0
  for (const input of inputs) {
    total = addSize(total, input.size, 'compressed size')
    if (total > limits.maxCompressedBytes) {
      throwBudgetError('compressed-size', total, limits.maxCompressedBytes)
    }
  }
}

const utf8Encoder = new TextEncoder()

const copyEntryMetadata = (entry: UnzipFileInfo): ArchiveEntryMetadata => ({
  name: entry.name,
  size: entry.size,
  originalSize: entry.originalSize,
  compression: entry.compression,
})

const addDirectoryEntry = (
  current: Readonly<ArchiveDirectoryBudget>,
  entry: ArchiveEntryMetadata,
  limits: Readonly<ArchiveLimits>,
): ArchiveDirectoryBudget => {
  if (typeof entry.name !== 'string') {
    throw new Error('Invalid archive metadata: entry name must be a string')
  }
  assertMetadataInteger(entry.size, 'compressed entry size')
  assertMetadataInteger(entry.originalSize, 'original entry size')
  assertMetadataInteger(entry.compression, 'compression method')

  const pathBytes = utf8Encoder.encode(entry.name).byteLength
  if (pathBytes > limits.maxPathBytes) {
    throwBudgetError('path-size', pathBytes, limits.maxPathBytes)
  }
  const totalPathBytes = addSize(current.totalPathBytes, pathBytes, 'path size')
  if (totalPathBytes > limits.maxTotalPathBytes) {
    throwBudgetError('total-path-size', totalPathBytes, limits.maxTotalPathBytes)
  }

  return { totalPathBytes }
}

export const inspectZipDirectory = (
  data: Uint8Array,
  currentBudget: Readonly<ArchiveDirectoryBudget> = EMPTY_ARCHIVE_DIRECTORY_BUDGET,
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
  checkActive: ArchiveActivityCheck = noArchiveActivityCheck,
): { entries: ArchiveEntryMetadata[]; directoryBudget: ArchiveDirectoryBudget } => {
  checkActive()
  const entries: ArchiveEntryMetadata[] = []
  let directoryBudget = currentBudget

  unzipSync(data, {
    filter: (entry) => {
      checkActive()
      const metadata = copyEntryMetadata(entry)
      directoryBudget = addDirectoryEntry(directoryBudget, metadata, limits)
      entries.push(metadata)
      return false
    },
  })
  checkActive()

  return { entries, directoryBudget }
}

export const canonicalizeArchivePath = (value: string): string => {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ArchiveIntegrityError('Archive entry path contains invalid characters')
  }

  const normalized = value.replace(/\\/g, '/')
  const isDirectory = normalized.endsWith('/')
  const pathWithoutDirectoryMarker = isDirectory ? normalized.slice(0, -1) : normalized
  if (
    !pathWithoutDirectoryMarker
    || normalized.startsWith('/')
    || /^[a-z]:/i.test(pathWithoutDirectoryMarker)
  ) {
    throw new ArchiveIntegrityError(`Archive entry path is absolute or empty: ${value}`)
  }

  const parts = pathWithoutDirectoryMarker.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new ArchiveIntegrityError(`Archive entry path is not canonical: ${value}`)
  }

  const canonical = parts.join('/')
  return isDirectory ? `${canonical}/` : canonical
}

const assertUniqueCanonicalArchivePaths = (
  entries: readonly ArchiveEntryMetadata[],
  seenPaths: Map<string, 'directory' | 'file'>,
): void => {
  for (const entry of entries) {
    const canonicalPath = canonicalizeArchivePath(entry.name)
    const isDirectory = canonicalPath.endsWith('/')
    const collisionKey = isDirectory ? canonicalPath.slice(0, -1) : canonicalPath
    const kind = isDirectory ? 'directory' : 'file'
    const previousKind = seenPaths.get(collisionKey)
    if (previousKind && (previousKind === 'file' || kind === 'file')) {
      throw new ArchiveIntegrityError(`Duplicate canonical archive entry: ${canonicalPath}`)
    }
    seenPaths.set(collisionKey, kind)
  }
}

const getArchiveBaseName = (value: string): string => {
  const normalized = canonicalizeArchivePath(value).replace(/\/$/, '')
  const separator = normalized.lastIndexOf('/')
  return separator >= 0 ? normalized.slice(separator + 1) : normalized
}

const isPrimaryLogName = (name: string): boolean => (
  /^(?:maa|maafw)\.log$/i.test(name.trim())
  || /^(?:maa|maafw)\.bak(?:\.\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}\.\d{1,3})?\.log$/i.test(name.trim())
)

const isSearchTextPath = (path: string): boolean => /\.(?:log|txt|jsonl)$/i.test(path)

export const createArchiveSelection = (
  selectedPaths: Iterable<string>,
  basePath: string,
): ArchiveSelection => ({
  selectedPaths: new Set(Array.from(selectedPaths, canonicalizeArchivePath)),
  normalizedBasePath: basePath ? canonicalizeArchivePath(basePath).replace(/\/$/, '') : '',
})

const getPathRelativeToBase = (
  normalizedPath: string,
  normalizedBasePath: string,
): string | null => {
  if (!normalizedBasePath) return normalizedPath
  const prefix = `${normalizedBasePath}/`
  return normalizedPath.toLowerCase().startsWith(prefix.toLowerCase())
    ? normalizedPath.slice(prefix.length)
    : null
}

export const classifyNeededArchiveEntry = (
  entryName: string,
  selection: ArchiveSelection,
): NeededArchiveEntryKind | null => {
  const normalizedPath = canonicalizeArchivePath(entryName)
  if (normalizedPath.endsWith('/')) return null
  if (selection.selectedPaths.has(normalizedPath)) return 'primary-log'

  const relativePath = getPathRelativeToBase(normalizedPath, selection.normalizedBasePath)
  if (relativePath == null) return null

  const fileName = getArchiveBaseName(relativePath)
  if (isPrimaryLogName(fileName)) return null
  if (isSearchTextPath(relativePath)) return 'text'

  const lower = relativePath.toLowerCase()
  if (
    (lower.startsWith('on_error/') && lower.endsWith('.png'))
    || (lower.startsWith('vision/') && lower.endsWith('.jpg'))
  ) {
    return 'image'
  }

  return null
}

export const getNeededArchiveEntries = (
  entries: readonly ArchiveEntryMetadata[],
  selection: ArchiveSelection,
): ArchiveEntryMetadata[] => entries.filter(
  entry => classifyNeededArchiveEntry(entry.name, selection) != null,
)

const isImageEntry = (name: string): boolean => /\.(?:png|jpe?g)$/i.test(name)

export const assertExtractedEntriesWithinLimits = (
  entries: readonly ArchiveEntryMetadata[],
  limits: Readonly<ArchiveLimits> = DEFAULT_ARCHIVE_LIMITS,
): void => {
  let total = 0
  let directoryBudget = EMPTY_ARCHIVE_DIRECTORY_BUDGET

  for (const entry of entries) {
    directoryBudget = addDirectoryEntry(directoryBudget, entry, limits)

    if (entry.originalSize > limits.maxFileBytes) {
      throwBudgetError('file-size', entry.originalSize, limits.maxFileBytes)
    }
    if (isImageEntry(entry.name) && entry.originalSize > limits.maxImageBytes) {
      throwBudgetError('image-size', entry.originalSize, limits.maxImageBytes)
    }

    total = addSize(total, entry.originalSize, 'extracted size')
    if (total > limits.maxExtractedBytes) {
      throwBudgetError('extracted-size', total, limits.maxExtractedBytes)
    }

    if (entry.originalSize >= limits.compressionRatioMinBytes && entry.originalSize > 0) {
      const ratio = entry.size === 0 ? Number.POSITIVE_INFINITY : entry.originalSize / entry.size
      if (ratio > limits.maxCompressionRatio) {
        throwBudgetError('compression-ratio', ratio, limits.maxCompressionRatio)
      }
    }
  }
}

export const createStoredEntryMetadata = (
  name: string,
  size: number,
): ArchiveEntryMetadata => ({
  name,
  size,
  originalSize: size,
  compression: 0,
})

export const inspectArchiveVolumes = async <T>(
  inputs: readonly ArchiveVolumeInput<T>[],
  readVolume: (input: ArchiveVolumeInput<T>) => PromiseLike<Uint8Array>,
  limitOverrides: Partial<ArchiveLimits> = {},
  checkActive: ArchiveActivityCheck = noArchiveActivityCheck,
): Promise<InspectedArchiveVolume<T>[]> => {
  checkActive()
  const limits = resolveArchiveLimits(limitOverrides)

  // Stat metadata is checked before the first read so oversized selections do
  // not allocate archive buffers at all.
  assertArchiveInputsWithinLimits(inputs, limits)

  const inspected: InspectedArchiveVolume<T>[] = []
  const actualInputs: Array<{ size: number }> = []
  const canonicalPaths = new Map<string, 'directory' | 'file'>()
  let directoryBudget = EMPTY_ARCHIVE_DIRECTORY_BUDGET

  for (const input of inputs) {
    checkActive()
    const data = await readVolume(input)
    checkActive()
    actualInputs.push({ size: data.byteLength })
    assertArchiveInputsWithinLimits(actualInputs, limits)

    const directory = inspectZipDirectory(data, directoryBudget, limits, checkActive)
    directoryBudget = directory.directoryBudget
    assertUniqueCanonicalArchivePaths(directory.entries, canonicalPaths)
    inspected.push({ input, entries: directory.entries })
    checkActive()
  }

  return inspected
}

const STREAM_INPUT_CHUNK_BYTES = 4 * 1024 * 1024

const yieldToExtensionHost = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

interface StreamedArchiveEntries {
  entries: Map<string, Uint8Array>
  extractedBytes: number
}

const addExtractedBytes = (
  current: number,
  increment: number,
  limits: Readonly<ArchiveLimits>,
): number => {
  const next = addSize(current, increment, 'actual extracted size')
  if (next > limits.maxExtractedBytes) {
    throwBudgetError('extracted-size', next, limits.maxExtractedBytes)
  }
  return next
}

const assertActualEntryChunkWithinLimits = (
  entry: ArchiveEntryMetadata,
  actualSize: number,
  limits: Readonly<ArchiveLimits>,
): void => {
  if (actualSize > limits.maxFileBytes) {
    throwBudgetError('file-size', actualSize, limits.maxFileBytes)
  }
  if (isImageEntry(entry.name) && actualSize > limits.maxImageBytes) {
    throwBudgetError('image-size', actualSize, limits.maxImageBytes)
  }
  if (actualSize >= limits.compressionRatioMinBytes && actualSize > 0) {
    const ratio = entry.size === 0 ? Number.POSITIVE_INFINITY : actualSize / entry.size
    if (ratio > limits.maxCompressionRatio) {
      throwBudgetError('compression-ratio', ratio, limits.maxCompressionRatio)
    }
  }
}

const unzipSelectedEntries = async (
  data: Uint8Array,
  selectedEntries: readonly ArchiveEntryMetadata[],
  initialExtractedBytes: number,
  limits: Readonly<ArchiveLimits>,
  checkActive: ArchiveActivityCheck,
): Promise<StreamedArchiveEntries> => {
  checkActive()
  const metadataByName = new Map<string, ArchiveEntryMetadata>()
  for (const entry of selectedEntries) {
    checkActive()
    if (metadataByName.has(entry.name)) {
      throw new ArchiveIntegrityError(`Duplicate selected archive entry: ${entry.name}`)
    }
    metadataByName.set(entry.name, entry)
  }

  const entries = new Map<string, Uint8Array>()
  const startedNames = new Set<string>()
  const startedFiles: Array<{ terminate: () => void }> = []
  assertMetadataInteger(initialExtractedBytes, 'initial actual extracted size')
  if (initialExtractedBytes > limits.maxExtractedBytes) {
    throwBudgetError('extracted-size', initialExtractedBytes, limits.maxExtractedBytes)
  }
  let extractedBytes = initialExtractedBytes
  const archive = new Unzip((file) => {
    checkActive()
    const metadata = metadataByName.get(file.name)
    if (!metadata) return
    if (startedNames.has(file.name)) {
      throw new ArchiveIntegrityError(`Duplicate local archive entry: ${file.name}`)
    }
    startedNames.add(file.name)
    startedFiles.push(file)

    if (file.compression !== metadata.compression) {
      throw new ArchiveIntegrityError(`Compression method changed for archive entry: ${file.name}`)
    }
    if (file.size != null && file.size !== metadata.size) {
      throw new ArchiveIntegrityError(`Compressed size changed for archive entry: ${file.name}`)
    }
    if (file.originalSize != null && file.originalSize !== metadata.originalSize) {
      throw new ArchiveIntegrityError(`Original size changed for archive entry: ${file.name}`)
    }

    const output = new Uint8Array(metadata.originalSize)
    let outputOffset = 0
    file.ondata = (error, chunk, final) => {
      checkActive()
      if (error) throw error
      const dataChunk = chunk ?? new Uint8Array()
      const nextOffset = addSize(outputOffset, dataChunk.byteLength, 'actual file size')
      if (nextOffset > metadata.originalSize) {
        throw new ArchiveIntegrityError(`Actual size exceeds declared size for archive entry: ${file.name}`)
      }
      assertActualEntryChunkWithinLimits(metadata, nextOffset, limits)
      extractedBytes = addExtractedBytes(extractedBytes, dataChunk.byteLength, limits)
      output.set(dataChunk, outputOffset)
      outputOffset = nextOffset

      if (!final) return
      if (outputOffset !== metadata.originalSize) {
        throw new ArchiveIntegrityError(`Actual size differs from declared size for archive entry: ${file.name}`)
      }
      entries.set(file.name, output)
    }
    file.start()
  })
  archive.register(UnzipInflate)

  try {
    if (data.byteLength === 0) {
      checkActive()
      archive.push(data, true)
      checkActive()
    } else {
      for (let offset = 0; offset < data.byteLength; offset += STREAM_INPUT_CHUNK_BYTES) {
        checkActive()
        const end = Math.min(offset + STREAM_INPUT_CHUNK_BYTES, data.byteLength)
        archive.push(data.subarray(offset, end), end === data.byteLength)
        checkActive()
        if (end < data.byteLength) {
          await yieldToExtensionHost()
          checkActive()
        }
      }
    }
  } catch (error) {
    for (const file of startedFiles) {
      try {
        file.terminate()
      } catch {
        // Preserve the extraction error that caused the abort.
      }
    }
    throw error
  }

  for (const name of metadataByName.keys()) {
    checkActive()
    if (!entries.has(name)) {
      throw new ArchiveIntegrityError(`Selected archive entry is missing or incomplete: ${name}`)
    }
  }

  return { entries, extractedBytes }
}

export const readSelectedArchiveVolumes = async <T>(
  inspectedVolumes: readonly InspectedArchiveVolume<T>[],
  selection: ArchiveSelection,
  readVolume: (input: ArchiveVolumeInput<T>) => PromiseLike<Uint8Array>,
  consumeEntries: (
    volume: InspectedArchiveVolume<T>,
    entries: ReadonlyMap<string, Uint8Array>,
  ) => void | Promise<void>,
  limitOverrides: Partial<ArchiveLimits> = {},
  checkActive: ArchiveActivityCheck = noArchiveActivityCheck,
): Promise<void> => {
  checkActive()
  const limits = resolveArchiveLimits(limitOverrides)
  const inputs = inspectedVolumes.map((volume) => volume.input)
  assertArchiveInputsWithinLimits(inputs, limits)

  // Validate the complete extraction plan before allocating a second archive
  // buffer. Duplicate paths in independent MXU volumes are counted separately.
  const plannedEntries = inspectedVolumes.flatMap((volume) =>
    getNeededArchiveEntries(volume.entries, selection),
  )
  assertExtractedEntriesWithinLimits(plannedEntries, limits)
  checkActive()

  const actualInputs: Array<{ size: number }> = []
  const currentSelectedEntries: ArchiveEntryMetadata[] = []
  let actualExtractedBytes = 0
  const canonicalPaths = new Map<string, 'directory' | 'file'>()
  let directoryBudget = EMPTY_ARCHIVE_DIRECTORY_BUDGET

  for (const inspectedVolume of inspectedVolumes) {
    checkActive()
    const data = await readVolume(inspectedVolume.input)
    checkActive()
    actualInputs.push({ size: data.byteLength })
    assertArchiveInputsWithinLimits(actualInputs, limits)

    // Re-inspect the exact bytes that will be expanded. This closes the gap if
    // a local archive changed while the selection dialog was open.
    const currentDirectory = inspectZipDirectory(data, directoryBudget, limits, checkActive)
    directoryBudget = currentDirectory.directoryBudget
    assertUniqueCanonicalArchivePaths(currentDirectory.entries, canonicalPaths)
    const neededEntries = getNeededArchiveEntries(currentDirectory.entries, selection)
    currentSelectedEntries.push(...neededEntries)
    assertExtractedEntriesWithinLimits(currentSelectedEntries, limits)

    if (neededEntries.length === 0) continue
    checkActive()
    const streamed = await unzipSelectedEntries(
      data,
      neededEntries,
      actualExtractedBytes,
      limits,
      checkActive,
    )
    checkActive()
    actualExtractedBytes = streamed.extractedBytes
    await consumeEntries(inspectedVolume, streamed.entries)
    checkActive()
  }
}

const DECODE_CANDIDATE_ENCODINGS = ['utf-8', 'gbk', 'gb18030', 'gb2312'] as const
const ENCODING_SAMPLE_SIZE = 256 * 1024

const sampleMatchesEncoding = (sample: Uint8Array, encoding: string): boolean => {
  for (let trim = 0; trim <= 3; trim += 1) {
    if (sample.length - trim <= 0) return false
    try {
      new TextDecoder(encoding, { fatal: true }).decode(sample.subarray(0, sample.length - trim))
      return true
    } catch {
      // Retry with a shorter sample in case it ends within a multibyte sequence.
    }
  }
  return false
}

export const decodeArchiveText = (bytes: Uint8Array): string => {
  const sample = bytes.length > ENCODING_SAMPLE_SIZE
    ? bytes.subarray(0, ENCODING_SAMPLE_SIZE)
    : bytes
  const encoding = DECODE_CANDIDATE_ENCODINGS.find(candidate => sampleMatchesEncoding(sample, candidate))
    ?? 'utf-8'
  return new TextDecoder(encoding, { fatal: false }).decode(bytes)
}
