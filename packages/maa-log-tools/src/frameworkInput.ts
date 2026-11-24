import { lstat, stat } from 'node:fs/promises'
import path from 'node:path'
import { expandSelectedGzipLogs, isGzipLog } from './gzipLog'
import {
  createFrameworkSessionsScanner,
  extractFrameworkSessions,
  type FrameworkLogSource,
  type FrameworkSessionExtraction,
  type FrameworkSessionsScanner,
} from './frameworkVersion'
import {
  ArchiveLimitError,
  extractInspectedZipEntriesWithinLimits,
  inspectZipDirectory,
  resolveArchiveLimits,
  type ArchiveLimits,
} from './archiveLimits'
import {
  collectNodeCoreLogPaths,
  createNodeInputBudgetContext,
  InputFileError,
  readNodeArchiveFileBytes,
  readNodeTextFileContent,
  readNodeLogTextChunks,
  readNodeTextFilesContent,
  resolveLocalDirectoryLimits,
  resolveNodeDebugDirectory,
  selectPrimaryLogGroup,
} from './nodeInput'

export interface LoadFrameworkLogSourcesOptions {
  archiveLimits?: Partial<ArchiveLimits>
}

const toPosixPath = (value: string): string => value.replace(/\\/g, '/')

const decodeBytes = (bytes: Uint8Array): string => {
  for (const encoding of ['utf-8', 'gbk', 'gb18030', 'gb2312']) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes)
    } catch {
      continue
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}


const loadZipSources = async (
  zipPath: string,
  limits: Readonly<ArchiveLimits>,
): Promise<FrameworkLogSource[]> => {
  const bytes = await readNodeArchiveFileBytes(zipPath, limits)
  const entries = inspectZipDirectory(bytes, limits)
  const paths = entries.map((entry) => entry.name)
  // 版本探测沿用「一个备份 + 一个主日志（maafw 优先）」的老规则，只是备份侧现在也包含
  // *.bak.<时间戳>.log 轮转片段；只有轮转片段的压缩包同样能选出这一组，而不是返回空。
  const group = selectPrimaryLogGroup(paths, { singleMain: true })
  if (!group) return []

  const selectedPaths = new Set(group.paths)
  const { files } = extractInspectedZipEntriesWithinLimits(
    bytes,
    entries,
    (entryPath) => selectedPaths.has(entryPath),
    limits,
  )

  expandSelectedGzipLogs(files, group.paths, limits)
  return group.paths.flatMap((entryPath) => {
    const data = files[entryPath]
    if (!data) return []
    const normalized = toPosixPath(entryPath)
    return [
      {
        path: normalized,
        name: path.posix.basename(normalized),
        content: decodeBytes(data),
        reference: `zip:${toPosixPath(zipPath)}#${normalized}`,
      },
    ]
  })
}

const loadDirectorySources = async (
  directoryPath: string,
  limits: Readonly<ArchiveLimits>,
): Promise<FrameworkLogSource[]> => {
  const context = await createNodeInputBudgetContext(directoryPath, limits)
  const debugPath = await resolveNodeDebugDirectory(directoryPath, context)
  if (!debugPath) return []
  const selected =
    selectPrimaryLogGroup(await collectNodeCoreLogPaths(debugPath, context), {
      singleMain: true,
    })?.paths ?? []

  const contents = await readNodeTextFilesContent(selected, {
    archiveLimits: limits,
    budgetContext: context,
  })
  return selected.map((absolutePath, index) => ({
    path: toPosixPath(path.relative(debugPath, absolutePath)),
    name: path.basename(absolutePath),
    content: contents[index] ?? '',
    reference: `file:${toPosixPath(absolutePath)}`,
  }))
}

const EMPTY_FRAMEWORK_EXTRACTION: FrameworkSessionExtraction = {
  sessions: [],
  summary: { status: 'none', versions: [] },
  warnings: [],
}

/**
 * 把单个日志文件流式喂进扫描器：按块解压/解码，逐行回调，不保留整段内容或行数组。
 *
 * 压缩比 / 单文件 / 总量上限沿用目录读取的口径（边读边检查）。
 */
const scanFileIntoScanner = async (
  filePath: string,
  scanner: FrameworkSessionsScanner,
  limits: Readonly<ArchiveLimits>,
): Promise<void> => {
  const gzip = isGzipLog(filePath)
  const compressedBytes = gzip ? (await stat(filePath)).size : 0
  let decompressedBytes = 0

  const charge = (bytes: number): void => {
    decompressedBytes += bytes
    if (decompressedBytes > limits.maxFileBytes) {
      throw new ArchiveLimitError('file-size', decompressedBytes, limits.maxFileBytes)
    }
    if (
      gzip &&
      compressedBytes > 0 &&
      decompressedBytes >= limits.compressionRatioMinBytes &&
      decompressedBytes / compressedBytes > limits.maxCompressionRatio
    ) {
      throw new ArchiveLimitError(
        'compression-ratio',
        decompressedBytes / compressedBytes,
        limits.maxCompressionRatio,
      )
    }
    if (decompressedBytes > limits.maxExtractedBytes) {
      throw new ArchiveLimitError('extracted-size', decompressedBytes, limits.maxExtractedBytes)
    }
  }

  let pending = ''
  for await (const chunk of readNodeLogTextChunks(filePath, { gzip, onDecompressedBytes: charge })) {
    const combined = pending.length > 0 ? pending + chunk : chunk
    let start = 0
    while (true) {
      const end = combined.indexOf('\n', start)
      if (end < 0) break
      const line = combined.slice(start, end)
      scanner.addLine(line.endsWith('\r') ? line.slice(0, -1) : line)
      start = end + 1
    }
    pending = combined.slice(start)
  }
  if (pending.length > 0) {
    scanner.addLine(pending.endsWith('\r') ? pending.slice(0, -1) : pending)
  }
}

/** 目录内的主日志组（与 `loadFrameworkLogSources` 的选择规则一致）。 */
const selectFrameworkLogPaths = async (
  directoryPath: string,
  limits: Readonly<ArchiveLimits>,
): Promise<{ debugPath: string; paths: string[] } | null> => {
  const context = await createNodeInputBudgetContext(directoryPath, limits)
  const debugPath = await resolveNodeDebugDirectory(directoryPath, context)
  if (!debugPath) return null
  const paths =
    selectPrimaryLogGroup(await collectNodeCoreLogPaths(debugPath, context), {
      singleMain: true,
    })?.paths ?? []
  return { debugPath, paths }
}

/**
 * 流式版框架版本提取：逐文件读、逐行扫，读完即丢。
 *
 * 与 `extractFrameworkSessions(await loadFrameworkLogSources(path))` 输出一致，但不会把
 * 所有分卷的完整文本同时留在内存里（2.4GB 目录上旧路径峰值 ~5GB，本方法只保留当前块）。
 */
export const extractFrameworkSessionsFromPath = async (
  targetPath: string,
  options: LoadFrameworkLogSourcesOptions = {},
): Promise<FrameworkSessionExtraction> => {
  const limits = resolveLocalDirectoryLimits(options.archiveLimits)
  const targetStat = await lstat(targetPath)
  if (targetStat.isSymbolicLink()) {
    throw new InputFileError(
      'symlink',
      targetPath,
      `Symbolic-link inputs are not allowed: ${targetPath}`,
    )
  }

  if (targetStat.isDirectory()) {
    const selected = await selectFrameworkLogPaths(targetPath, limits)
    if (!selected || selected.paths.length === 0) return EMPTY_FRAMEWORK_EXTRACTION
    const scanner = createFrameworkSessionsScanner()
    for (const logPath of selected.paths) {
      scanner.beginSource({
        path: toPosixPath(path.relative(selected.debugPath, logPath)),
        name: path.basename(logPath),
        reference: `file:${toPosixPath(logPath)}`,
      })
      await scanFileIntoScanner(logPath, scanner, limits)
      scanner.endSource()
    }
    return scanner.finish()
  }

  if (!targetStat.isFile()) {
    throw new InputFileError(
      'not-regular-file',
      targetPath,
      `Expected a regular file: ${targetPath}`,
    )
  }

  // 压缩包本身已经整体在内存里（zip 解压语义要求），沿用整段路径。
  if (targetPath.toLowerCase().endsWith('.zip')) {
    return extractFrameworkSessions(await loadFrameworkLogSources(targetPath, options))
  }

  const scanner = createFrameworkSessionsScanner()
  scanner.beginSource({
    path: toPosixPath(targetPath),
    name: path.basename(targetPath),
    reference: `file:${toPosixPath(targetPath)}`,
  })
  await scanFileIntoScanner(targetPath, scanner, limits)
  scanner.endSource()
  return scanner.finish()
}

export const loadFrameworkLogSources = async (
  targetPath: string,
  options: LoadFrameworkLogSourcesOptions = {},
): Promise<FrameworkLogSource[]> => {
  const limits = resolveArchiveLimits(options.archiveLimits)
  const targetStat = await lstat(targetPath)
  if (targetStat.isSymbolicLink()) {
    throw new InputFileError(
      'symlink',
      targetPath,
      `Symbolic-link inputs are not allowed: ${targetPath}`,
    )
  }
  // 本机目录/文件不受"不可信压缩包"威胁模型约束：沿用目录读取的宽松上限，
  // 否则 277MB 的轮转分卷会被旧的 256MB 默认上限直接拒掉。
  if (targetStat.isDirectory()) {
    return loadDirectorySources(targetPath, resolveLocalDirectoryLimits(options.archiveLimits))
  }
  if (!targetStat.isFile()) {
    throw new InputFileError(
      'not-regular-file',
      targetPath,
      `Expected a regular file: ${targetPath}`,
    )
  }
  if (targetPath.toLowerCase().endsWith('.zip')) return loadZipSources(targetPath, limits)
  return [
    {
      path: toPosixPath(targetPath),
      name: path.basename(targetPath),
      content: await readNodeTextFileContent(targetPath, {
        archiveLimits: resolveLocalDirectoryLimits(options.archiveLimits),
      }),
      reference: `file:${toPosixPath(targetPath)}`,
    },
  ]
}
