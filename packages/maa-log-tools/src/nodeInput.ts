import { lstat, opendir, realpath, stat } from 'node:fs/promises'
import { expandGzipLog, expandSelectedGzipLogs, isGzipLog } from './gzipLog'
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
const SEARCH_TEXT_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

const MAIN_LOG_NAME_SET = new Set<string>(MAIN_LOG_NAMES.map((name) => name.toLowerCase()))
const HISTORY_LOG_NAME_RE = /^(?:maa|maafw)\.bak(?:\..+)?\.log(?:\.gz)?$/i

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

/**
 * 本机目录（用户自己选的日志文件夹）的读取限制。
 *
 * 这类文件不是「不可信压缩包」：不设单文件/总量硬上限，否则 2GB+ 的日志目录直接被拒
 * （旧默认 maxFileBytes=256MB、maxExtractedBytes=512MB）。仍保留压缩比与图片大小限制，
 * 用来挡 gzip 炸弹和异常图片。
 */
const LOCAL_DIRECTORY_LIMIT_OVERRIDES: Partial<ArchiveLimits> = {
  maxFileBytes: 8 * 1024 ** 3,
  maxExtractedBytes: 64 * 1024 ** 3,
  maxCompressedBytes: 8 * 1024 ** 3,
}

const resolveLocalDirectoryLimits = (
  overrides?: Partial<ArchiveLimits>,
): Readonly<ArchiveLimits> => resolveArchiveLimits({ ...LOCAL_DIRECTORY_LIMIT_OVERRIDES, ...overrides })

/** 多来源读取里的单个日志文件（惰性加载，绝不整包拼串）。 */
export interface NodeLogSource {
  /** 解析器内部去重键，形如 `file:<绝对路径>`。 */
  sourceKey: string
  /** 相对日志目录的 posix 路径，写进事件/节点的 `source.path`。 */
  sourcePath: string
  inputIndex: number
  /** 解析进度权重（解压后字符数估算）。 */
  size: number
  loadContent: () => Promise<string>
}

/**
 * `loadNodeLogSources` 的结果：与 `NodeExtractedLogContent` 同样的附属数据，
 * 但日志正文保持「一个文件一个来源」，可由 runtime 逐文件惰性解析。
 */
export interface NodeLogSourcesResult {
  sources: NodeLogSource[]
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: KernelTextFile[]
  /**
   * 解析完成后调用：按各来源实际读到的行数给出合并行号区间
   * （与旧的「拼成一段字符串」口径一致）。
   */
  getSourceSegments: () => SourceSegment[]
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
  return HISTORY_LOG_NAME_RE.test(fileName)
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

/**
 * 旧路径（把多个文件拼成一整串）的字符数上限。
 *
 * V8 单个字符串上限约 512MB 字符，拼到那一步会直接抛 `Invalid string length`，
 * 报错信息完全看不出「是输入太大」；这里提前抛出可诊断的错误，引导调用方改走
 * `loadNodeLogSources` / `analyzeLogSources` 的多来源路径。
 */
const MAX_MERGED_CONTENT_CHARS = 400 * 1024 * 1024

const joinMergedWithSources = (
  chunks: TaggedChunk[],
  maxChars: number = MAX_MERGED_CONTENT_CHARS,
): MergedContent => {
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

    if (content.length > maxChars) {
      throw new InputFileError(
        'merged-content-too-large',
        chunk.path,
        `合并后的日志内容已超过 ${Math.round(maxChars / (1024 * 1024))}M 字符，超出单个 JS 字符串上限；` +
          '请改用 loadNodeLogSources / analyzeLogSources 的多来源路径，不要先拼成一整串。',
      )
    }
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

export interface PrimaryLogGroup {
  /** 组所在目录（posix 风格；压缩包根目录为 ''）。 */
  directory: string
  /** 组内主日志，已按 sortLogPaths 排序：轮转片段 → 备份 → 主日志。 */
  paths: string[]
}

export interface PrimaryLogGroupOptions {
  /**
   * 只保留排序最靠前的那一个主日志（maafw.log 优先于 maa.log）。
   * 框架版本探测用这个模式：并列的 maa.log 通常是遗留文件，混进来会把版本判定搅乱。
   */
  singleMain?: boolean
}

const splitPosixPath = (filePath: string): { directory: string; name: string } => {
  const normalized = toPosixPath(filePath)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1
    ? { directory: '', name: normalized }
    : { directory: normalized.slice(0, lastSlash), name: normalized.slice(lastSlash + 1) }
}

/**
 * 按目录挑出「一组」要解析的主日志，排序规则与 Web 侧 selectPrimaryLogGroup 一致：
 * 目录深度浅优先 → 有主日志优先 → 文件多优先 → 路径字典序。
 *
 * isCoreLogName 同时认主日志、*.bak.log 和 *.bak.<时间戳>.log 轮转片段，所以只有轮转片段的
 * 目录 / 压缩包同样会被选中，而不是直接判成「找不到日志」—— 与 Web / 桌面端的行为对齐。
 */
export const selectPrimaryLogGroup = (
  filePaths: readonly string[],
  options: PrimaryLogGroupOptions = {},
): PrimaryLogGroup | null => {
  const groups = new Map<string, string[]>()
  const mainPaths = new Set<string>()

  for (const filePath of filePaths) {
    const { directory, name } = splitPosixPath(filePath)
    if (!isCoreLogName(name)) continue
    if (MAIN_LOG_NAME_SET.has(name.toLowerCase())) mainPaths.add(filePath)
    const bucket = groups.get(directory)
    if (bucket) bucket.push(filePath)
    else groups.set(directory, [filePath])
  }

  const ranked = [...groups.entries()].map(([directory, paths]) => ({
    directory,
    paths,
    depth: directory === '' ? 0 : directory.split('/').filter(Boolean).length,
    hasMain: paths.some((filePath) => mainPaths.has(filePath)),
  }))
  ranked.sort((left, right) => {
    if (left.depth !== right.depth) return left.depth - right.depth
    if (left.hasMain !== right.hasMain) return left.hasMain ? -1 : 1
    if (left.paths.length !== right.paths.length) return right.paths.length - left.paths.length
    return left.directory.localeCompare(right.directory)
  })

  const winner = ranked[0]
  if (!winner) return null

  const ordered = sortLogPaths(winner.paths)
  if (options.singleMain !== true) {
    return { directory: winner.directory, paths: ordered }
  }

  const preferredMain = ordered.find((filePath) => mainPaths.has(filePath))
  if (!preferredMain) {
    return { directory: winner.directory, paths: ordered }
  }
  return {
    directory: winner.directory,
    paths: [...ordered.filter((filePath) => !mainPaths.has(filePath)), preferredMain],
  }
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
  const content = isGzipLog(filePath)
    ? expandGzipLog(filePath, bytes, context.limits, context.extraction.extractedBytes)
    : bytes
  context.extraction = addSelectedEntry(
    context.extraction,
    createStoredFileMetadata(toPosixPath(filePath), content.byteLength),
    context.limits,
    false,
  )
  return decodeNodeBytes(content)
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
  selectedPaths: readonly string[],
  sourceRef: string,
): MergedContent => {
  const chunks: TaggedChunk[] = []
  for (const entryPath of selectedPaths) {
    const data = entries[entryPath]
    if (!data) continue
    const normalized = toPosixPath(entryPath)
    chunks.push({
      content: decodeNodeBytes(data),
      source: toZipReference(sourceRef, normalized),
      path: normalized,
    })
  }
  return joinMergedWithSources(chunks)
}

export const readNodeTextFileContent = async (
  filePath: string,
  options: ReadNodeTextFileOptions = {},
): Promise<string> => {
  const limits = resolveLocalDirectoryLimits(options.archiveLimits)
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
  const group = selectPrimaryLogGroup(paths)
  if (!group) return null
  expandSelectedGzipLogs(files, group.paths, limits)
  const basePath = group.directory

  const merged = options.focus
    ? collectFocusedZipContents(files, paths, basePath, options.focus, sourceRef)
    : buildDefaultZipContent(files, group.paths, sourceRef)
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

/**
 * 目录里是否有主日志 —— 口径与 Web 侧 isPrimaryLogFileName 对齐：maa.log / maafw.log、
 * *.bak.log，以及 *.bak.<时间戳>.log 轮转片段都算。
 *
 * 只有轮转片段的目录同样是日志目录（以前只认主日志，这种目录会被判成「找不到日志」）。
 */
export const hasNodePrimaryLogInDirectory = async (
  context: NodeInputBudgetContext,
  directoryPath: string,
): Promise<boolean> => {
  if (!(await tryInspectDirectory(context, directoryPath))) return false
  return await withSafeDirectory(context, directoryPath, async (directory) => {
    for await (const entry of directory) {
      if (!isCoreLogName(entry.name)) continue
      const stats = await inspectDirectoryEntry(context, path.join(directoryPath, entry.name))
      if (stats.isFile()) return true
    }
    return false
  })
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
        if (await hasNodePrimaryLogInDirectory(context, fullPath)) return fullPath
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
  if (await hasNodePrimaryLogInDirectory(context, inputPath)) return inputPath

  const directDebugPath = path.join(inputPath, 'debug')
  if (await hasNodePrimaryLogInDirectory(context, directDebugPath)) return directDebugPath

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

/** 目录下全部主日志文件（含轮转片段），交给 selectPrimaryLogGroup 挑选要解析的那一组。 */
export const collectNodeCoreLogPaths = async (
  directoryPath: string,
  context: NodeInputBudgetContext,
): Promise<string[]> => {
  const allFiles = await collectFilesRecursively(directoryPath, context)
  return allFiles.filter((filePath) => isCoreLogName(path.basename(filePath)))
}

const buildDefaultDirectoryContent = async (
  debugPath: string,
  allFiles: string[],
  context: NodeInputBudgetContext,
): Promise<MergedContent> => {
  const group = selectPrimaryLogGroup(allFiles)
  if (!group) return { content: '', segments: [] }

  const chunks: TaggedChunk[] = []
  for (const logPath of group.paths) {
    chunks.push({
      content: await readNodeTextFileWithinBudget(logPath, context),
      source: toFileReference(logPath),
      path: toPosixPath(path.relative(debugPath, logPath)),
    })
  }
  return joinMergedWithSources(chunks)
}

const collectDirectoryAuxiliary = async (
  allFiles: string[],
  debugPath: string,
  context: NodeInputBudgetContext,
): Promise<{
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: KernelTextFile[]
}> => {
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
      if (key) errorImages.set(key, toFileReference(absolutePath))
    }

    if (isRelativeImagePath(lowerRelativePath, 'vision', '.jpg')) {
      const visionKey = parseVisionImageKey(fileName)
      if (visionKey) visionImages.set(visionKey, toFileReference(absolutePath))
      const waitKey = parseWaitFreezesKey(fileName)
      if (waitKey) waitFreezesImages.set(waitKey, toFileReference(absolutePath))
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
  return { errorImages, visionImages, waitFreezesImages, textFiles }
}

/**
 * 读取本机日志目录，但**不把多个文件拼成一整串**：每个文件一个惰性来源。
 *
 * 这是 2GB+ 日志目录唯一可行的入口（V8 单字符串上限 ~512MB）。`focus` 模式需要
 * 按关键词/时间窗过滤，必须读内容才能判断，因此仍合并成单个来源返回。
 */
export const loadNodeLogSources = async (
  inputDirectoryPath: string,
  options: LoadNodeLogDirectoryOptions = {},
): Promise<NodeLogSourcesResult | null> => {
  const limits = resolveLocalDirectoryLimits(options.archiveLimits)
  const context = await createNodeInputBudgetContext(inputDirectoryPath, limits)
  const debugPath = await resolveNodeDebugDirectory(inputDirectoryPath, context)
  if (!debugPath) return null

  const allFiles = await collectFilesRecursively(debugPath, context)
  const auxiliary = await collectDirectoryAuxiliary(allFiles, debugPath, context)

  if (options.focus) {
    // 过滤型加载：必须读内容才能判断，退回「合并成单来源」。
    const merged = await collectFocusedFileContents(
      allFiles.filter((filePath) => isCoreLogName(path.basename(filePath))),
      options.focus,
      context,
    )
    if (!merged.content) return null
    return {
      sources: [
        {
          sourceKey: 'merged:focus',
          sourcePath: '',
          inputIndex: 0,
          size: merged.content.length,
          loadContent: async () => merged.content,
        },
      ],
      ...auxiliary,
      getSourceSegments: () => merged.segments,
    }
  }

  const group = selectPrimaryLogGroup(allFiles)
  if (!group) return null

  const lineCounts: number[] = group.paths.map(() => 0)
  const sources: NodeLogSource[] = []
  for (let index = 0; index < group.paths.length; index += 1) {
    const logPath = group.paths[index]!
    const relativePath = toPosixPath(path.relative(debugPath, logPath))
    const metadata = await stat(logPath).catch(() => null)
    const size = metadata ? metadata.size * (isGzipLog(logPath) ? 8 : 1) : 0
    sources.push({
      sourceKey: toFileReference(logPath),
      sourcePath: relativePath,
      inputIndex: index,
      size,
      loadContent: async () => {
        const content = await readNodeTextFileWithinBudget(logPath, context)
        lineCounts[index] = countNewlines(content) + 1
        return content
      },
    })
  }

  return {
    sources,
    ...auxiliary,
    getSourceSegments: () => {
      let startLine = 1
      const segments: SourceSegment[] = []
      sources.forEach((source, index) => {
        const lineCount = lineCounts[index] ?? 0
        if (lineCount <= 0) return
        segments.push({
          source: source.sourceKey,
          path: source.sourcePath,
          startLine,
          lineCount,
        })
        startLine += lineCount
      })
      return segments
    },
  }
}

export const loadNodeLogDirectory = async (
  inputDirectoryPath: string,
  options: LoadNodeLogDirectoryOptions = {},
): Promise<NodeExtractedLogContent | null> => {
  const limits = resolveLocalDirectoryLimits(options.archiveLimits)
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

  return {
    content: merged.content,
    sourceSegments: merged.segments,
    ...(await collectDirectoryAuxiliary(allFiles, debugPath, context)),
  }
}
