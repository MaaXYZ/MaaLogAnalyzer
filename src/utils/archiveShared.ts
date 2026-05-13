import { isPrimaryLogFileName } from './logFileDiscovery'

export interface ExtractedTextFile {
  path: string
  name: string
  content: string
}

const SEARCH_TEXT_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

export const isSearchTextFile = (normalizedPath: string) => {
  const lower = normalizedPath.toLowerCase()
  return SEARCH_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function isNeededFile(path: string): boolean {
  const lower = path.replace(/\\/g, '/').toLowerCase()
  const name = lower.substring(lower.lastIndexOf('/') + 1)
  if (isSearchTextFile(lower)) return true
  if (isPrimaryLogFileName(name)) return true
  if ((lower.includes('/on_error/') || lower.startsWith('on_error/')) && lower.endsWith('.png')) return true
  if ((lower.includes('/vision/') || lower.startsWith('vision/')) && lower.endsWith('.jpg')) return true
  return false
}

export function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name
}

export function parseVisionImageKey(fileName: string): string | null {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_\d{9,})\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

export function parseWaitFreezesKey(fileName: string): string | null {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_wait_freezes)\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

export function extractErrorImages(
  files: Map<string, Uint8Array>,
  paths: string[],
  basePath: string,
): Map<string, string> {
  const imageMap = new Map<string, string>()
  const onErrorPrefix = joinPath(basePath, 'on_error/').toLowerCase()

  for (const p of paths) {
    const normalized = p.replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    if (lower.startsWith(onErrorPrefix) && lower.endsWith('.png')) {
      const fileName = normalized.substring(normalized.lastIndexOf('/') + 1)
      const match = fileName.match(
        /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/,
      )
      if (match) {
        const [, timestamp, ms, nodeName] = match
        const paddedMs = ms.padEnd(3, '0')
        const key = `${timestamp}.${paddedMs}_${nodeName}`
        const data = files.get(p)
        if (data) {
          const url = URL.createObjectURL(
            new Blob([data.slice().buffer as ArrayBuffer], { type: 'image/png' }),
          )
          imageMap.set(key, url)
        }
      }
    }
  }

  return imageMap
}

export function extractVisionImages(
  files: Map<string, Uint8Array>,
  paths: string[],
  basePath: string,
): Map<string, string> {
  const imageMap = new Map<string, string>()
  const visionPrefix = joinPath(basePath, 'vision/').toLowerCase()

  for (const p of paths) {
    const normalized = p.replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    if (lower.startsWith(visionPrefix) && lower.endsWith('.jpg')) {
      const fileName = normalized.substring(normalized.lastIndexOf('/') + 1)
      const key = parseVisionImageKey(fileName)
      if (key != null) {
        const data = files.get(p)
        if (data) {
          const url = URL.createObjectURL(
            new Blob([data.slice().buffer as ArrayBuffer], { type: 'image/jpeg' }),
          )
          const prev = imageMap.get(key)
          if (prev) URL.revokeObjectURL(prev)
          imageMap.set(key, url)
        }
      }
    }
  }

  return imageMap
}

export function extractWaitFreezesImages(
  files: Map<string, Uint8Array>,
  paths: string[],
  basePath: string,
): Map<string, string> {
  const imageMap = new Map<string, string>()
  const visionPrefix = joinPath(basePath, 'vision/').toLowerCase()

  for (const p of paths) {
    const normalized = p.replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    if (lower.startsWith(visionPrefix) && lower.endsWith('.jpg')) {
      const fileName = normalized.substring(normalized.lastIndexOf('/') + 1)
      const key = parseWaitFreezesKey(fileName)
      if (key != null) {
        const data = files.get(p)
        if (data) {
          const url = URL.createObjectURL(
            new Blob([data.slice().buffer as ArrayBuffer], { type: 'image/jpeg' }),
          )
          imageMap.set(key, url)
        }
      }
    }
  }

  return imageMap
}

export function extractSearchTextFiles(
  files: Map<string, Uint8Array>,
  paths: string[],
  basePath: string,
  decodeContent: (data: Uint8Array) => string,
): ExtractedTextFile[] {
  const textFiles: ExtractedTextFile[] = []
  const basePrefix = basePath ? `${basePath.toLowerCase()}/` : ''
  for (const p of paths) {
    const normalized = p.replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    if (basePrefix && !lower.startsWith(basePrefix)) continue
    if (!isSearchTextFile(normalized)) continue
    const data = files.get(p)
    if (!data) continue
    textFiles.push({
      path: normalized,
      name: normalized.substring(normalized.lastIndexOf('/') + 1),
      content: decodeContent(data),
    })
  }
  textFiles.sort((a, b) => a.path.localeCompare(b.path))
  return textFiles
}
