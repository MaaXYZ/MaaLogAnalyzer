/**
 * 通用压缩包解压工具
 * 支持 ZIP、7z、RAR 格式的日志文件提取
 *
 * ZIP 使用 fflate（内联，无额外加载）
 * 7z/RAR 使用 7z-wasm（按需懒加载 WASM 模块）
 */

import {
  createPrimaryLogSelectionOptions,
  isPrimaryLogFileName,
  selectPrimaryLogGroup,
  sortLoadedPrimaryLogSegments,
  type PrimaryLogSelectionOption,
  type LoadedPrimaryLogFile,
  type PrimaryLogFile,
} from './logFileDiscovery'
import { decodeFileContent } from './textEncoding'
import type { ExtractedTextFile } from './archiveShared'
import {
  isNeededFile,
  extractErrorImages,
  extractVisionImages,
  extractWaitFreezesImages,
  extractSearchTextFiles,
} from './archiveShared'
import type { ArchiveLimits } from './archiveLimits'
import { extractSevenZipEntries } from './sevenZipExtractor'

export { ensureSevenZipModule } from './sevenZipExtractor'

export interface ArchiveExtractResult {
  content: string
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: ExtractedTextFile[]
  primaryLogFiles: PrimaryLogFile[]
}

export interface ExtractArchiveOptions {
  archiveLimits?: Partial<ArchiveLimits> | null
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

export async function extractArchiveContent(
  file: File,
  selectPrimaryLogs?: (
    options: PrimaryLogSelectionOption[],
  ) => Promise<PrimaryLogSelectionOption[] | null>,
  onProgress?: (message: string) => void,
  options: ExtractArchiveOptions = {},
): Promise<ArchiveExtractResult | null> {
  return extractArchiveContents([file], selectPrimaryLogs, onProgress, options)
}

export async function extractArchiveContents(
  archiveFiles: readonly File[],
  selectPrimaryLogs?: (
    options: PrimaryLogSelectionOption[],
  ) => Promise<PrimaryLogSelectionOption[] | null>,
  onProgress?: (message: string) => void,
  options: ExtractArchiveOptions = {},
): Promise<ArchiveExtractResult | null> {
  const file = archiveFiles[0]
  if (!file) return null

  const format = getArchiveFormat(file.name)

  switch (format) {
    case 'zip': {
      const { extractZipContents } = await import('./zipExtractor')
      return extractZipContents(archiveFiles, selectPrimaryLogs, {
        archiveLimits: options.archiveLimits,
      })
    }

    case '7z':
    case 'rar':
      return extractSevenZipOrRar(file, selectPrimaryLogs, onProgress, options)

    default:
      throw new Error(`不支持的压缩包格式: ${file.name}`)
  }
}

async function extractSevenZipOrRar(
  file: File,
  selectPrimaryLogs?: (
    options: PrimaryLogSelectionOption[],
  ) => Promise<PrimaryLogSelectionOption[] | null>,
  onProgress?: (message: string) => void,
  options: ExtractArchiveOptions = {},
): Promise<ArchiveExtractResult | null> {
  let neededPaths: string[] = []
  let selectedLogs: ReturnType<typeof selectPrimaryLogGroup> = []
  let selectedPaths = new Set<string>()

  const neededFiles = await extractSevenZipEntries(
    file,
    async (entries) => {
      neededPaths = entries
        .filter((entry) => !entry.isDirectory && isNeededFile(entry.path))
        .map((entry) => entry.path)
      if (neededPaths.length === 0) return null

      selectedLogs = selectPrimaryLogGroup(
        neededPaths.map((path) => ({
          path,
          name: path.split('/').pop() || path,
        })),
      )
      if (selectedLogs.length === 0) return null

      const selectedOptions = selectPrimaryLogs
        ? await selectPrimaryLogs(
            createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item)),
          )
        : createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item))
      if (!selectedOptions || selectedOptions.length === 0) return null

      selectedPaths = new Set(selectedOptions.map((option) => option.path))
      return neededPaths.filter((path) => {
        const name = path.split('/').pop() || path
        return !isPrimaryLogFileName(name) || selectedPaths.has(path)
      })
    },
    {
      archiveLimits: options.archiveLimits,
      onProgress,
    },
  )

  if (!neededFiles) return null

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
