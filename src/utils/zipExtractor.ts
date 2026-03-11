/**
 * ZIP 压缩包解压与日志提取工具
 * 从 ZIP 文件中提取 maa.log / maa.bak.log 及 on_error 截图
 *
 * 使用 fflate 的 filter 选项，只解压需要的文件，避免大 ZIP 全量解压导致内存暴涨。
 */

import { unzipSync } from 'fflate'
import { decodeFileContent } from './fileDialog'

/** 判断某个路径是否是我们需要解压的文件 */
function isNeededFile(path: string): boolean {
  const lower = path.replace(/\\/g, '/').toLowerCase()
  const name = lower.substring(lower.lastIndexOf('/') + 1)
  // 日志文件
  if (name === 'maa.log' || name === 'maa.bak.log') return true
  // on_error 截图
  if (lower.includes('/on_error/') && lower.endsWith('.png')) return true
  // vision 调试截图
  if (lower.includes('/vision/') && lower.endsWith('.jpg')) return true
  return false
}

/**
 * 从 ZIP 文件中提取日志内容和错误截图
 * @param file ZIP 文件
 * @returns 日志内容和截图映射，找不到日志则返回 null
 */
export async function extractZipContent(
  file: File,
): Promise<{ content: string; errorImages: Map<string, string>; visionImages: Map<string, string>; waitFreezesImages: Map<string, string> } | null> {
  const buffer = await file.arrayBuffer()
  const zipData = new Uint8Array(buffer)

  // 只解压日志和截图，跳过其他文件（如录屏、大型 bin 等）
  const files = unzipSync(zipData, {
    filter: (file) => isNeededFile(file.name),
  })

  const paths = Object.keys(files)

  // 找到 maa.log 所在的 base 目录
  const basePath = findBaseDirectory(paths)
  if (basePath === null) {
    return null
  }

  // 读取日志内容
  let content = ''

  // 先读 maa.bak.log
  const bakLogPath = joinPath(basePath, 'maa.bak.log')
  const bakLogData = findFile(files, paths, bakLogPath)
  if (bakLogData) {
    content += decodeFileContent(bakLogData)
  }

  // 再读 maa.log
  const mainLogPath = joinPath(basePath, 'maa.log')
  const mainLogData = findFile(files, paths, mainLogPath)
  if (mainLogData) {
    if (content && !content.endsWith('\n')) {
      content += '\n'
    }
    content += decodeFileContent(mainLogData)
  }

  if (!content) {
    return null
  }

  // 读取 on_error 截图
  const errorImages = extractErrorImages(files, paths, basePath)

  // 读取 vision 调试截图
  const visionImages = extractVisionImages(files, paths, basePath)

  // 读取 wait_freezes 调试截图
  const waitFreezesImages = extractWaitFreezesImages(files, paths, basePath)

  return { content, errorImages, visionImages, waitFreezesImages }
}

/**
 * 找到 maa.log 所在的 base 目录
 * 支持：根目录 maa.log、debug/maa.log、xxx/debug/maa.log
 */
function findBaseDirectory(paths: string[]): string | null {
  const normalizedPaths = paths.map((p) => p.replace(/\\/g, '/'))

  for (const p of normalizedPaths) {
    const lower = p.toLowerCase()
    if (lower.endsWith('/maa.log') || lower === 'maa.log') {
      const lastSlash = p.lastIndexOf('/')
      return lastSlash === -1 ? '' : p.substring(0, lastSlash)
    }
  }
  return null
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
 * 拼接路径
 */
function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name
}

/**
 * 提取 on_error 目录下的 PNG 截图
 */
function extractErrorImages(
  files: Record<string, Uint8Array>,
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
        const data = files[p]
        const url = URL.createObjectURL(
          new Blob([data.slice().buffer as ArrayBuffer], { type: 'image/png' }),
        )
        imageMap.set(key, url)
      }
    }
  }

  return imageMap
}

/**
 * 解析 vision 文件名为标准化 key
 * 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId.jpg
 * 返回: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId（毫秒补齐3位）
 * 没有 reco_id 的文件返回 null
 */
function parseVisionImageKey(fileName: string): string | null {
  // 匹配: 时间戳.毫秒_节点名_RecoId.jpg
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_\d{9,})\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

/**
 * 提取 vision 目录下的 JPG 调试截图
 * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId
 * 同一 key 有多张图时，取最后一张
 */
function extractVisionImages(
  files: Record<string, Uint8Array>,
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
        const data = files[p]
        const url = URL.createObjectURL(
          new Blob([data.slice().buffer as ArrayBuffer], { type: 'image/jpeg' }),
        )
        // 同一 key 覆盖（释放前一个 blob URL）
        const prev = imageMap.get(key)
        if (prev) URL.revokeObjectURL(prev)
        imageMap.set(key, url)
      }
    }
  }

  return imageMap
}

/**
 * 解析 wait_freezes 文件名为标准化 key
 * 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes.jpg
 * 返回: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes（毫秒补齐3位）
 */
function parseWaitFreezesKey(fileName: string): string | null {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_wait_freezes)\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

/**
 * 提取 vision 目录下的 wait_freezes JPG 调试截图
 * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes
 */
function extractWaitFreezesImages(
  files: Record<string, Uint8Array>,
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
        const data = files[p]
        const url = URL.createObjectURL(
          new Blob([data.slice().buffer as ArrayBuffer], { type: 'image/jpeg' }),
        )
        imageMap.set(key, url)
      }
    }
  }

  return imageMap
}
