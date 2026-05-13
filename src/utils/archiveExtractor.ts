/**
 * 通用压缩包解压工具
 * 支持 ZIP、7z、RAR 格式的日志文件提取
 *
 * ZIP 使用 fflate（内联，无额外加载）
 * 7z/RAR 使用 7z-wasm（按需懒加载 WASM 模块）
 */

import type { PrimaryLogSelectionOption, LoadedPrimaryLogFile } from './logFileDiscovery'
import type { ExtractedTextFile } from './archiveShared'
import {
  isNeededFile,
  extractErrorImages,
  extractVisionImages,
  extractWaitFreezesImages,
  extractSearchTextFiles,
} from './archiveShared'

export interface ArchiveExtractResult {
  content: string
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: ExtractedTextFile[]
  primaryLogFiles: LoadedPrimaryLogFile[]
}

export type ArchiveFormat = 'zip' | '7z' | 'rar' | 'unknown'

export function getArchiveFormat(fileName: string): ArchiveFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.7z')) return '7z'
  if (lower.endsWith('.rar')) return 'rar'
  return 'unknown'
}

export function isSupportedArchive(fileName: string): boolean {
  return getArchiveFormat(fileName) !== 'unknown'
}

type SevenZipModule = Awaited<ReturnType<typeof import('7z-wasm')['default']>> | null
let sevenZipInstance: SevenZipModule = null
let sevenZipLoading: Promise<SevenZipModule> | null = null

export async function ensureSevenZipModule(): Promise<SevenZipModule> {
  if (sevenZipInstance) return sevenZipInstance
  if (sevenZipLoading) return sevenZipLoading

  sevenZipLoading = (async () => {
    try {
      const SevenZip = await import('7z-wasm')
      sevenZipInstance = await SevenZip.default()
      sevenZipLoading = null
      return sevenZipInstance
    } catch (error) {
      sevenZipLoading = null
      throw new Error(`加载 7z 解压模块失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  })()

  return sevenZipLoading
}

async function extractWithSevenZip(
  file: File,
  onProgress?: (message: string) => void,
): Promise<Map<string, Uint8Array>> {
  onProgress?.('正在加载解压模块...')
  const moduleResult = await ensureSevenZipModule()
  if (!moduleResult) throw new Error('7z 模块未加载')
  const sz = moduleResult

  const buffer = await file.arrayBuffer()
  const archiveData = new Uint8Array(buffer)

  const workDir = '/tmp/extract'
  try { sz.FS.mkdir(workDir) } catch { /* exists */ }

  const archivePath = `${workDir}/${file.name}`
  sz.FS.writeFile(archivePath, archiveData)

  onProgress?.('正在解压文件...')

  const outputDir = `${workDir}/out`
  try { sz.FS.mkdir(outputDir) } catch { /* exists */ }

  sz.callMain(['x', archivePath, `-o${outputDir}`, '-aoa', '-y'])

  const files = new Map<string, Uint8Array>()

  function readDirRecursive(dir: string, prefix: string) {
    let entries: string[]
    try {
      entries = sz.FS.readdir(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue
      const fullPath = `${dir}/${entry}`
      const relativePath = prefix ? `${prefix}/${entry}` : entry

      try {
        const stat = sz.FS.stat(fullPath)
        if (sz.FS.isDir(stat.mode)) {
          readDirRecursive(fullPath, relativePath)
        } else {
          const data = sz.FS.readFile(fullPath)
          files.set(relativePath, data)
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  readDirRecursive(outputDir, '')

  try {
    sz.FS.unlink(archivePath)
    function removeDirRecursive(dir: string) {
      const entries = sz.FS.readdir(dir)
      for (const entry of entries) {
        if (entry === '.' || entry === '..') continue
        const fullPath = `${dir}/${entry}`
        const stat = sz.FS.stat(fullPath)
        if (sz.FS.isDir(stat.mode)) {
          removeDirRecursive(fullPath)
        } else {
          sz.FS.unlink(fullPath)
        }
      }
      sz.FS.rmdir(dir)
    }
    removeDirRecursive(outputDir)
  } catch {
    // cleanup failure does not affect result
  }

  return files
}

export async function extractArchiveContent(
  file: File,
  selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
  onProgress?: (message: string) => void,
): Promise<ArchiveExtractResult | null> {
  const format = getArchiveFormat(file.name)

  switch (format) {
    case 'zip':
      const { extractZipContent } = await import('./zipExtractor')
      return extractZipContent(file, selectPrimaryLogs)

    case '7z':
    case 'rar':
      return extractSevenZipOrRar(file, selectPrimaryLogs, onProgress)

    default:
      throw new Error(`不支持的压缩包格式: ${file.name}`)
  }
}

async function extractSevenZipOrRar(
  file: File,
  selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
  onProgress?: (message: string) => void,
): Promise<ArchiveExtractResult | null> {
  const { decodeFileContent } = await import('./fileDialog')
  const {
    createPrimaryLogSelectionOptions,
    selectPrimaryLogGroup,
    sortLoadedPrimaryLogSegments,
  } = await import('./logFileDiscovery')

  const files = await extractWithSevenZip(file, onProgress)

  const neededFiles = new Map<string, Uint8Array>()
  for (const [path, data] of files) {
    if (isNeededFile(path)) {
      neededFiles.set(path, data)
    }
  }

  if (neededFiles.size === 0) {
    return null
  }

  const neededPaths = Array.from(neededFiles.keys())

  const selectedLogs = selectPrimaryLogGroup(neededPaths.map((path) => ({
    path,
    name: path.replace(/\\/g, '/').split('/').pop() || path,
  })))

  if (selectedLogs.length === 0) {
    return null
  }

  const selectedOptions = selectPrimaryLogs
    ? await selectPrimaryLogs(createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item)))
    : createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item))

  if (!selectedOptions || selectedOptions.length === 0) {
    return null
  }

  const selectedPaths = new Set(selectedOptions.map(option => option.path))

  const basePath = selectedLogs[0].candidate.dirPath
  const loadedLogs = selectedLogs
    .filter(({ item }) => selectedPaths.has(item.path))
    .map(({ item }) => {
      const data = neededFiles.get(item.path)
      if (!data) return null
      return {
        path: item.path,
        name: item.name,
        content: decodeFileContent(data),
      }
    })
    .filter((entry): entry is LoadedPrimaryLogFile => entry != null)

  const primaryLogFiles = sortLoadedPrimaryLogSegments(loadedLogs)

  if (primaryLogFiles.length === 0) {
    return null
  }

  const errorImages = extractErrorImages(neededFiles, neededPaths, basePath)
  const visionImages = extractVisionImages(neededFiles, neededPaths, basePath)
  const waitFreezesImages = extractWaitFreezesImages(neededFiles, neededPaths, basePath)
  const textFiles = extractSearchTextFiles(neededFiles, neededPaths, basePath, decodeFileContent)

  return {
    content: '',
    errorImages,
    visionImages,
    waitFreezesImages,
    textFiles,
    primaryLogFiles,
  }
}
