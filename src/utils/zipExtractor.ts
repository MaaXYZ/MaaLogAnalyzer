/**
 * ZIP 压缩包解压与日志提取工具
 * 从 ZIP 文件中提取日志（maa / maafw）及 on_error 截图
 *
 * 使用 fflate 的 filter 选项，只解压需要的文件，避免大 ZIP 全量解压导致内存暴涨。
 */

import { unzip, unzipSync, type UnzipFileInfo, type Unzipped } from 'fflate'
import { decodeFileContent } from './textEncoding'
import {
  addArchiveDirectoryEntry,
  assertArchiveInputsWithinLimits,
  assertSelectedArchiveEntriesWithinLimits,
  EMPTY_ARCHIVE_DIRECTORY_BUDGET,
  resolveArchiveLimits,
  type ArchiveDirectoryBudget,
  type ArchiveEntryMetadata,
  type ArchiveLimits,
} from './archiveLimits'
import {
  createPrimaryLogSelectionOptions,
  isPrimaryLogFileName,
  type BytePrimaryLogFile,
  type PrimaryLogFile,
  type PrimaryLogSelectionOption,
  selectPrimaryLogGroup,
} from './logFileDiscovery'
import {
  extractErrorImages,
  extractVisionImages,
  extractWaitFreezesImages,
  isSearchTextFile,
  isNeededFile,
} from './archiveShared'
import type { ExtractedTextFile } from './archiveShared'
import { toExactArrayBuffer } from './logInputSource'

export type { ExtractedTextFile } from './archiveShared'

export interface ExtractZipContentOptions {
  includeAuxiliaryFiles?: boolean
  archiveLimits?: Partial<ArchiveLimits> | null
}

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

interface BufferedZipArchive {
  data: Uint8Array
  entries: ArchiveEntryMetadata[]
}

function inspectZipArchive(
  data: Uint8Array,
  currentBudget: Readonly<ArchiveDirectoryBudget>,
  limits: Readonly<ArchiveLimits> | null,
): BufferedZipArchive & { directoryBudget: ArchiveDirectoryBudget } {
  const entries: ArchiveEntryMetadata[] = []
  let directoryBudget = currentBudget
  unzipSync(data, {
    filter: (entry) => {
      const metadata = copyEntryMetadata(entry)
      directoryBudget = addArchiveDirectoryEntry(directoryBudget, metadata, limits)
      entries.push(metadata)
      return false
    },
  })
  return { data, entries, directoryBudget }
}

function copyEntryMetadata(entry: UnzipFileInfo): ArchiveEntryMetadata {
  return {
    name: entry.name,
    size: entry.size,
    originalSize: entry.originalSize,
    compression: entry.compression,
  }
}

function shouldExtractEntry(
  entryName: string,
  includeAuxiliaryFiles: boolean,
  selectedPaths: Set<string>,
): boolean {
  const fileName = entryName.replace(/\\/g, '/').split('/').pop() ?? ''
  if (isPrimaryLogFileName(fileName)) return selectedPaths.has(entryName)
  return includeAuxiliaryFiles && isNeededFile(entryName)
}

async function unzipNeededFiles(
  zipData: Uint8Array,
  includeAuxiliaryFiles: boolean,
  selectedPaths: Set<string>,
): Promise<Unzipped> {
  return new Promise<Unzipped>((resolve, reject) => {
    unzip(
      zipData,
      {
        filter: entry => shouldExtractEntry(entry.name, includeAuxiliaryFiles, selectedPaths),
      },
      (err, unzipped) => {
        if (err) reject(err)
        else resolve(unzipped)
      },
    )
  })
}

async function unzipSelectedPaths(
  zipData: Uint8Array,
  selectedPaths: ReadonlySet<string>,
): Promise<Unzipped> {
  return new Promise<Unzipped>((resolve, reject) => {
    unzip(
      zipData,
      { filter: entry => selectedPaths.has(entry.name) },
      (err, unzipped) => {
        if (err) reject(err)
        else resolve(unzipped)
      },
    )
  })
}

const createDeferredZipTextLoader = (
  archiveFiles: readonly File[],
  targetPaths: readonly string[],
) => {
  const selectedPaths = new Set(targetPaths)
  let loadedContents: Promise<Map<string, string>> | undefined

  const loadAll = async (): Promise<Map<string, string>> => {
    const contents = new Map<string, string>()
    for (const archiveFile of archiveFiles) {
      const archiveBytes = new Uint8Array(await archiveFile.arrayBuffer())
      const extracted = await unzipSelectedPaths(archiveBytes, selectedPaths)
      for (const [path, bytes] of Object.entries(extracted)) {
        contents.set(path.replace(/\\/g, '/').toLowerCase(), decodeFileContent(bytes))
      }
    }
    return contents
  }

  return async (path: string): Promise<string> => {
    loadedContents ??= loadAll()
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase()
    const content = (await loadedContents).get(normalizedPath)
    if (content == null) throw new Error(`压缩包中的文本文件已不可用: ${path}`)
    return content
  }
}

const createDeferredSearchTextFiles = (
  paths: readonly string[],
  basePath: string,
  loadContent: (path: string) => Promise<string>,
): ExtractedTextFile[] => {
  const basePrefix = basePath ? `${basePath.toLowerCase()}/` : ''
  return paths
    .filter((path) => {
      const normalized = path.replace(/\\/g, '/')
      const lower = normalized.toLowerCase()
      if (basePrefix && !lower.startsWith(basePrefix)) return false
      if (!isSearchTextFile(normalized)) return false
      const name = normalized.substring(normalized.lastIndexOf('/') + 1)
      return !isPrimaryLogFileName(name)
    })
    .map((path) => {
      const normalized = path.replace(/\\/g, '/')
      return {
        path: normalized,
        name: normalized.substring(normalized.lastIndexOf('/') + 1),
        loadContent: async () => await loadContent(path),
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Extract logs and debug assets from one or more independent ZIP files.
 * MXU volumes are complete ZIP files, so entries must be merged before log discovery.
 */
export async function extractZipContents(
  archiveFiles: readonly File[],
  selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
  options: ExtractZipContentOptions = {},
): Promise<{
  content: string
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: ExtractedTextFile[]
  primaryLogFiles: PrimaryLogFile[]
} | null> {
  const includeAuxiliaryFiles = options.includeAuxiliaryFiles !== false
  const limits = options.archiveLimits == null
    ? null
    : resolveArchiveLimits(options.archiveLimits)

  // Explicit callers can still opt into resource budgets; normal user loads
  // skip them and proceed directly to reading the selected archives.
  if (limits) assertArchiveInputsWithinLimits(archiveFiles, limits)

  const archives: BufferedZipArchive[] = []
  const actualArchiveInputs: Array<{ size: number }> | null = limits ? [] : null
  let directoryBudget = EMPTY_ARCHIVE_DIRECTORY_BUDGET
  for (const file of archiveFiles) {
    const data = new Uint8Array(await file.arrayBuffer())
    if (actualArchiveInputs && limits) {
      actualArchiveInputs.push({ size: data.byteLength })
      assertArchiveInputsWithinLimits(actualArchiveInputs, limits)
    }

    const inspected = inspectZipArchive(data, directoryBudget, limits)
    directoryBudget = inspected.directoryBudget
    archives.push({ data: inspected.data, entries: inspected.entries })
  }

  const archivePaths = Array.from(new Set(archives.flatMap(
    archive => archive.entries.map(entry => entry.name),
  )))

  const selectedLogs = selectPrimaryLogGroup(archivePaths.map((path) => ({
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

  // Apply selected-entry budgets only when an explicit caller supplied them.
  const selectedEntries = archives.flatMap(archive => archive.entries.filter(
    entry => shouldExtractEntry(entry.name, includeAuxiliaryFiles, selectedPaths),
  ))
  if (limits) assertSelectedArchiveEntriesWithinLimits(selectedEntries, limits)

  const files = Object.create(null) as Unzipped
  for (const archive of archives) {
    const unzipped = await unzipNeededFiles(archive.data, includeAuxiliaryFiles, selectedPaths)
    for (const [path, data] of Object.entries(unzipped)) {
      files[path] = data
    }
  }

  const fileMap = toMap(files)
  const paths = Object.keys(files)

  const basePath = selectedLogs[0].candidate.dirPath
  const searchablePaths = paths.filter(path => isSearchTextFile(path))
  const loadDeferredText = createDeferredZipTextLoader(archiveFiles, searchablePaths)
  const selectedOrder = new Map(selectedOptions.map((option, index) => [option.path, index]))
  const selectedPrimaryLogs = selectedLogs
    .filter(({ item }) => selectedPaths.has(item.path))
    .sort((a, b) => (selectedOrder.get(a.item.path) ?? 0) - (selectedOrder.get(b.item.path) ?? 0))
  const primaryLogFiles: BytePrimaryLogFile[] = []
  for (const { item } of selectedPrimaryLogs) {
    const data = findFile(files, paths, item.path)
    if (data) {
      primaryLogFiles.push({
        path: item.path,
        name: item.name,
        bytes: new Uint8Array(toExactArrayBuffer(data)),
        loadContent: async () => await loadDeferredText(item.path),
      })
    }
  }

  if (primaryLogFiles.length === 0) {
    return null
  }

  const errorImages = includeAuxiliaryFiles ? extractErrorImages(fileMap, paths, basePath) : new Map<string, string>()
  const visionImages = includeAuxiliaryFiles ? extractVisionImages(fileMap, paths, basePath) : new Map<string, string>()
  const waitFreezesImages = includeAuxiliaryFiles ? extractWaitFreezesImages(fileMap, paths, basePath) : new Map<string, string>()
  const textFiles = includeAuxiliaryFiles
    ? createDeferredSearchTextFiles(paths, basePath, loadDeferredText)
    : []

  return { content: '', errorImages, visionImages, waitFreezesImages, textFiles, primaryLogFiles }
}

/**
 * Extract logs and debug assets from a single ZIP file.
 */
export async function extractZipContent(
  file: File,
  selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
  options: ExtractZipContentOptions = {},
) {
  return extractZipContents([file], selectPrimaryLogs, options)
}
