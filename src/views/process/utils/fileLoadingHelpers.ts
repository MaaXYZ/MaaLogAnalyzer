import { replaceBlobUrl, revokeBlobUrlMap } from '../../../utils/blobUrlMap'
import {
  chargeBrowserInputFile,
  BROWSER_INPUT_MAX_DIRECTORY_DEPTH,
  createBrowserInputBudget,
  InputResourceLimitError,
  registerBrowserInputFile,
} from '../../../utils/browserInputBudget'
import { isPrimaryLogFileName } from '../../../utils/logFileDiscovery'
import type { TextFileSource } from '../../../utils/textFileSource'
import { decodeFileContent } from '../../../utils/textEncoding'

export { isBakLogFileName, isMainLogFileName } from '../../../utils/logFileDiscovery'

const TEXT_SEARCH_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

export type LoadedTextFile = TextFileSource

interface CollectedDebugAssets {
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
}

const isSearchTextFileName = (name: string) => {
  const lower = name.toLowerCase()
  return TEXT_SEARCH_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

const normalizeLoadedPath = (rawPath: string) => {
  const normalized = rawPath.replace(/\\/g, '/')
  const lower = normalized.toLowerCase()
  if (lower.startsWith('debug/')) return normalized
  const debugIdx = lower.indexOf('/debug/')
  if (debugIdx >= 0) {
    return normalized.slice(debugIdx + 1)
  }
  const parts = normalized.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join('/') : normalized
}

export const collectTextFilesFromFiles = async (
  files: Iterable<File>,
  budget = createBrowserInputBudget(null),
): Promise<LoadedTextFile[]> => {
  const result: LoadedTextFile[] = []
  const seen = new Set<string>()
  for (const file of files) {
    if (!isSearchTextFileName(file.name)) continue
    if (isPrimaryLogFileName(file.name)) continue
    const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const path = normalizeLoadedPath(rawPath)
    if (seen.has(path)) continue
    seen.add(path)
    registerBrowserInputFile(budget, file, rawPath)
    chargeBrowserInputFile(budget, file)
    result.push({
      path,
      name: file.name,
      loadContent: async () => decodeFileContent(new Uint8Array(await file.arrayBuffer())),
    })
  }
  return result
}

const parseErrorImageKey = (fileName: string): string | null => {
  const match = fileName.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/i)
  if (!match) return null
  const [, timestamp, ms, nodeName] = match
  return `${timestamp}.${ms.padEnd(3, '0')}_${nodeName}`
}

const parseVisionImageKey = (fileName: string): string | null => {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_\d{9,})\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  return `${timestamp}.${ms.padEnd(3, '0')}_${rest}`
}

const parseWaitFreezesKey = (fileName: string): string | null => {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_wait_freezes)\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  return `${timestamp}.${ms.padEnd(3, '0')}_${rest}`
}

export const collectDebugAssetsFromFiles = async (
  files: Iterable<File>,
  budget = createBrowserInputBudget(null),
): Promise<CollectedDebugAssets> => {
  const errorImages = new Map<string, string>()
  const visionImages = new Map<string, string>()
  const waitFreezesImages = new Map<string, string>()
  const selectedImages: Array<{
    file: File
    key: string
    target: Map<string, string>
  }> = []

  for (const file of files) {
    const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const normalizedPath = rawPath.replace(/\\/g, '/')
    const lower = normalizedPath.toLowerCase()

    if ((lower.includes('/on_error/') || lower.startsWith('on_error/')) && lower.endsWith('.png')) {
      const key = parseErrorImageKey(file.name)
      if (key) {
        registerBrowserInputFile(budget, file, rawPath)
        chargeBrowserInputFile(budget, file, { image: true })
        selectedImages.push({ file, key, target: errorImages })
      }
      continue
    }

    if ((lower.includes('/vision/') || lower.startsWith('vision/')) && lower.endsWith('.jpg')) {
      const waitFreezesKey = parseWaitFreezesKey(file.name)
      if (waitFreezesKey) {
        registerBrowserInputFile(budget, file, rawPath)
        chargeBrowserInputFile(budget, file, { image: true })
        selectedImages.push({ file, key: waitFreezesKey, target: waitFreezesImages })
        continue
      }

      const visionKey = parseVisionImageKey(file.name)
      if (visionKey) {
        registerBrowserInputFile(budget, file, rawPath)
        chargeBrowserInputFile(budget, file, { image: true })
        selectedImages.push({ file, key: visionKey, target: visionImages })
      }
    }
  }

  try {
    for (const image of selectedImages) {
      replaceBlobUrl(image.target, image.key, image.file)
    }
  } catch (error) {
    revokeBlobUrlMap(errorImages)
    revokeBlobUrlMap(visionImages)
    revokeBlobUrlMap(waitFreezesImages)
    throw error
  }

  return {
    errorImages,
    visionImages,
    waitFreezesImages,
  }
}

const getFileFromEntry = (fileEntry: FileSystemFileEntry, relativePath: string): Promise<File> => {
  return new Promise((resolve, reject) => {
    fileEntry.file((file) => {
      try {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relativePath,
          configurable: true,
        })
      } catch {
        // ignore if browser prevents redefining
      }
      resolve(file)
    }, reject)
  })
}

const readDirectoryEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = []

    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries)
          return
        }
        for (const entry of batch) {
          entries.push(entry)
        }
        readBatch()
      }, reject)
    }

    readBatch()
  })
}

export const readDirectoryFiles = async (
  dirEntry: FileSystemDirectoryEntry,
  relativePrefix = '',
  depth = 0,
): Promise<File[]> => {
  if (depth > BROWSER_INPUT_MAX_DIRECTORY_DEPTH) {
    throw new InputResourceLimitError(`目录嵌套层级超过限制 (${BROWSER_INPUT_MAX_DIRECTORY_DEPTH})`)
  }
  const reader = dirEntry.createReader()
  const entries = await readDirectoryEntries(reader)
  const files: File[] = []

  for (const entry of entries) {
    if (entry.isFile) {
      const file = await getFileFromEntry(
        entry as FileSystemFileEntry,
        `${relativePrefix}${entry.name}`,
      )
      files.push(file)
      continue
    }

    if (entry.isDirectory) {
      const nestedFiles = await readDirectoryFiles(
        entry as FileSystemDirectoryEntry,
        `${relativePrefix}${entry.name}/`,
        depth + 1,
      )
      files.push(...nestedFiles)
    }
  }

  return files
}
