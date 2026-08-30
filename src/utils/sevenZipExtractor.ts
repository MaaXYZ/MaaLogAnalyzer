import type { FileSystem, FSNode, FSStream, SevenZipModule } from '7z-wasm'

import {
  addArchiveDirectoryEntry,
  ArchiveLimitError,
  assertArchiveInputsWithinLimits,
  assertSelectedArchiveEntriesWithinLimits,
  DEFAULT_ARCHIVE_LIMITS,
  EMPTY_ARCHIVE_DIRECTORY_BUDGET,
  isArchiveImageEntry,
  resolveArchiveLimits,
  type ArchiveDirectoryBudget,
  type ArchiveLimits,
} from './archiveLimits'

export interface SevenZipArchiveEntry {
  path: string
  size: number
  packedSize: number | null
  block: string | null
  isDirectory: boolean
}

export interface ExtractSevenZipOptions {
  archiveLimits?: Partial<ArchiveLimits> | null
  onProgress?: (message: string) => void
}

export class SevenZipArchiveError extends Error {
  readonly name = 'SevenZipArchiveError'
}

type SevenZipModuleResult = Awaited<ReturnType<(typeof import('7z-wasm'))['default']>> | null

interface ListedSevenZipEntry extends SevenZipArchiveEntry {
  sourcePath: string
  identity: string
}

interface CommandCapture {
  output: string[]
  errors: string[]
  limits: Readonly<ArchiveLimits>
  inspectListing: boolean
  listingStarted: boolean
  totalPathBytes: number
  capturedBytes: number
  capturedLines: number
  maxCaptureBytes: number
  maxCaptureLines: number
  limitError: Error | null
}

interface RuntimeStream extends FSStream {
  node?: FSNode
  path?: string
  position?: number
}

interface RuntimeFileSystem extends FileSystem {
  getStream?: (fd: number) => RuntimeStream | undefined
}

let activeCommandCapture: CommandCapture | null = null
let sevenZipInstance: SevenZipModuleResult = null
let sevenZipLoading: Promise<SevenZipModuleResult> | null = null
let sevenZipOperationTail: Promise<void> = Promise.resolve()
let workspaceSequence = 0

const captureEncoder = new TextEncoder()
const MAX_COMMAND_CAPTURE_BYTES = 64 * 1024 * 1024
const MAX_COMMAND_CAPTURE_LINES = 400_000
// Generous structural bounds for pathological listings; real memory use stays
// bounded by maxTotalPathBytes plus these fixed capture ceilings.
const LISTING_CAPTURE_ENTRY_RESERVE = 20_000

const boundedCaptureLimit = (fixed: number, variable: number, ceiling: number): number =>
  Math.min(ceiling, fixed + Math.min(variable, ceiling - fixed))

const createCommandCapture = (
  limits: Readonly<ArchiveLimits>,
  inspectListing: boolean,
): CommandCapture => ({
  output: [],
  errors: [],
  limits,
  inspectListing,
  listingStarted: false,
  totalPathBytes: 0,
  capturedBytes: 0,
  capturedLines: 0,
  maxCaptureBytes: boundedCaptureLimit(
    1024 * 1024,
    limits.maxTotalPathBytes + LISTING_CAPTURE_ENTRY_RESERVE * 2048,
    MAX_COMMAND_CAPTURE_BYTES,
  ),
  maxCaptureLines: boundedCaptureLimit(
    1024,
    LISTING_CAPTURE_ENTRY_RESERVE * 32,
    MAX_COMMAND_CAPTURE_LINES,
  ),
  limitError: null,
})

const captureCommandLine = (capture: CommandCapture, destination: string[], line: string): void => {
  if (capture.limitError) return

  const lineBytes = captureEncoder.encode(line).byteLength + 1
  capture.capturedBytes += lineBytes
  capture.capturedLines += 1
  if (
    !Number.isSafeInteger(capture.capturedBytes) ||
    capture.capturedBytes > capture.maxCaptureBytes ||
    capture.capturedLines > capture.maxCaptureLines
  ) {
    capture.limitError = new SevenZipArchiveError('压缩包命令输出超出安全捕获范围')
    return
  }

  if (capture.inspectListing) {
    if (line.trim() === '----------') {
      capture.listingStarted = true
    } else if (capture.listingStarted && line.startsWith('Path = ')) {
      const pathBytes = captureEncoder.encode(line.slice('Path = '.length)).byteLength
      if (pathBytes > capture.limits.maxPathBytes) {
        capture.limitError = new ArchiveLimitError(
          'path-size',
          pathBytes,
          capture.limits.maxPathBytes,
        )
        return
      }
      capture.totalPathBytes += pathBytes
      if (
        !Number.isSafeInteger(capture.totalPathBytes) ||
        capture.totalPathBytes > capture.limits.maxTotalPathBytes
      ) {
        capture.limitError = new ArchiveLimitError(
          'total-path-size',
          capture.totalPathBytes,
          capture.limits.maxTotalPathBytes,
        )
        return
      }
    }
  }

  destination.push(line)
}

export async function ensureSevenZipModule(): Promise<SevenZipModuleResult> {
  if (sevenZipInstance) return sevenZipInstance
  if (sevenZipLoading) return sevenZipLoading

  sevenZipLoading = (async () => {
    try {
      const SevenZip = await import('7z-wasm')
      sevenZipInstance = await SevenZip.default({
        print: (line) => {
          if (activeCommandCapture) {
            captureCommandLine(activeCommandCapture, activeCommandCapture.output, line)
          }
        },
        printErr: (line) => {
          if (activeCommandCapture) {
            captureCommandLine(activeCommandCapture, activeCommandCapture.errors, line)
          }
        },
      })
      return sevenZipInstance
    } catch (error) {
      throw Object.assign(
        new Error(
          `加载 7z 解压模块失败: ${error instanceof Error ? error.message : String(error)}`,
        ),
        { cause: error },
      )
    } finally {
      sevenZipLoading = null
    }
  })()

  return sevenZipLoading
}

const withSevenZipOperation = async <T>(action: () => Promise<T>): Promise<T> => {
  const previous = sevenZipOperationTail
  let release!: () => void
  sevenZipOperationTail = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await action()
  } finally {
    release()
  }
}

const callSevenZip = (
  module: SevenZipModule,
  args: string[],
  operation: string,
  limits: Readonly<ArchiveLimits>,
  inspectListing: boolean = false,
): string[] => {
  const capture = createCommandCapture(limits, inspectListing)
  activeCommandCapture = capture
  try {
    const status = (module.callMain as unknown as (commandArgs: string[]) => number)(args)
    if (capture.limitError) throw capture.limitError
    if (status !== 0) {
      const details = capture.errors.concat(capture.output).filter(Boolean).slice(-4).join('\n')
      throw new SevenZipArchiveError(
        `${operation}失败（退出码 ${status}）${details ? `: ${details}` : ''}`,
      )
    }
    return capture.output
  } finally {
    activeCommandCapture = null
  }
}

const parseNonNegativeInteger = (value: string, label: string): number => {
  if (!/^\d+$/.test(value)) {
    throw new SevenZipArchiveError(`压缩包中的 ${label} 不是有效的非负整数`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new SevenZipArchiveError(`压缩包中的 ${label} 超出安全整数范围`)
  }
  return parsed
}

const canonicalizeArchivePath = (sourcePath: string): { path: string; identity: string } => {
  if (/[\u0000-\u001f\u007f]/.test(sourcePath)) {
    throw new SevenZipArchiveError('压缩包包含控制字符文件名')
  }

  const normalized = sourcePath.replace(/\\/g, '/').normalize('NFC')
  if (normalized.length === 0 || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new SevenZipArchiveError(`压缩包包含绝对或空路径: ${sourcePath}`)
  }

  const path = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
  const segments = path.split('/')
  if (
    path.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        segment.includes(':'),
    )
  ) {
    throw new SevenZipArchiveError(`压缩包包含非规范路径: ${sourcePath}`)
  }

  return { path, identity: path.toLocaleLowerCase('en-US') }
}

const parseListingRecords = (lines: readonly string[]): Map<string, string>[] => {
  const separatorIndex = lines.findIndex((line) => line.trim() === '----------')
  if (separatorIndex < 0) {
    throw new SevenZipArchiveError('无法读取压缩包目录')
  }

  const records: Map<string, string>[] = []
  let current = new Map<string, string>()
  const flush = () => {
    if (current.size > 0) records.push(current)
    current = new Map<string, string>()
  }

  for (const rawLine of lines.slice(separatorIndex + 1)) {
    const line = rawLine.replace(/\r$/, '')
    if (line.length === 0) {
      flush()
      continue
    }
    const delimiter = line.indexOf(' = ')
    if (delimiter <= 0) {
      throw new SevenZipArchiveError('压缩包目录包含无法解析的字段')
    }
    const key = line.slice(0, delimiter)
    if (current.has(key)) {
      throw new SevenZipArchiveError(`压缩包目录包含重复字段: ${key}`)
    }
    current.set(key, line.slice(delimiter + 3))
  }
  flush()
  return records
}

export const parseSevenZipListing = (
  lines: readonly string[],
  limits: Readonly<ArchiveLimits>,
): ListedSevenZipEntry[] => {
  const entries: ListedSevenZipEntry[] = []
  const pathKinds = new Map<string, 'file' | 'directory'>()
  let directoryBudget: Readonly<ArchiveDirectoryBudget> = EMPTY_ARCHIVE_DIRECTORY_BUDGET

  for (const record of parseListingRecords(lines)) {
    const sourcePath = record.get('Path')
    if (sourcePath == null) {
      throw new SevenZipArchiveError('压缩包目录缺少文件路径')
    }
    if (record.get('Encrypted') === '+') {
      throw new SevenZipArchiveError(`不支持加密压缩包条目: ${sourcePath}`)
    }
    if (record.get('Anti') === '+') {
      throw new SevenZipArchiveError(`不支持压缩包删除标记条目: ${sourcePath}`)
    }
    if (record.has('Symbolic Link') || record.has('Hard Link')) {
      throw new SevenZipArchiveError(`不支持压缩包链接条目: ${sourcePath}`)
    }

    const isDirectory = record.get('Folder') === '+' || /^D/.test(record.get('Attributes') ?? '')
    const rawSize = record.get('Size')
    const size =
      rawSize == null || rawSize === ''
        ? isDirectory
          ? 0
          : (() => {
              throw new SevenZipArchiveError(`压缩包目录缺少文件大小: ${sourcePath}`)
            })()
        : parseNonNegativeInteger(rawSize, `${sourcePath} 的解压大小`)
    const rawPackedSize = record.get('Packed Size')
    const packedSize =
      rawPackedSize == null || rawPackedSize === ''
        ? null
        : parseNonNegativeInteger(rawPackedSize, `${sourcePath} 的压缩大小`)
    const { path, identity } = canonicalizeArchivePath(sourcePath)
    const kind = isDirectory ? 'directory' : 'file'

    if (pathKinds.has(identity)) {
      throw new SevenZipArchiveError(`压缩包包含重复或别名路径: ${sourcePath}`)
    }
    const segments = identity.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      const parent = segments.slice(0, index).join('/')
      if (pathKinds.get(parent) === 'file') {
        throw new SevenZipArchiveError(`压缩包文件路径被当作目录使用: ${sourcePath}`)
      }
      if (!pathKinds.has(parent)) pathKinds.set(parent, 'directory')
    }
    if (kind === 'file' && pathKinds.get(identity) === 'directory') {
      throw new SevenZipArchiveError(`压缩包目录路径被当作文件使用: ${sourcePath}`)
    }
    pathKinds.set(identity, kind)

    directoryBudget = addArchiveDirectoryEntry(
      directoryBudget,
      {
        name: isDirectory ? `${path}/` : path,
        size: packedSize ?? 0,
        originalSize: size,
        compression: 0,
      },
      limits,
    )

    entries.push({
      path,
      sourcePath,
      identity,
      size,
      packedSize,
      block: record.get('Block') || null,
      isDirectory,
    })
  }

  return entries
}

const assertCompressionRatio = (
  originalSize: number,
  compressedSize: number,
  limits: Readonly<ArchiveLimits>,
): void => {
  if (originalSize < limits.compressionRatioMinBytes || originalSize === 0) return
  const ratio = compressedSize === 0 ? Number.POSITIVE_INFINITY : originalSize / compressedSize
  if (ratio > limits.maxCompressionRatio) {
    throw new ArchiveLimitError('compression-ratio', ratio, limits.maxCompressionRatio)
  }
}

const assertSelectedEntriesWithinLimits = (
  entries: readonly ListedSevenZipEntry[],
  selectedIdentities: ReadonlySet<string>,
  archiveSize: number,
  limits: Readonly<ArchiveLimits>,
): number => {
  const selectedBlocks = new Set(
    entries
      .filter((entry) => selectedIdentities.has(entry.identity) && entry.block != null)
      .map((entry) => entry.block as string),
  )
  const chargedEntries = entries.filter(
    (entry) =>
      !entry.isDirectory &&
      (selectedIdentities.has(entry.identity) ||
        (entry.block != null && selectedBlocks.has(entry.block))),
  )

  assertSelectedArchiveEntriesWithinLimits(
    chargedEntries.map((entry) => ({
      name: entry.path,
      size: entry.size,
      originalSize: entry.size,
      compression: 0,
    })),
    {
      ...limits,
      maxCompressionRatio: Number.MAX_VALUE,
    },
  )

  const groups = new Map<string, ListedSevenZipEntry[]>()
  for (const entry of chargedEntries) {
    const key = entry.block == null ? `entry:${entry.identity}` : `block:${entry.block}`
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }

  let runtimeCompressionBasis = 0
  let needsArchiveFallback = false
  for (const group of groups.values()) {
    const originalSize = group.reduce((total, entry) => total + entry.size, 0)
    const knownPackedSizes = group
      .map((entry) => entry.packedSize)
      .filter((size): size is number => size != null)
    const compressedSize =
      knownPackedSizes.length > 0
        ? knownPackedSizes.reduce((total, size) => total + size, 0)
        : archiveSize
    assertCompressionRatio(originalSize, compressedSize, limits)
    if (knownPackedSizes.length > 0) runtimeCompressionBasis += compressedSize
    else needsArchiveFallback = true
  }
  return needsArchiveFallback ? archiveSize : runtimeCompressionBasis
}

const normalizeVirtualPath = (path: string, cwd: string): string => {
  const absolute = path.startsWith('/') ? path : `${cwd}/${path}`
  const segments: string[] = []
  for (const segment of absolute.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return `/${segments.join('/')}`
}

const isWriteFlags = (flags: string | number): boolean => {
  if (typeof flags === 'string') return /[wa+]/.test(flags)
  return (flags & 3) !== 0 || (flags & (64 | 512 | 1024)) !== 0
}

const installOutputGuard = (
  fileSystem: RuntimeFileSystem,
  outputDir: string,
  allowedEntries: ReadonlyMap<string, ListedSevenZipEntry>,
  compressionBasis: number,
  limits: Readonly<ArchiveLimits> | null,
): (() => void) => {
  const structureLimits = limits ?? DEFAULT_ARCHIVE_LIMITS
  const outputPrefix = `${outputDir}/`
  const allowedDirectories = new Set<string>()
  for (const identity of allowedEntries.keys()) {
    const parts = identity.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      allowedDirectories.add(parts.slice(0, index).join('/'))
    }
  }

  let directoryBudget: Readonly<ArchiveDirectoryBudget> = EMPTY_ARCHIVE_DIRECTORY_BUDGET
  const observedKinds = new Map<string, 'file' | 'directory'>()
  const fileSizes = new Map<string, number>()
  let extractedBytes = 0

  const toOutputEntry = (path: string): { path: string; identity: string } => {
    const absolute = normalizeVirtualPath(path, fileSystem.cwd())
    if (!absolute.startsWith(outputPrefix)) {
      throw new SevenZipArchiveError(`解压器尝试写出隔离目录: ${absolute}`)
    }
    return canonicalizeArchivePath(absolute.slice(outputPrefix.length))
  }

  const recordEntry = (path: string, kind: 'file' | 'directory') => {
    const canonical = toOutputEntry(path)
    const expected = allowedEntries.get(canonical.identity)
    if (kind === 'file' ? expected == null : !allowedDirectories.has(canonical.identity)) {
      throw new SevenZipArchiveError(`解压器产生了未选择的路径: ${canonical.path}`)
    }
    const previousKind = observedKinds.get(canonical.identity)
    if (previousKind != null && previousKind !== kind) {
      throw new SevenZipArchiveError(`解压结果包含文件/目录冲突: ${canonical.path}`)
    }
    if (previousKind == null) {
      directoryBudget = addArchiveDirectoryEntry(
        directoryBudget,
        {
          name: kind === 'directory' ? `${canonical.path}/` : canonical.path,
          size: 0,
          originalSize: 0,
          compression: 0,
        },
        structureLimits,
      )
      observedKinds.set(canonical.identity, kind)
    }
    return { ...canonical, expected }
  }

  const recordFileSize = (path: string, size: number) => {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new SevenZipArchiveError(`解压器报告了无效文件大小: ${size}`)
    }
    const { identity, expected } = recordEntry(path, 'file')
    if (!expected) throw new SevenZipArchiveError(`解压器产生了未选择的文件: ${path}`)
    if (!limits) {
      fileSizes.set(identity, size)
      return
    }
    if (size > limits.maxFileBytes) {
      throw new ArchiveLimitError('file-size', size, limits.maxFileBytes)
    }
    if (isArchiveImageEntry(expected.path) && size > limits.maxImageBytes) {
      throw new ArchiveLimitError('image-size', size, limits.maxImageBytes)
    }
    const previousSize = fileSizes.get(identity) ?? 0
    const nextExtractedBytes = extractedBytes - previousSize + size
    if (!Number.isSafeInteger(nextExtractedBytes)) {
      throw new SevenZipArchiveError('解压总大小超出安全整数范围')
    }
    if (nextExtractedBytes > limits.maxExtractedBytes) {
      throw new ArchiveLimitError('extracted-size', nextExtractedBytes, limits.maxExtractedBytes)
    }
    assertCompressionRatio(nextExtractedBytes, compressionBasis, limits)
    fileSizes.set(identity, size)
    extractedBytes = nextExtractedBytes
  }

  const streamPath = (stream: RuntimeStream): string => {
    if (stream.path) return stream.path
    const node = stream.node ?? stream.object
    return fileSystem.getPath(node)
  }

  const isCharacterStream = (stream: RuntimeStream): boolean => {
    const node = stream.node ?? stream.object
    return fileSystem.isChrdev(node.mode)
  }

  const originalOpen = fileSystem.open.bind(fileSystem)
  const originalMkdir = fileSystem.mkdir.bind(fileSystem)
  const originalWrite = fileSystem.write.bind(fileSystem)
  const originalAllocate =
    typeof fileSystem.allocate === 'function' ? fileSystem.allocate.bind(fileSystem) : null
  const originalTruncate =
    typeof fileSystem.truncate === 'function' ? fileSystem.truncate.bind(fileSystem) : null
  const originalFtruncate =
    typeof fileSystem.ftruncate === 'function' ? fileSystem.ftruncate.bind(fileSystem) : null
  const originalRename = fileSystem.rename.bind(fileSystem)
  const originalSymlink = fileSystem.symlink.bind(fileSystem)

  fileSystem.open = ((path, flags, mode, fdStart, fdEnd) => {
    if (isWriteFlags(flags)) {
      const absolute = normalizeVirtualPath(path, fileSystem.cwd())
      let isCharacterPath = false
      try {
        isCharacterPath = fileSystem.isChrdev(fileSystem.lstat(absolute).mode)
      } catch {
        // A path that does not exist yet is a regular extraction output candidate.
      }
      if (!isCharacterPath) recordEntry(absolute, 'file')
    }
    return originalOpen(path, flags, mode, fdStart, fdEnd)
  }) as FileSystem['open']
  fileSystem.mkdir = ((path, mode) => {
    recordEntry(path, 'directory')
    return originalMkdir(path, mode)
  }) as FileSystem['mkdir']
  fileSystem.write = ((stream, buffer, offset, length, position, canOwn) => {
    const runtimeStream = stream as RuntimeStream
    if (!isCharacterStream(runtimeStream)) {
      const start = position ?? runtimeStream.position ?? 0
      recordFileSize(
        streamPath(runtimeStream),
        Math.max(
          fileSizes.get(toOutputEntry(streamPath(runtimeStream)).identity) ?? 0,
          start + length,
        ),
      )
    }
    return originalWrite(stream, buffer, offset, length, position, canOwn)
  }) as FileSystem['write']
  if (originalAllocate) {
    fileSystem.allocate = ((stream, offset, length) => {
      const runtimeStream = stream as RuntimeStream
      recordFileSize(
        streamPath(runtimeStream),
        Math.max(
          fileSizes.get(toOutputEntry(streamPath(runtimeStream)).identity) ?? 0,
          offset + length,
        ),
      )
      return originalAllocate(stream, offset, length)
    }) as FileSystem['allocate']
  }
  if (originalTruncate) {
    fileSystem.truncate = ((path, length) => {
      const pathValue =
        typeof path === 'string' ? path : fileSystem.getPath(path as unknown as FSNode)
      recordFileSize(pathValue, length)
      return originalTruncate(path, length)
    }) as FileSystem['truncate']
  }
  if (originalFtruncate) {
    fileSystem.ftruncate = ((fd, length) => {
      const stream = fileSystem.getStream?.(fd)
      if (stream) recordFileSize(streamPath(stream), length)
      return originalFtruncate(fd, length)
    }) as FileSystem['ftruncate']
  }
  fileSystem.rename = ((oldPath, newPath) => {
    const oldAbsolute = normalizeVirtualPath(oldPath, fileSystem.cwd())
    const oldStat = fileSystem.lstat(oldAbsolute)
    if (fileSystem.isLink(oldStat.mode)) {
      throw new SevenZipArchiveError('不支持重命名符号链接解压结果')
    }
    if (fileSystem.isDir(oldStat.mode)) {
      recordEntry(oldAbsolute, 'directory')
      recordEntry(newPath, 'directory')
    } else if (fileSystem.isFile(oldStat.mode)) {
      recordEntry(oldAbsolute, 'file')
      recordEntry(newPath, 'file')
    } else {
      throw new SevenZipArchiveError(`不支持重命名特殊解压结果: ${oldAbsolute}`)
    }
    return originalRename(oldPath, newPath)
  }) as FileSystem['rename']
  fileSystem.symlink = (() => {
    throw new SevenZipArchiveError('不支持压缩包中的符号链接')
  }) as FileSystem['symlink']

  return () => {
    fileSystem.open = originalOpen
    fileSystem.mkdir = originalMkdir
    fileSystem.write = originalWrite
    if (originalAllocate) fileSystem.allocate = originalAllocate
    if (originalTruncate) fileSystem.truncate = originalTruncate
    if (originalFtruncate) fileSystem.ftruncate = originalFtruncate
    fileSystem.rename = originalRename
    fileSystem.symlink = originalSymlink
  }
}

const removeTree = (fileSystem: FileSystem, path: string): void => {
  let stat
  try {
    stat = fileSystem.lstat(path)
  } catch {
    return
  }
  if (!fileSystem.isDir(stat.mode) || fileSystem.isLink(stat.mode)) {
    fileSystem.unlink(path)
    return
  }
  for (const entry of fileSystem.readdir(path)) {
    if (entry === '.' || entry === '..') continue
    removeTree(fileSystem, `${path}/${entry}`)
  }
  fileSystem.rmdir(path)
}

const readExtractedFiles = (
  fileSystem: FileSystem,
  outputDir: string,
  allowedEntries: ReadonlyMap<string, ListedSevenZipEntry>,
): Map<string, Uint8Array> => {
  const files = new Map<string, Uint8Array>()

  const visit = (directory: string) => {
    for (const name of fileSystem.readdir(directory)) {
      if (name === '.' || name === '..') continue
      const fullPath = `${directory}/${name}`
      const stat = fileSystem.lstat(fullPath)
      if (fileSystem.isLink(stat.mode)) {
        throw new SevenZipArchiveError('解压结果包含符号链接')
      }
      if (fileSystem.isDir(stat.mode)) {
        visit(fullPath)
        continue
      }
      if (!fileSystem.isFile(stat.mode)) {
        throw new SevenZipArchiveError(`解压结果包含不支持的文件类型: ${fullPath}`)
      }
      const canonical = canonicalizeArchivePath(fullPath.slice(outputDir.length + 1))
      const expected = allowedEntries.get(canonical.identity)
      if (!expected) throw new SevenZipArchiveError(`解压结果包含未选择文件: ${canonical.path}`)
      if (stat.size !== expected.size) {
        throw new SevenZipArchiveError(
          `解压文件大小与目录不一致: ${canonical.path} (${stat.size} != ${expected.size})`,
        )
      }
      files.set(expected.path, fileSystem.readFile(fullPath))
    }
  }

  visit(outputDir)
  for (const entry of allowedEntries.values()) {
    if (!files.has(entry.path)) {
      throw new SevenZipArchiveError(`压缩包缺少已选择文件: ${entry.path}`)
    }
  }
  return files
}

export const extractSevenZipEntries = async (
  file: File,
  selectEntries: (entries: readonly SevenZipArchiveEntry[]) => Promise<readonly string[] | null>,
  options: ExtractSevenZipOptions = {},
): Promise<Map<string, Uint8Array> | null> => {
  const limits = options.archiveLimits == null ? null : resolveArchiveLimits(options.archiveLimits)
  const structureLimits = limits ?? DEFAULT_ARCHIVE_LIMITS
  if (limits) assertArchiveInputsWithinLimits([file], limits)

  return withSevenZipOperation(async () => {
    options.onProgress?.('正在加载解压模块...')
    const module = await ensureSevenZipModule()
    if (!module) throw new Error('7z 模块未加载')

    const archiveData = new Uint8Array(await file.arrayBuffer())
    if (limits) assertArchiveInputsWithinLimits([{ size: archiveData.byteLength }], limits)

    const workspaceId = ++workspaceSequence
    const workDir = `/tmp/maa-log-archive-${workspaceId}`
    const archivePath = `${workDir}/archive.input`
    const outputDir = `${workDir}/output`
    try {
      module.FS.mkdir(workDir)
      module.FS.writeFile(archivePath, archiveData)

      options.onProgress?.('正在检查压缩包...')
      const listing = callSevenZip(
        module,
        ['l', '-slt', '-sccUTF-8', '-p-', archivePath],
        '读取压缩包目录',
        structureLimits,
        true,
      )
      const entries = parseSevenZipListing(listing, structureLimits)
      const publicEntries = entries.map(
        ({ sourcePath: _sourcePath, identity: _identity, ...entry }) => Object.freeze(entry),
      )
      const selectedPaths = await selectEntries(Object.freeze(publicEntries))
      if (!selectedPaths || selectedPaths.length === 0) return null

      const selectedIdentities = new Set<string>()
      for (const path of selectedPaths) {
        selectedIdentities.add(canonicalizeArchivePath(path).identity)
      }
      const entriesByIdentity = new Map(entries.map((entry) => [entry.identity, entry]))
      const allowedEntries = new Map<string, ListedSevenZipEntry>()
      for (const identity of selectedIdentities) {
        const entry = entriesByIdentity.get(identity)
        if (!entry || entry.isDirectory) {
          throw new SevenZipArchiveError(`选择了压缩包中不存在的文件: ${identity}`)
        }
        allowedEntries.set(identity, entry)
      }

      const compressionBasis = limits
        ? assertSelectedEntriesWithinLimits(
            entries,
            selectedIdentities,
            archiveData.byteLength,
            limits,
          )
        : 0

      const selectionListPath = `${workDir}/selection.list`
      const selectionList = `${Array.from(
        allowedEntries.values(),
        (entry) => entry.sourcePath,
      ).join('\n')}\n`
      module.FS.writeFile(selectionListPath, new TextEncoder().encode(selectionList))
      module.FS.mkdir(outputDir)
      const restoreGuard = installOutputGuard(
        module.FS as RuntimeFileSystem,
        outputDir,
        allowedEntries,
        compressionBasis,
        limits,
      )
      try {
        options.onProgress?.('正在解压文件...')
        callSevenZip(
          module,
          [
            'x',
            archivePath,
            `-o${outputDir}`,
            '-aoa',
            '-y',
            '-p-',
            '-spd',
            '-scsUTF-8',
            `-i@${selectionListPath}`,
          ],
          '解压文件',
          structureLimits,
        )
      } finally {
        restoreGuard()
      }

      return readExtractedFiles(module.FS, outputDir, allowedEntries)
    } finally {
      removeTree(module.FS, workDir)
    }
  })
}
