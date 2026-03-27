const TEXT_SEARCH_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

export interface LoadedTextFile {
  path: string
  name: string
  content: string
}

interface CollectedDebugAssets {
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
}

export const isMainLogFileName = (name: string) => name === 'maa.log' || name === 'maafw.log'
export const isBakLogFileName = (name: string) => name === 'maa.bak.log' || name === 'maafw.bak.log'

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

export const collectTextFilesFromFiles = async (files: Iterable<File>): Promise<LoadedTextFile[]> => {
  const result: LoadedTextFile[] = []
  const seen = new Set<string>()
  for (const file of files) {
    if (!isSearchTextFileName(file.name)) continue
    const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const path = normalizeLoadedPath(rawPath)
    if (seen.has(path)) continue
    seen.add(path)
    result.push({
      path,
      name: file.name,
      content: await file.text(),
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
  const match = fileName.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_\d{9,})\.jpg$/i)
  if (!match) return null
  const [, timestamp, ms, rest] = match
  return `${timestamp}.${ms.padEnd(3, '0')}_${rest}`
}

const parseWaitFreezesKey = (fileName: string): string | null => {
  const match = fileName.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_wait_freezes)\.jpg$/i)
  if (!match) return null
  const [, timestamp, ms, rest] = match
  return `${timestamp}.${ms.padEnd(3, '0')}_${rest}`
}

export const collectDebugAssetsFromFiles = async (files: Iterable<File>): Promise<CollectedDebugAssets> => {
  const errorImages = new Map<string, string>()
  const visionImages = new Map<string, string>()
  const waitFreezesImages = new Map<string, string>()

  for (const file of files) {
    const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const normalizedPath = rawPath.replace(/\\/g, '/')
    const lower = normalizedPath.toLowerCase()

    if ((lower.includes('/on_error/') || lower.startsWith('on_error/')) && lower.endsWith('.png')) {
      const key = parseErrorImageKey(file.name)
      if (key) errorImages.set(key, URL.createObjectURL(file))
      continue
    }

    if ((lower.includes('/vision/') || lower.startsWith('vision/')) && lower.endsWith('.jpg')) {
      const waitFreezesKey = parseWaitFreezesKey(file.name)
      if (waitFreezesKey) {
        const previous = waitFreezesImages.get(waitFreezesKey)
        if (previous) URL.revokeObjectURL(previous)
        waitFreezesImages.set(waitFreezesKey, URL.createObjectURL(file))
        continue
      }

      const visionKey = parseVisionImageKey(file.name)
      if (visionKey) {
        const previous = visionImages.get(visionKey)
        if (previous) URL.revokeObjectURL(previous)
        visionImages.set(visionKey, URL.createObjectURL(file))
      }
    }
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
        entries.push(...batch)
        readBatch()
      }, reject)
    }

    readBatch()
  })
}

export const readDirectoryFiles = async (
  dirEntry: FileSystemDirectoryEntry,
  relativePrefix = '',
): Promise<File[]> => {
  const reader = dirEntry.createReader()
  const entries = await readDirectoryEntries(reader)
  const files: File[] = []

  for (const entry of entries) {
    if (entry.isFile) {
      files.push(await getFileFromEntry(
        entry as FileSystemFileEntry,
        `${relativePrefix}${entry.name}`,
      ))
      continue
    }

    if (entry.isDirectory) {
      const nestedFiles = await readDirectoryFiles(
        entry as FileSystemDirectoryEntry,
        `${relativePrefix}${entry.name}/`,
      )
      files.push(...nestedFiles)
    }
  }

  return files
}

interface Base64ImageEntry {
  key: string
  base64: string
}

export const decodeBase64ImageEntries = (
  entries: Base64ImageEntry[] | undefined,
  mimeType: string,
): Map<string, string> => {
  const images = new Map<string, string>()
  if (!entries || !Array.isArray(entries)) return images

  for (const { key, base64 } of entries) {
    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: mimeType })
    images.set(key, URL.createObjectURL(blob))
  }

  return images
}
