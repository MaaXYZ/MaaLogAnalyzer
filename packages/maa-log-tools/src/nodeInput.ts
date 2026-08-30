import { lstat, opendir, realpath } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'
import type { SourceSegment } from './runtimeInspection'
import {
  addArchiveDirectoryEntry,
  addSelectedEntry,
  ArchiveLimitError,
  assertArchiveInputsWithinLimits,
  createStoredFileMetadata,
  EMPTY_ARCHIVE_DIRECTORY_BUDGET,
  EMPTY_EXTRACTION_BUDGET,
  extractZipEntriesWithinLimits,
  resolveArchiveLimits,
  type ArchiveDirectoryBudget,
  type ArchiveLimits,
  type ExtractionBudget,
} from './archiveLimits'
import {
  getFileIdentity,
  InputFileError,
  readBoundedRegularFile,
  sameFileIdentity,
  type FileIdentity,
} from './boundedFileReader'

export {
  ArchiveFormatError,
  ArchiveLimitError,
  DEFAULT_ARCHIVE_LIMITS,
  resolveArchiveLimits,
} from './archiveLimits'
export { InputFileError } from './boundedFileReader'
export type { ArchiveFormatCode, ArchiveLimitCode, ArchiveLimits } from './archiveLimits'

const MAIN_LOG_NAMES = ['maa.log', 'maafw.log'] as const
const BAK_LOG_NAMES = ['maa.bak.log', 'maafw.bak.log'] as const
const SEARCH_TEXT_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

const MAIN_LOG_NAME_SET = new Set<string>(MAIN_LOG_NAMES.map((name) => name.toLowerCase()))
const HISTORY_LOG_NAME_PATTERNS = [/^maa\.bak(?:\..+)?\.log$/i, /^maafw\.bak(?:\..+)?\.log$/i]

export interface KernelTextFile {
  path: string
  name: string
  content: string
  reference: string
}

export interface NodeExtractedLogContent {
  content: string
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: KernelTextFile[]
  sourceSegments: SourceSegment[]
}

export interface LogBundleFocus {
  keywords?: string[]
  started_after?: string
  started_before?: string
}

export interface ExtractZipContentOptions {
  focus?: LogBundleFocus
  archiveLimits?: Partial<ArchiveLimits>
}

export interface LoadNodeLogDirectoryOptions {
  focus?: LogBundleFocus
  archiveLimits?: Partial<ArchiveLimits>
}

export interface ReadNodeTextFileOptions {
  archiveLimits?: Partial<ArchiveLimits>
  budgetContext?: NodeInputBudgetContext
}

const toPosixPath = (value: string): string => value.replace(/\\/g, '/')

const normalizeLowerPath = (value: string): string => toPosixPath(value).toLowerCase()

const isSearchTextFile = (normalizedPath: string): boolean => {
  const lower = normalizedPath.toLowerCase()
  return SEARCH_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

const isHistoryLogName = (fileName: string): boolean => {
  return HISTORY_LOG_NAME_PATTERNS.some((pattern) => pattern.test(fileName))
}

const isCoreLogName = (fileName: string): boolean => {
  const lower = fileName.toLowerCase()
  return MAIN_LOG_NAME_SET.has(lower) || isHistoryLogName(lower)
}

const decodeNodeBytes = (bytes: Uint8Array): string => {
  const encodings = ['utf-8', 'gbk', 'gb18030', 'gb2312']
  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true })
      const text = decoder.decode(bytes)
      const replacementCount = (text.match(/�/g) || []).length
      if (replacementCount < text.length * 0.01) {
        return text
      }
    } catch {
      continue
    }
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

const joinPath = (base: string, name: string): string => (base ? `${base}/${name}` : name)

const findBaseDirectory = (paths: string[]): string | null => {
  for (const p of paths) {
    const lower = normalizeLowerPath(p)
    if (
      lower.endsWith('/maa.log') ||
      lower === 'maa.log' ||
      lower.endsWith('/maafw.log') ||
      lower === 'maafw.log'
    ) {
      const normalized = toPosixPath(p)
      const lastSlash = normalized.lastIndexOf('/')
      return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
    }
  }
  return null
}

const findZipEntry = (
  entries: Record<string, Uint8Array>,
  paths: string[],
  targetPath: string,
): Uint8Array | null => {
  const normalizedTarget = normalizeLowerPath(targetPath)
  for (const currentPath of paths) {
    if (normalizeLowerPath(currentPath) === normalizedTarget) {
      return entries[currentPath]
    }
  }
  return null
}

const parseErrorImageKey = (fileName: string): string | null => {
  const match = fileName.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/)
  if (!match) return null
  const [, timestamp, ms, nodeName] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${nodeName}`
}

const parseVisionImageKey = (fileName: string): string | null => {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_\d{9,})\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

const parseWaitFreezesKey = (fileName: string): string | null => {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_wait_freezes)\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

const isNeededZipEntry = (entryPath: string): boolean => {
  const lower = normalizeLowerPath(entryPath)
  const name = lower.slice(lower.lastIndexOf('/') + 1)
  if (isSearchTextFile(lower)) return true
  if (isCoreLogName(name)) return true
  if ((lower.includes('/on_error/') || lower.startsWith('on_error/')) && lower.endsWith('.png'))
    return true
  if ((lower.includes('/vision/') || lower.startsWith('vision/')) && lower.endsWith('.jpg'))
    return true
  return false
}

const toZipReference = (sourceRef: string, entryPath: string): string => {
  return `zip:${sourceRef}#${toPosixPath(entryPath)}`
}

const toFileReference = (absolutePath: string): string => {
  return `file:${toPosixPath(absolutePath)}`
}

const isRelativeImagePath = (
  relativePath: string,
  directory: 'on_error' | 'vision',
  extension: '.png' | '.jpg',
): boolean => {
  const normalized = relativePath.toLowerCase()
  return (
    normalized === `${directory}${extension}` ||
    normalized.startsWith(`${directory}/`) ||
    normalized.includes(`/${directory}/`)
  )
}

const normalizeTimestampBoundary = (value: string | undefined): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.includes('.') ? trimmed : `${trimmed}.000`
}

const extractTimestamps = (content: string): string[] => {
  const matches = content.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]/g) ?? []
  return matches
    .map((item) => item.slice(1, -1))
    .map((item) => normalizeTimestampBoundary(item) ?? item)
}

const contentMatchesFocus = (content: string, focus: LogBundleFocus): boolean => {
  const keywords = (focus.keywords ?? []).filter((keyword) => keyword.trim().length > 0)
  if (keywords.length > 0 && !keywords.some((keyword) => content.includes(keyword))) {
    return false
  }

  const startedAfter = normalizeTimestampBoundary(focus.started_after)
  const startedBefore = normalizeTimestampBoundary(focus.started_before)
  if (!startedAfter && !startedBefore) {
    return true
  }

  return extractTimestamps(content).some((timestamp) => {
    if (startedAfter && timestamp < startedAfter) {
      return false
    }
    if (startedBefore && timestamp > startedBefore) {
      return false
    }
    return true
  })
}

interface TaggedChunk {
  content: string
  source: string
  path: string
}

interface MergedContent {
  content: string
  segments: SourceSegment[]
}

const countNewlines = (content: string): number => {
  let count = 0
  let pos = 0
  while ((pos = content.indexOf(String.fromCharCode(10), pos)) >= 0) {
    count += 1
    pos += 1
  }
  return count
}

const joinMergedWithSources = (chunks: TaggedChunk[]): MergedContent => {
  let content = ''
  let runningNewlines = 0
  const chunkStarts: { startLine: number; source: string; path: string }[] = []

  for (const chunk of chunks) {
    if (chunk.content.length === 0) continue

    if (content.length === 0) {
      content = chunk.content
    } else if (content.endsWith(String.fromCharCode(10))) {
      content += chunk.content
    } else {
      content += String.fromCharCode(10) + chunk.content
      runningNewlines += 1
    }

    const startLine = runningNewlines + 1
    chunkStarts.push({ startLine, source: chunk.source, path: chunk.path })
    runningNewlines += countNewlines(chunk.content)
  }

  if (chunkStarts.length === 0) {
    return { content: '', segments: [] }
  }

  const totalLines = runningNewlines + 1
  const segments: SourceSegment[] = chunkStarts.map((info, i) => ({
    source: info.source,
    path: info.path,
    startLine: info.startLine,
    lineCount:
      i < chunkStarts.length - 1
        ? chunkStarts[i + 1].startLine - info.startLine
        : totalLines - info.startLine + 1,
  }))

  return { content, segments }
}

const rankLogPath = (filePath: string): number => {
  const baseName = path.basename(filePath).toLowerCase()
  if (baseName === 'maafw.bak.log' || baseName.startsWith('maafw.bak.')) {
    return 0
  }
  if (baseName === 'maa.bak.log' || baseName.startsWith('maa.bak.')) {
    return 1
  }
  if (baseName === 'maafw.log') {
    return 2
  }
  if (baseName === 'maa.log') {
    return 3
  }
  return 10
}

const sortLogPaths = (paths: string[]): string[] => {
  return [...paths].sort((left, right) => {
    const rankDiff = rankLogPath(left) - rankLogPath(right)
    if (rankDiff !== 0) return rankDiff
    return left.localeCompare(right)
  })
}

export interface NodeInputBudgetContext {
  readonly limits: Readonly<ArchiveLimits>
  readonly rootPath: string
  readonly rootRealPath: string
  directory: ArchiveDirectoryBudget
  extraction: ExtractionBudget
  readonly chargedPaths: Set<string>
  readonly discoveredIdentities: Map<string, FileIdentity>
}

const pathKey = (value: string): string => {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const isPathInside = (rootPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(rootPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

const assertPathInsideContext = async (
  context: NodeInputBudgetContext,
  fullPath: string,
): Promise<void> => {
  const absolutePath = path.resolve(fullPath)
  if (!isPathInside(context.rootPath, absolutePath)) {
    throw new InputFileError(
      'path-escape',
      fullPath,
      `Input path escapes the selected root: ${fullPath}`,
    )
  }
  const physicalPath = await realpath(absolutePath)
  if (!isPathInside(context.rootRealPath, physicalPath)) {
    throw new InputFileError(
      'path-escape',
      fullPath,
      `Input path resolves outside the selected root: ${fullPath}`,
    )
  }
}

export const createNodeInputBudgetContext = async (
  rootPath: string,
  limits: Readonly<ArchiveLimits>,
  requireDirectoryRoot: boolean = true,
): Promise<NodeInputBudgetContext> => {
  const absoluteRoot = path.resolve(rootPath)
  const rootStats = await lstat(absoluteRoot)
  if (rootStats.isSymbolicLink()) {
    throw new InputFileError(
      'symlink',
      absoluteRoot,
      `Symbolic-link roots are not allowed: ${absoluteRoot}`,
    )
  }
  if (requireDirectoryRoot && !rootStats.isDirectory()) {
    throw new InputFileError(
      'not-directory',
      absoluteRoot,
      `Expected a directory root: ${absoluteRoot}`,
    )
  }
  const physicalRoot = await realpath(absoluteRoot)
  return {
    limits,
    rootPath: absoluteRoot,
    rootRealPath: physicalRoot,
    directory: EMPTY_ARCHIVE_DIRECTORY_BUDGET,
    extraction: EMPTY_EXTRACTION_BUDGET,
    chargedPaths: new Set<string>(),
    discoveredIdentities: new Map<string, FileIdentity>(),
  }
}

const chargePath = (context: NodeInputBudgetContext, fullPath: string): void => {
  const key = pathKey(fullPath)
  if (context.chargedPaths.has(key)) return
  const relativePath = toPosixPath(path.relative(context.rootPath, path.resolve(fullPath)))
  context.directory = addArchiveDirectoryEntry(
    context.directory,
    {
      name: relativePath,
      size: 0,
      originalSize: 0,
      compression: 0,
    },
    context.limits,
  )
  context.chargedPaths.add(key)
}

const recordDiscoveredIdentity = (
  context: NodeInputBudgetContext,
  fullPath: string,
  stats: Stats,
): void => {
  const key = pathKey(fullPath)
  const identity = getFileIdentity(stats)
  const previous = context.discoveredIdentities.get(key)
  if (previous && !sameFileIdentity(previous, identity)) {
    throw new InputFileError(
      'identity-changed',
      fullPath,
      `Input identity changed during directory analysis: ${fullPath}`,
    )
  }
  context.discoveredIdentities.set(key, identity)
}

const inspectDirectoryEntry = async (
  context: NodeInputBudgetContext,
  fullPath: string,
): Promise<Stats> => {
  const stats = await lstat(fullPath)
  chargePath(context, fullPath)
  if (stats.isSymbolicLink()) {
    throw new InputFileError(
      'symlink',
      fullPath,
      `Symbolic-link entries are not allowed: ${fullPath}`,
    )
  }
  await assertPathInsideContext(context, fullPath)
  recordDiscoveredIdentity(context, fullPath, stats)
  return stats
}

const readNodeTextFileWithinBudget = async (
  filePath: string,
  context: NodeInputBudgetContext,
): Promise<string> => {
  chargePath(context, filePath)
  await assertPathInsideContext(context, filePath)
  const remainingBytes = context.limits.maxExtractedBytes - context.extraction.extractedBytes
  const maxBytes = Math.min(context.limits.maxFileBytes, remainingBytes)
  const limitCode = context.limits.maxFileBytes <= remainingBytes ? 'file-size' : 'extracted-size'
  const bytes = await readBoundedRegularFile(
    filePath,
    maxBytes,
    (actualBytes) =>
      new ArchiveLimitError(
        limitCode,
        limitCode === 'extracted-size'
          ? context.extraction.extractedBytes + actualBytes
          : actualBytes,
        limitCode === 'extracted-size'
          ? context.limits.maxExtractedBytes
          : context.limits.maxFileBytes,
      ),
    { expectedIdentity: context.discoveredIdentities.get(pathKey(filePath)) },
  )
  context.extraction = addSelectedEntry(
    context.extraction,
    createStoredFileMetadata(toPosixPath(filePath), bytes.byteLength),
    context.limits,
    false,
  )
  return decodeNodeBytes(bytes)
}

const collectFocusedFileContents = async (
  logPaths: string[],
  focus: LogBundleFocus,
  context: NodeInputBudgetContext,
): Promise<MergedContent> => {
  const chunks: TaggedChunk[] = []
  for (const logPath of sortLogPaths(logPaths)) {
    const content = await readNodeTextFileWithinBudget(logPath, context)
    if (!contentMatchesFocus(content, focus)) continue
    chunks.push({
      content,
      source: toFileReference(logPath),
      path: toPosixPath(path.basename(logPath)),
    })
  }
  return joinMergedWithSources(chunks)
}

const collectFocusedZipContents = (
  entries: Record<string, Uint8Array>,
  paths: string[],
  basePath: string,
  focus: LogBundleFocus,
  sourceRef: string,
): MergedContent => {
  const normalizedBasePath = normalizeLowerPath(basePath)
  const candidatePaths = sortLogPaths(
    paths.filter((entryPath) => {
      const normalizedPath = toPosixPath(entryPath)
      const lastSlash = normalizedPath.lastIndexOf('/')
      const parentPath = lastSlash === -1 ? '' : normalizedPath.slice(0, lastSlash)
      if (normalizeLowerPath(parentPath) !== normalizedBasePath) {
        return false
      }
      const fileName = normalizedPath.slice(lastSlash + 1)
      return isCoreLogName(fileName)
    }),
  )

  const chunks: TaggedChunk[] = []
  for (const entryPath of candidatePaths) {
    const bytes = entries[entryPath]
    if (!bytes) continue
    const content = decodeNodeBytes(bytes)
    if (!contentMatchesFocus(content, focus)) continue
    chunks.push({
      content,
      source: toZipReference(sourceRef, toPosixPath(entryPath)),
      path: toPosixPath(entryPath),
    })
  }
  return joinMergedWithSources(chunks)
}

const buildDefaultZipContent = (
  entries: Record<string, Uint8Array>,
  paths: string[],
  basePath: string,
  sourceRef: string,
): MergedContent => {
  const bakLogName = BAK_LOG_NAMES.find((name) =>
    findZipEntry(entries, paths, joinPath(basePath, name)),
  )
  const mainLogName = MAIN_LOG_NAMES.find((name) =>
    findZipEntry(entries, paths, joinPath(basePath, name)),
  )

  const chunks: TaggedChunk[] = []
  if (bakLogName) {
    const data = findZipEntry(entries, paths, joinPath(basePath, bakLogName))
    if (data) {
      chunks.push({
        content: decodeNodeBytes(data),
        source: toZipReference(sourceRef, joinPath(basePath, bakLogName)),
        path: toPosixPath(joinPath(basePath, bakLogName)),
      })
    }
  }
  if (mainLogName) {
    const data = findZipEntry(entries, paths, joinPath(basePath, mainLogName))
    if (data) {
      chunks.push({
        content: decodeNodeBytes(data),
        source: toZipReference(sourceRef, joinPath(basePath, mainLogName)),
        path: toPosixPath(joinPath(basePath, mainLogName)),
      })
    }
  }
  return joinMergedWithSources(chunks)
}

export const readNodeTextFileContent = async (
  filePath: string,
  options: ReadNodeTextFileOptions = {},
): Promise<string> => {
  const limits = resolveArchiveLimits(options.archiveLimits)
  const context =
    options.budgetContext ??
    (await createNodeInputBudgetContext(path.dirname(path.resolve(filePath)), limits))
  return readNodeTextFileWithinBudget(filePath, context)
}

export const readNodeTextFilesContent = async (
  filePaths: readonly string[],
  options: ReadNodeTextFileOptions = {},
): Promise<string[]> => {
  const limits = resolveArchiveLimits(options.archiveLimits)
  const commonRoot = filePaths.length > 0 ? path.dirname(path.resolve(filePaths[0])) : process.cwd()
  const context = options.budgetContext ?? (await createNodeInputBudgetContext(commonRoot, limits))
  const contents: string[] = []
  for (const filePath of filePaths) {
    contents.push(await readNodeTextFileWithinBudget(filePath, context))
  }
  return contents
}

export const extractZipContentFromNodeBuffer = (
  zipData: Uint8Array,
  sourceRef: string = 'memory.zip',
  options: ExtractZipContentOptions = {},
): NodeExtractedLogContent | null => {
  const limits = resolveArchiveLimits(options.archiveLimits)
  const { files } = extractZipEntriesWithinLimits(zipData, isNeededZipEntry, limits)
  const paths = Object.keys(files)
  const basePath = findBaseDirectory(paths)
  if (basePath == null) return null

  const merged = options.focus
    ? collectFocusedZipContents(files, paths, basePath, options.focus, sourceRef)
    : buildDefaultZipContent(files, paths, basePath, sourceRef)
  if (!merged.content) return null

  const errorImages = new Map<string, string>()
  const visionImages = new Map<string, string>()
  const waitFreezesImages = new Map<string, string>()
  const textFiles: KernelTextFile[] = []

  const onErrorPrefix = joinPath(basePath, 'on_error/').toLowerCase()
  const visionPrefix = joinPath(basePath, 'vision/').toLowerCase()

  for (const currentPath of paths) {
    const normalizedPath = toPosixPath(currentPath)
    const lowerPath = normalizedPath.toLowerCase()
    const fileName = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1)

    if (lowerPath.startsWith(onErrorPrefix) && lowerPath.endsWith('.png')) {
      const key = parseErrorImageKey(fileName)
      if (key) {
        errorImages.set(key, toZipReference(sourceRef, normalizedPath))
      }
    }

    if (lowerPath.startsWith(visionPrefix) && lowerPath.endsWith('.jpg')) {
      const visionKey = parseVisionImageKey(fileName)
      if (visionKey) {
        visionImages.set(visionKey, toZipReference(sourceRef, normalizedPath))
      }
      const waitKey = parseWaitFreezesKey(fileName)
      if (waitKey) {
        waitFreezesImages.set(waitKey, toZipReference(sourceRef, normalizedPath))
      }
    }

    if (!isSearchTextFile(normalizedPath)) continue
    if (isCoreLogName(fileName)) continue

    const fileData = files[currentPath]
    if (!fileData) continue
    textFiles.push({
      path: normalizedPath,
      name: fileName,
      content: decodeNodeBytes(fileData),
      reference: toZipReference(sourceRef, normalizedPath),
    })
  }

  textFiles.sort((a, b) => a.path.localeCompare(b.path))
  return {
    content: merged.content,
    sourceSegments: merged.segments,
    errorImages,
    visionImages,
    waitFreezesImages,
    textFiles,
  }
}

export const extractZipContentFromNodeFile = async (
  zipFilePath: string,
  options: ExtractZipContentOptions = {},
): Promise<NodeExtractedLogContent | null> => {
  const limits = resolveArchiveLimits(options.archiveLimits)
  const bytes = await readNodeArchiveFileBytes(zipFilePath, limits)
  return extractZipContentFromNodeBuffer(bytes, zipFilePath, {
    ...options,
    archiveLimits: limits,
  })
}

export const readNodeArchiveFileBytes = async (
  zipFilePath: string,
  limits: Readonly<ArchiveLimits>,
): Promise<Uint8Array> => {
  assertArchiveInputsWithinLimits([{ size: 0 }], limits)
  const context = await createNodeInputBudgetContext(
    path.dirname(path.resolve(zipFilePath)),
    limits,
  )
  chargePath(context, zipFilePath)
  await assertPathInsideContext(context, zipFilePath)
  const bytes = await readBoundedRegularFile(
    zipFilePath,
    limits.maxCompressedBytes,
    (actualBytes) =>
      new ArchiveLimitError('compressed-size', actualBytes, limits.maxCompressedBytes),
  )
  assertArchiveInputsWithinLimits([{ size: bytes.byteLength }], limits)
  return bytes
}

const assertDirectoryIdentity = (
  directoryPath: string,
  expected: Readonly<FileIdentity>,
  stats: Stats,
): void => {
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new InputFileError(
      'not-directory',
      directoryPath,
      `Expected a stable directory: ${directoryPath}`,
    )
  }
  if (!sameFileIdentity(expected, getFileIdentity(stats))) {
    throw new InputFileError(
      'identity-changed',
      directoryPath,
      `Directory identity changed during traversal: ${directoryPath}`,
    )
  }
}

const inspectDirectory = async (
  context: NodeInputBudgetContext,
  directoryPath: string,
): Promise<Stats> => {
  if (pathKey(directoryPath) !== pathKey(context.rootPath)) chargePath(context, directoryPath)
  const stats = await lstat(directoryPath)
  if (stats.isSymbolicLink()) {
    throw new InputFileError(
      'symlink',
      directoryPath,
      `Symbolic-link directories are not allowed: ${directoryPath}`,
    )
  }
  if (!stats.isDirectory()) {
    throw new InputFileError(
      'not-directory',
      directoryPath,
      `Expected a directory: ${directoryPath}`,
    )
  }
  await assertPathInsideContext(context, directoryPath)
  recordDiscoveredIdentity(context, directoryPath, stats)
  return stats
}

const withSafeDirectory = async <T>(
  context: NodeInputBudgetContext,
  directoryPath: string,
  consume: (directory: Awaited<ReturnType<typeof opendir>>) => Promise<T>,
): Promise<T> => {
  const beforeOpen = await inspectDirectory(context, directoryPath)
  const expectedIdentity = getFileIdentity(beforeOpen)
  const directory = await opendir(directoryPath)
  const afterOpen = await lstat(directoryPath)
  assertDirectoryIdentity(directoryPath, expectedIdentity, afterOpen)
  try {
    return await consume(directory)
  } finally {
    await directory.close().catch(() => undefined)
    const afterRead = await lstat(directoryPath)
    assertDirectoryIdentity(directoryPath, expectedIdentity, afterRead)
  }
}

const tryInspectDirectory = async (
  context: NodeInputBudgetContext,
  directoryPath: string,
): Promise<boolean> => {
  try {
    await inspectDirectory(context, directoryPath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export const hasNodeMainLogInDirectory = async (
  context: NodeInputBudgetContext,
  directoryPath: string,
): Promise<boolean> => {
  if (!(await tryInspectDirectory(context, directoryPath))) return false
  for (const name of MAIN_LOG_NAMES) {
    const candidatePath = path.join(directoryPath, name)
    try {
      const stats = await inspectDirectoryEntry(context, candidatePath)
      if (stats.isFile()) return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
  }
  return false
}

export const findExistingRegularNodeFile = async (
  context: NodeInputBudgetContext,
  directoryPath: string,
  names: readonly string[],
): Promise<string | null> => {
  for (const name of names) {
    const candidatePath = path.join(directoryPath, name)
    try {
      const stats = await inspectDirectoryEntry(context, candidatePath)
      if (stats.isFile()) return candidatePath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
  }
  return null
}

const findDebugDirectoryRecursively = async (
  rootPath: string,
  context: NodeInputBudgetContext,
): Promise<string | null> => {
  const pending = [rootPath]
  while (pending.length > 0) {
    const currentPath = pending.pop()
    if (!currentPath) break
    const found = await withSafeDirectory(context, currentPath, async (directory) => {
      for await (const entry of directory) {
        const fullPath = path.join(currentPath, entry.name)
        const stats = await inspectDirectoryEntry(context, fullPath)
        if (!stats.isDirectory()) continue
        if (await hasNodeMainLogInDirectory(context, fullPath)) return fullPath
        pending.push(fullPath)
      }
      return null
    })
    if (found) return found
  }
  return null
}

export const resolveNodeDebugDirectory = async (
  inputPath: string,
  context: NodeInputBudgetContext,
): Promise<string | null> => {
  if (await hasNodeMainLogInDirectory(context, inputPath)) return inputPath

  const directDebugPath = path.join(inputPath, 'debug')
  if (await hasNodeMainLogInDirectory(context, directDebugPath)) return directDebugPath

  return findDebugDirectoryRecursively(inputPath, context)
}

const collectFilesRecursively = async (
  rootPath: string,
  context: NodeInputBudgetContext,
): Promise<string[]> => {
  const collected: string[] = []
  const pending = [rootPath]

  while (pending.length > 0) {
    const currentPath = pending.pop()
    if (!currentPath) break
    await withSafeDirectory(context, currentPath, async (directory) => {
      for await (const entry of directory) {
        const fullPath = path.join(currentPath, entry.name)
        const stats = await inspectDirectoryEntry(context, fullPath)
        if (stats.isDirectory()) {
          pending.push(fullPath)
        } else if (stats.isFile()) {
          collected.push(fullPath)
        }
      }
    })
  }
  return collected
}

const pickPrimaryLogPath = async (
  debugPath: string,
  allFiles: string[],
  candidates: readonly string[],
): Promise<string | null> => {
  for (const name of candidates) {
    const directPath = path.join(debugPath, name)
    const directMatch = allFiles.find((filePath) => pathKey(filePath) === pathKey(directPath))
    if (directMatch) return directMatch
  }

  const normalizedCandidates = new Set(candidates.map((name) => name.toLowerCase()))
  for (const filePath of allFiles) {
    const fileName = path.basename(filePath).toLowerCase()
    if (normalizedCandidates.has(fileName)) {
      return filePath
    }
  }
  return null
}

const buildDefaultDirectoryContent = async (
  debugPath: string,
  allFiles: string[],
  context: NodeInputBudgetContext,
): Promise<MergedContent> => {
  const bakLogPath = await pickPrimaryLogPath(debugPath, allFiles, BAK_LOG_NAMES)
  const mainLogPath = await pickPrimaryLogPath(debugPath, allFiles, MAIN_LOG_NAMES)

  const chunks: TaggedChunk[] = []
  if (bakLogPath) {
    chunks.push({
      content: await readNodeTextFileWithinBudget(bakLogPath, context),
      source: toFileReference(bakLogPath),
      path: toPosixPath(path.relative(debugPath, bakLogPath)),
    })
  }
  if (mainLogPath) {
    chunks.push({
      content: await readNodeTextFileWithinBudget(mainLogPath, context),
      source: toFileReference(mainLogPath),
      path: toPosixPath(path.relative(debugPath, mainLogPath)),
    })
  }
  return joinMergedWithSources(chunks)
}

export const loadNodeLogDirectory = async (
  inputDirectoryPath: string,
  options: LoadNodeLogDirectoryOptions = {},
): Promise<NodeExtractedLogContent | null> => {
  const limits = resolveArchiveLimits(options.archiveLimits)
  const context = await createNodeInputBudgetContext(inputDirectoryPath, limits)
  const debugPath = await resolveNodeDebugDirectory(inputDirectoryPath, context)
  if (!debugPath) return null

  const allFiles = await collectFilesRecursively(debugPath, context)
  const merged = options.focus
    ? await collectFocusedFileContents(
        allFiles.filter((filePath) => isCoreLogName(path.basename(filePath))),
        options.focus,
        context,
      )
    : await buildDefaultDirectoryContent(debugPath, allFiles, context)
  if (!merged.content) return null

  const errorImages = new Map<string, string>()
  const visionImages = new Map<string, string>()
  const waitFreezesImages = new Map<string, string>()
  const textFiles: KernelTextFile[] = []

  for (const absolutePath of allFiles) {
    const relativePath = toPosixPath(path.relative(debugPath, absolutePath))
    const lowerRelativePath = relativePath.toLowerCase()
    const fileName = path.basename(absolutePath)

    if (isRelativeImagePath(lowerRelativePath, 'on_error', '.png')) {
      const key = parseErrorImageKey(fileName)
      if (key) {
        errorImages.set(key, toFileReference(absolutePath))
      }
    }

    if (isRelativeImagePath(lowerRelativePath, 'vision', '.jpg')) {
      const visionKey = parseVisionImageKey(fileName)
      if (visionKey) {
        visionImages.set(visionKey, toFileReference(absolutePath))
      }
      const waitKey = parseWaitFreezesKey(fileName)
      if (waitKey) {
        waitFreezesImages.set(waitKey, toFileReference(absolutePath))
      }
    }

    if (!isSearchTextFile(relativePath)) continue
    if (isCoreLogName(fileName)) continue

    textFiles.push({
      path: relativePath,
      name: fileName,
      content: await readNodeTextFileWithinBudget(absolutePath, context),
      reference: toFileReference(absolutePath),
    })
  }

  textFiles.sort((a, b) => a.path.localeCompare(b.path))

  return {
    content: merged.content,
    sourceSegments: merged.segments,
    errorImages,
    visionImages,
    waitFreezesImages,
    textFiles,
  }
}
