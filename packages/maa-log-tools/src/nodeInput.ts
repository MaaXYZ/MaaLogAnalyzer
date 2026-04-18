import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'

const MAIN_LOG_NAMES = ['maa.log', 'maafw.log'] as const
const BAK_LOG_NAMES = ['maa.bak.log', 'maafw.bak.log'] as const
const SEARCH_TEXT_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

const MAIN_LOG_NAME_SET = new Set<string>(MAIN_LOG_NAMES.map((name) => name.toLowerCase()))
const HISTORY_LOG_NAME_PATTERNS = [
  /^maa\.bak(?:\..+)?\.log$/i,
  /^maafw\.bak(?:\..+)?\.log$/i,
]

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
}

export interface LogBundleFocus {
  keywords?: string[]
  started_after?: string
  started_before?: string
}

export interface ExtractZipContentOptions {
  focus?: LogBundleFocus
}

export interface LoadNodeLogDirectoryOptions {
  focus?: LogBundleFocus
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
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/,
  )
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
  if ((lower.includes('/on_error/') || lower.startsWith('on_error/')) && lower.endsWith('.png')) return true
  if ((lower.includes('/vision/') || lower.startsWith('vision/')) && lower.endsWith('.jpg')) return true
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
  return normalized === `${directory}${extension}`
    || normalized.startsWith(`${directory}/`)
    || normalized.includes(`/${directory}/`)
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

const contentMatchesFocus = (
  content: string,
  focus: LogBundleFocus,
): boolean => {
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

const joinMergedContent = (chunks: string[]): string => {
  return chunks.reduce((result, chunk) => {
    if (chunk.length === 0) return result
    if (result.length === 0) return chunk
    return result.endsWith('\n') ? `${result}${chunk}` : `${result}\n${chunk}`
  }, '')
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

const collectFocusedFileContents = async (
  logPaths: string[],
  focus: LogBundleFocus,
): Promise<string> => {
  const chunks: string[] = []
  for (const logPath of sortLogPaths(logPaths)) {
    const content = await readNodeTextFileContent(logPath)
    if (!contentMatchesFocus(content, focus)) continue
    chunks.push(content)
  }
  return joinMergedContent(chunks)
}

const collectFocusedZipContents = (
  entries: Record<string, Uint8Array>,
  paths: string[],
  basePath: string,
  focus: LogBundleFocus,
): string => {
  const normalizedBasePath = normalizeLowerPath(basePath)
  const candidatePaths = sortLogPaths(paths.filter((entryPath) => {
    const normalizedPath = toPosixPath(entryPath)
    const lastSlash = normalizedPath.lastIndexOf('/')
    const parentPath = lastSlash === -1 ? '' : normalizedPath.slice(0, lastSlash)
    if (normalizeLowerPath(parentPath) !== normalizedBasePath) {
      return false
    }
    const fileName = normalizedPath.slice(lastSlash + 1)
    return isCoreLogName(fileName)
  }))

  const chunks: string[] = []
  for (const entryPath of candidatePaths) {
    const bytes = entries[entryPath]
    if (!bytes) continue
    const content = decodeNodeBytes(bytes)
    if (!contentMatchesFocus(content, focus)) continue
    chunks.push(content)
  }
  return joinMergedContent(chunks)
}

const buildDefaultZipContent = (
  entries: Record<string, Uint8Array>,
  paths: string[],
  basePath: string,
): string => {
  const bakLogName = BAK_LOG_NAMES.find((name) => findZipEntry(entries, paths, joinPath(basePath, name)))
  const mainLogName = MAIN_LOG_NAMES.find((name) => findZipEntry(entries, paths, joinPath(basePath, name)))

  const bakData = bakLogName ? findZipEntry(entries, paths, joinPath(basePath, bakLogName)) : null
  const mainData = mainLogName ? findZipEntry(entries, paths, joinPath(basePath, mainLogName)) : null

  const chunks: string[] = []
  if (bakData) {
    chunks.push(decodeNodeBytes(bakData))
  }
  if (mainData) {
    chunks.push(decodeNodeBytes(mainData))
  }
  return joinMergedContent(chunks)
}

export const readNodeTextFileContent = async (filePath: string): Promise<string> => {
  const bytes = await readFile(filePath)
  return decodeNodeBytes(new Uint8Array(bytes))
}

export const extractZipContentFromNodeBuffer = (
  zipData: Uint8Array,
  sourceRef: string = 'memory.zip',
  options: ExtractZipContentOptions = {},
): NodeExtractedLogContent | null => {
  const files = unzipSync(zipData, {
    filter: (entry) => isNeededZipEntry(entry.name),
  })
  const paths = Object.keys(files)
  const basePath = findBaseDirectory(paths)
  if (basePath == null) return null

  const content = options.focus
    ? collectFocusedZipContents(files, paths, basePath, options.focus)
    : buildDefaultZipContent(files, paths, basePath)
  if (!content) return null

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
  return { content, errorImages, visionImages, waitFreezesImages, textFiles }
}

export const extractZipContentFromNodeFile = async (
  zipFilePath: string,
  options: ExtractZipContentOptions = {},
): Promise<NodeExtractedLogContent | null> => {
  const bytes = await readFile(zipFilePath)
  return extractZipContentFromNodeBuffer(new Uint8Array(bytes), zipFilePath, options)
}

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

const hasMainLogInDirectory = async (dirPath: string): Promise<boolean> => {
  for (const name of MAIN_LOG_NAMES) {
    if (await pathExists(path.join(dirPath, name))) {
      return true
    }
  }
  return false
}

const findDebugDirectoryRecursively = async (rootPath: string): Promise<string | null> => {
  const entries = await readdir(rootPath, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const subDirPath = path.join(rootPath, entry.name)
    if (await hasMainLogInDirectory(subDirPath)) {
      return subDirPath
    }
    const nested = await findDebugDirectoryRecursively(subDirPath)
    if (nested) return nested
  }
  return null
}

const resolveDebugDirectory = async (inputPath: string): Promise<string | null> => {
  if (await hasMainLogInDirectory(inputPath)) {
    return inputPath
  }

  const directDebugPath = path.join(inputPath, 'debug')
  if (await hasMainLogInDirectory(directDebugPath)) {
    return directDebugPath
  }

  return findDebugDirectoryRecursively(inputPath)
}

const collectFilesRecursively = async (rootPath: string): Promise<string[]> => {
  const collected: string[] = []
  const entries = await readdir(rootPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      const nested = await collectFilesRecursively(fullPath)
      collected.push(...nested)
      continue
    }
    collected.push(fullPath)
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
    if (await pathExists(directPath)) {
      return directPath
    }
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
): Promise<string> => {
  const bakLogPath = await pickPrimaryLogPath(debugPath, allFiles, BAK_LOG_NAMES)
  const mainLogPath = await pickPrimaryLogPath(debugPath, allFiles, MAIN_LOG_NAMES)

  const chunks: string[] = []
  if (bakLogPath) {
    chunks.push(await readNodeTextFileContent(bakLogPath))
  }
  if (mainLogPath) {
    chunks.push(await readNodeTextFileContent(mainLogPath))
  }
  return joinMergedContent(chunks)
}

export const loadNodeLogDirectory = async (
  inputDirectoryPath: string,
  options: LoadNodeLogDirectoryOptions = {},
): Promise<NodeExtractedLogContent | null> => {
  const debugPath = await resolveDebugDirectory(inputDirectoryPath)
  if (!debugPath) return null

  const allFiles = await collectFilesRecursively(debugPath)
  const content = options.focus
    ? await collectFocusedFileContents(allFiles.filter((filePath) => isCoreLogName(path.basename(filePath))), options.focus)
    : await buildDefaultDirectoryContent(debugPath, allFiles)
  if (!content) return null

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
      content: await readNodeTextFileContent(absolutePath),
      reference: toFileReference(absolutePath),
    })
  }

  textFiles.sort((a, b) => a.path.localeCompare(b.path))

  return {
    content,
    errorImages,
    visionImages,
    waitFreezesImages,
    textFiles,
  }
}
