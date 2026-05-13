/**
 * ZIP 压缩包解压与日志提取工具
 * 从 ZIP 文件中提取日志（maa / maafw）及 on_error 截图
 *
 * 使用 fflate 的 filter 选项，只解压需要的文件，避免大 ZIP 全量解压导致内存暴涨。
 */

import { unzip, type Unzipped } from 'fflate'
import { decodeFileContent } from './fileDialog'
import {
  createPrimaryLogSelectionOptions,
  type LoadedPrimaryLogFile,
  type PrimaryLogSelectionOption,
  selectPrimaryLogGroup,
  sortLoadedPrimaryLogSegments,
} from './logFileDiscovery'
import {
  extractErrorImages,
  extractVisionImages,
  extractWaitFreezesImages,
  extractSearchTextFiles,
  isNeededFile,
} from './archiveShared'
import type { ExtractedTextFile } from './archiveShared'

export type { ExtractedTextFile } from './archiveShared'

function toMap(record: Record<string, Uint8Array>): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>()
  for (const key of Object.keys(record)) {
    map.set(key, record[key])
  }
  return map
}

/**
 * 在 files 中查找指定路径的文件（不区分路径分隔符）
 */
function findFile(
  files: Record<string, Uint8Array>,
  paths: string[],
  target: string,
): Uint8Array | null {
  const normalizedTarget = target.replace(/\\/g, '/').toLowerCase()
  for (const p of paths) {
    if (p.replace(/\\/g, '/').toLowerCase() === normalizedTarget) {
      return files[p]
    }
  }
  return null
}

/**
 * 从 ZIP 文件中提取日志内容和错误截图
 */
export async function extractZipContent(
  file: File,
  selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
): Promise<{
  content: string
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: ExtractedTextFile[]
  primaryLogFiles: LoadedPrimaryLogFile[]
} | null> {
  const buffer = await file.arrayBuffer()
  const zipData = new Uint8Array(buffer)

  const files = await new Promise<Unzipped>((resolve, reject) => {
    unzip(
      zipData,
      { filter: (f) => isNeededFile(f.name) },
      (err, unzipped) => {
        if (err) reject(err)
        else resolve(unzipped)
      }
    )
  })

  const fileMap = toMap(files)
  const paths = Object.keys(files)

  const selectedLogs = selectPrimaryLogGroup(paths.map((path) => ({
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
      const data = findFile(files, paths, item.path)
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

  const errorImages = extractErrorImages(fileMap, paths, basePath)
  const visionImages = extractVisionImages(fileMap, paths, basePath)
  const waitFreezesImages = extractWaitFreezesImages(fileMap, paths, basePath)
  const textFiles = extractSearchTextFiles(fileMap, paths, basePath, decodeFileContent)

  return { content: '', errorImages, visionImages, waitFreezesImages, textFiles, primaryLogFiles }
}
