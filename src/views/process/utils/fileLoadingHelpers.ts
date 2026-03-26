const TEXT_SEARCH_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

export interface LoadedTextFile {
  path: string
  name: string
  content: string
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

const getFileFromEntry = (fileEntry: FileSystemFileEntry): Promise<File> => {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject)
  })
}

export const readDirectoryFiles = (dirEntry: FileSystemDirectoryEntry): Promise<File[]> => {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader()
    const files: File[] = []

    const readEntries = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(files)
          return
        }

        for (const entry of entries) {
          if (entry.isFile) {
            const file = await getFileFromEntry(entry as FileSystemFileEntry)
            files.push(file)
          }
        }

        readEntries()
      }, reject)
    }

    readEntries()
  })
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
