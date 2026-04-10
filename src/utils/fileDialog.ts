/**
 * Tauri 文件对话框工具
 * 提供统一的文件访问接口，同时支持 Tauri、VS Code 和 Web 环境
 */

import { isTauri, isVSCode } from './platform'
import { invoke } from '@tauri-apps/api/core'

export { isTauri, isVSCode }

const MAIN_LOG_CANDIDATES = ['maa.log', 'maafw.log'] as const
const BAK_LOG_CANDIDATES = ['maa.bak.log', 'maafw.bak.log'] as const
const TEXT_SEARCH_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const
const PRIMARY_LOG_NAME_SET = new Set<string>([...MAIN_LOG_CANDIDATES, ...BAK_LOG_CANDIDATES].map(name => name.toLowerCase()))

export interface LoadedTextFile {
  path: string
  name: string
  content: string
}

interface OpenFolderResult {
  content: string
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: LoadedTextFile[]
}

const isTextSearchFileName = (name: string) => {
  const lower = name.toLowerCase()
  return TEXT_SEARCH_EXTENSIONS.some(ext => lower.endsWith(ext))
}

const shouldSkipCollectedTextFile = (name: string) => PRIMARY_LOG_NAME_SET.has(name.toLowerCase())

const toPosixPath = (value: string) => value.replace(/\\/g, '/')

const normalizeLoadedPath = (rawPath: string, rootPath?: string) => {
  let normalized = toPosixPath(rawPath)
  if (rootPath) {
    const root = toPosixPath(rootPath).replace(/\/+$/, '')
    const rootLower = root.toLowerCase()
    const normalizedLower = normalized.toLowerCase()
    if (normalizedLower === rootLower) {
      normalized = ''
    } else if (normalizedLower.startsWith(rootLower + '/')) {
      normalized = normalized.slice(root.length + 1)
    }
  }
  const lower = normalized.toLowerCase()
  if (lower.startsWith('debug/')) return normalized
  const debugIdx = lower.indexOf('/debug/')
  if (debugIdx >= 0) {
    return normalized.slice(debugIdx + 1)
  }
  return normalized
}

/**
 * 解码文件内容，自动尝试多种编码
 * @param bytes 文件的原始字节数组
 * @returns 解码后的字符串
 */
export function decodeFileContent(bytes: Uint8Array): string {
  // 尝试的编码列表（按优先级）
  const encodings = ['utf-8', 'gbk', 'gb18030', 'gb2312']

  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true })
      const text = decoder.decode(bytes)
      // 检查是否有大量替换字符（�），如果有说明编码不对
      const replacementCount = (text.match(/�/g) || []).length
      if (replacementCount < text.length * 0.01) { // 替换字符少于1%
        return text
      }
    } catch (error) {
      // 解码失败，尝试下一个编码
      continue
    }
  }

  // 如果所有编码都失败，使用 UTF-8 并忽略错误
  const decoder = new TextDecoder('utf-8', { fatal: false })
  return decoder.decode(bytes)
}

/**
 * 打开日志文件对话框
 * @returns 文件内容字符串，失败返回 null
 */
export async function openLogFileDialog(): Promise<string | null> {
  if (isTauri()) {
    return await openLogFileWithTauri()
  } else {
    return await openLogFileWithWeb()
  }
}

/**
 * 使用 Tauri API 打开文件
 * 如果选择了 .zip 文件，使用 Rust 侧 extract_zip_log 命令解压
 */
async function openLogFileWithTauri(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')

    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Log Files',
        extensions: ['log', 'jsonl', 'txt', 'zip']
      }],
      directory: false,
      title: '选择日志文件'
    })

    if (selected && typeof selected === 'string') {
      if (selected.toLowerCase().endsWith('.zip')) {
        // ZIP 文件：使用 Rust 侧原生解压
        return await openZipFileWithTauri(selected)
      }
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const bytes = await readFile(selected)
      const content = decodeFileContent(bytes)
      return content
    }
  } catch (error) {
    alert('打开文件失败: ' + error)
  }
  return null
}

/**
 * Tauri ZIP 解压结果缓存（用于 openLogFileWithTauri 返回后，由 ProcessView 获取 errorImages）
 */
let _lastTauriZipErrorImages: Map<string, string> | null = null

/**
 * 获取上一次 Tauri ZIP 解压的 errorImages（调用后清空）
 */
export function consumeTauriZipErrorImages(): Map<string, string> | null {
  const images = _lastTauriZipErrorImages
  _lastTauriZipErrorImages = null
  return images
}

/**
 * 使用 Tauri Rust 命令解压 ZIP 文件
 */
async function openZipFileWithTauri(path: string): Promise<string | null> {
  const result = await invoke<{ content: string; error_images: Record<string, string> }>('extract_zip_log', { path })

  const errorImages = new Map<string, string>()
  for (const [key, value] of Object.entries(result.error_images ?? {})) {
    errorImages.set(key, value)
  }
  _lastTauriZipErrorImages = errorImages

  return result.content
}

/**
 * 使用 Web API 打开文件（降级方案）
 */
async function openLogFileWithWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.log,.txt'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        try {
          const content = await file.text()
          resolve(content)
        } catch (error) {
          alert('读取文件失败: ' + error)
          resolve(null)
        }
      } else {
        resolve(null)
      }
    }

    input.oncancel = () => {
      resolve(null)
    }

    input.click()
  })
}

/**
 * 保存文件（未来功能）
 */
export async function saveFile(content: string, filename: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')

      const filePath = await save({
        filters: [{
          name: 'Text Files',
          extensions: ['txt', 'csv', 'html']
        }],
        defaultPath: filename
      })

      if (filePath) {
        await writeTextFile(filePath, content)
        return true
      }
    } catch (error) {
      alert('保存失败: ' + error)
    }
  } else {
    // Web 环境使用下载
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return true
  }
  return false
}

/**
 * 获取应用信息
 */
export async function getAppInfo(): Promise<{ version: string; tauriVersion: string } | null> {
  if (isTauri()) {
    try {
      const { getVersion, getTauriVersion } = await import('@tauri-apps/api/app')
      const version = await getVersion()
      const tauriVersion = await getTauriVersion()
      return { version, tauriVersion }
    } catch (error) {
      // 忽略错误
    }
  }
  return null
}

/**
 * 递归查找debug文件夹
 */
async function findDebugFolder(basePath: string): Promise<string | null> {
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')

    // 检查当前路径下是否有debug文件夹
    const debugPath = `${basePath}\\debug`
    if (await exists(debugPath)) {
      return debugPath
    }

    // 递归查找子文件夹
    const entries = await readDir(basePath)
    for (const entry of entries) {
      if (entry.isDirectory) {
        const found = await findDebugFolder(`${basePath}\\${entry.name}`)
        if (found) return found
      }
    }
  } catch (error) {
    console.error('[查找debug] 错误:', error)
  }
  return null
}

/**
 * 读取on_error文件夹中的截图
 */
async function readErrorImages(debugPath: string): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')

    const onErrorPath = `${debugPath}\\on_error`
    console.log('[截图] 检查路径:', onErrorPath)

    if (!(await exists(onErrorPath))) {
      console.log('[截图] on_error 文件夹不存在')
      return imageMap
    }

    const entries = await readDir(onErrorPath)
    console.log('[截图] 找到文件数:', entries.length)

    for (const entry of entries) {
      if (!entry.isDirectory && entry.name.endsWith('.png')) {
        // 解析文件名: 2026.03.08-13.12.30.216_CCUpdate.png (毫秒可能是1-3位)
        const match = entry.name.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/)
        if (match) {
          const [, timestamp, ms, nodeName] = match
          // 将毫秒补齐为3位
          const paddedMs = ms.padEnd(3, '0')
          const key = `${timestamp}.${paddedMs}_${nodeName}`
          const fullPath = `${onErrorPath}\\${entry.name}`
          imageMap.set(key, fullPath)
          console.log('[截图] 添加映射:', key, '->', fullPath)
        } else {
          console.log('[截图] 文件名格式不匹配:', entry.name)
        }
      }
    }

    console.log('[截图] 总共加载截图数:', imageMap.size)
  } catch (error) {
    console.warn('[截图] 读取截图失败:', error)
  }
  return imageMap
}

/**
 * 解析 vision 文件名为标准化 key
 * 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId.jpg
 * 返回: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId（毫秒补齐3位）
 */
function parseVisionImageKey(fileName: string): string | null {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_\d{9,})\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

/**
 * 读取 vision 文件夹中的调试截图（Tauri）
 */
async function readVisionImages(debugPath: string): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')

    const visionPath = `${debugPath}\\vision`
    if (!(await exists(visionPath))) {
      return imageMap
    }

    const entries = await readDir(visionPath)
    for (const entry of entries) {
      if (!entry.isDirectory && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseVisionImageKey(entry.name)
        if (key != null) {
          const fullPath = `${visionPath}\\${entry.name}`
          // 同一 key 覆盖（取最后出现的文件）
          imageMap.set(key, fullPath)
        }
      }
    }
    console.log('[vision] 总共加载调试截图数:', imageMap.size)
  } catch (error) {
    console.warn('[vision] 读取调试截图失败:', error)
  }
  return imageMap
}


async function collectTextFilesTauri(rootPath: string): Promise<LoadedTextFile[]> {
  const result: LoadedTextFile[] = []
  const seen = new Set<string>()
  const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')

  const walk = async (dirPath: string) => {
    const entries = await readDir(dirPath)
    for (const entry of entries) {
      const fullPath = `${dirPath}\\${entry.name}`
      if (entry.isDirectory) {
        await walk(fullPath)
        continue
      }
      if (!isTextSearchFileName(entry.name)) continue
      if (shouldSkipCollectedTextFile(entry.name)) continue
      const path = normalizeLoadedPath(fullPath, rootPath) || entry.name
      if (seen.has(path)) continue
      seen.add(path)
      const content = await readTextFile(fullPath)
      result.push({ path, name: entry.name, content })
    }
  }

  await walk(rootPath)
  return result
}

async function collectTextFilesWeb(rootHandle: FileSystemDirectoryHandle): Promise<LoadedTextFile[]> {
  const result: LoadedTextFile[] = []
  const seen = new Set<string>()

  const walk = async (handle: FileSystemDirectoryHandle, prefix: string) => {
    for await (const entry of handle.values()) {
      const nextPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, nextPath)
        continue
      }
      if (!isTextSearchFileName(entry.name)) continue
      if (shouldSkipCollectedTextFile(entry.name)) continue
      const path = normalizeLoadedPath(nextPath) || entry.name
      if (seen.has(path)) continue
      seen.add(path)
      const file = await (entry as FileSystemFileHandle).getFile()
      const content = await file.text()
      result.push({ path, name: entry.name, content })
    }
  }

  await walk(rootHandle, '')
  return result
}

/**
 * 打开文件夹并读取日志
 */
export async function openFolderDialog(): Promise<OpenFolderResult | null> {
  if (isTauri()) {
    return await openFolderDialogTauri()
  } else {
    return await openFolderDialogWeb()
  }
}

/**
 * Tauri 版本：打开文件夹并读取日志
 */
async function openFolderDialogTauri(): Promise<OpenFolderResult | null> {

  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')

    console.log('[文件夹] 打开文件夹对话框')

    const selected = await open({
      multiple: false,
      directory: true,
      title: '选择日志文件夹'
    })

    if (!selected || typeof selected !== 'string') {
      console.log('[文件夹] 未选择文件夹')
      return null
    }

    console.log('[文件夹] 选择的路径:', selected)

    const hasAnyLogIn = async (dirPath: string) => {
      for (const name of [...BAK_LOG_CANDIDATES, ...MAIN_LOG_CANDIDATES]) {
        if (await exists(`${dirPath}\\${name}`)) return true
      }
      return false
    }

    let debugPath = selected

    if (!(await hasAnyLogIn(debugPath))) {
      debugPath = `${selected}\\debug`

      if (!(await exists(debugPath)) || !(await hasAnyLogIn(debugPath))) {
        console.log('[文件夹] debug文件夹不存在或不含日志，开始递归查找')
        const found = await findDebugFolder(selected)
        if (!found || !(await hasAnyLogIn(found))) {
          alert('未找到debug文件夹或日志文件（maa.log / maa.bak.log / maafw.log / maafw.bak.log）')
          return null
        }
        debugPath = found
        console.log('[文件夹] 找到debug文件夹:', debugPath)
      }
    }

    let content = ''

    console.log('[文件夹] 读取日志文件')

    for (const bakName of BAK_LOG_CANDIDATES) {
      const bakLogPath = `${debugPath}\\${bakName}`
      if (await exists(bakLogPath)) {
        console.log(`[文件夹] 读取 ${bakName}`)
        content += await readTextFile(bakLogPath)
      }
    }

    for (const mainName of MAIN_LOG_CANDIDATES) {
      const mainLogPath = `${debugPath}\\${mainName}`
      if (await exists(mainLogPath)) {
        console.log(`[文件夹] 读取 ${mainName}`)
        if (content && !content.endsWith('\n')) {
          content += '\n'
        }
        content += await readTextFile(mainLogPath)
      }
    }

    if (!content) {
      alert('未找到日志文件（maa.log / maa.bak.log / maafw.log / maafw.bak.log）')
      return null
    }

    console.log('[文件夹] 日志文件读取完成，大小:', content.length)

    const errorImages = await readErrorImages(debugPath)
    const visionImages = await readVisionImages(debugPath)
    const waitFreezesImages = await readWaitFreezesImages(debugPath)
    let textFiles: LoadedTextFile[] = []
    try {
      textFiles = await collectTextFilesTauri(debugPath)
    } catch (error) {
      console.warn('[文件夹] 收集文本文件失败(Tauri):', error)
    }

    return { content, errorImages, visionImages, waitFreezesImages, textFiles }
  } catch (error) {
    console.error('[文件夹] 打开失败:', error)
    alert('打开文件夹失败: ' + error)
    return null
  }
}
/**
 * 解析 wait_freezes 文件名为标准化 key
 * 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes.jpg
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
 * 读取 vision 文件夹中的 wait_freezes 调试截图（Tauri）
 */
async function readWaitFreezesImages(debugPath: string): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')

    const visionPath = `${debugPath}\\vision`
    if (!(await exists(visionPath))) {
      return imageMap
    }

    const entries = await readDir(visionPath)
    for (const entry of entries) {
      if (!entry.isDirectory && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseWaitFreezesKey(entry.name)
        if (key != null) {
          const fullPath = `${visionPath}\\${entry.name}`
          imageMap.set(key, fullPath)
        }
      }
    }
    console.log('[wait_freezes] 总共加载调试截图数:', imageMap.size)
  } catch (error) {
    console.warn('[wait_freezes] 读取调试截图失败:', error)
  }
  return imageMap
}

/**
 * Web 版本：递归查找 debug 文件夹
 */
async function findDebugFolderWeb(dirHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  try {
    // 检查当前目录下是否有 debug 文件夹
    try {
      const debugHandle = await dirHandle.getDirectoryHandle('debug')
      return debugHandle
    } catch {
      // debug 不存在，继续递归查找
    }

    // 递归查找子文件夹
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory') {
        const found = await findDebugFolderWeb(entry as FileSystemDirectoryHandle)
        if (found) return found
      }
    }
  } catch (error) {
    console.error('[查找debug] 错误:', error)
  }
  return null
}

/**
 * Web 版本：读取 on_error 文件夹中的截图
 */
async function readErrorImagesWeb(debugHandle: FileSystemDirectoryHandle): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const onErrorHandle = await debugHandle.getDirectoryHandle('on_error')
    console.log('[截图] 找到 on_error 文件夹')

    for await (const entry of onErrorHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.png')) {
        const match = entry.name.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/)
        if (match) {
          const [, timestamp, ms, nodeName] = match
          // 将毫秒补齐为3位
          const paddedMs = ms.padEnd(3, '0')
          const key = `${timestamp}.${paddedMs}_${nodeName}`
          const file = await (entry as FileSystemFileHandle).getFile()
          const url = URL.createObjectURL(file)
          imageMap.set(key, url)
          console.log('[截图] 添加映射:', key)
        }
      }
    }
    console.log('[截图] 总共加载截图数:', imageMap.size)
  } catch (error) {
    console.log('[截图] on_error 文件夹不存在')
  }
  return imageMap
}

/**
 * Web 版本：读取 vision 文件夹中的调试截图
 */
async function readVisionImagesWeb(debugHandle: FileSystemDirectoryHandle): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const visionHandle = await debugHandle.getDirectoryHandle('vision')
    console.log('[vision] 找到 vision 文件夹')

    for await (const entry of visionHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseVisionImageKey(entry.name)
        if (key != null) {
          const file = await (entry as FileSystemFileHandle).getFile()
          const url = URL.createObjectURL(file)
          // 同一 key 覆盖（释放前一个 blob URL）
          const prev = imageMap.get(key)
          if (prev) URL.revokeObjectURL(prev)
          imageMap.set(key, url)
        }
      }
    }
    console.log('[vision] 总共加载调试截图数:', imageMap.size)
  } catch (error) {
    console.log('[vision] vision 文件夹不存在')
  }
  return imageMap
}

/**
 * Web 版本：打开文件夹并读取日志
 */
async function openFolderDialogWeb(): Promise<OpenFolderResult | null> {
  try {
    if (!('showDirectoryPicker' in window)) {
      alert('您的浏览器不支持文件夹选择功能，请使用 Chrome/Edge 等现代浏览器')
      return null
    }

    console.log('[文件夹] 打开文件夹对话框 (Web)')
    const dirHandle = await (window as any).showDirectoryPicker()
    console.log('[文件夹] 选择的文件夹:', dirHandle.name)

    const hasAnyLogIn = async (handle: FileSystemDirectoryHandle) => {
      for (const name of [...BAK_LOG_CANDIDATES, ...MAIN_LOG_CANDIDATES]) {
        try {
          await handle.getFileHandle(name)
          return true
        } catch {
          // continue
        }
      }
      return false
    }

    let debugHandle = dirHandle

    if (!(await hasAnyLogIn(dirHandle))) {
      try {
        debugHandle = await dirHandle.getDirectoryHandle('debug')
        if (!(await hasAnyLogIn(debugHandle))) {
          throw new Error('debug 不含日志')
        }
        console.log('[文件夹] 找到 debug 子文件夹')
      } catch {
        console.log('[文件夹] debug子文件夹不存在或不含日志，开始递归查找')
        const found = await findDebugFolderWeb(dirHandle)
        if (!found || !(await hasAnyLogIn(found))) {
          alert('未找到debug文件夹或日志文件（maa.log / maa.bak.log / maafw.log / maafw.bak.log）')
          return null
        }
        debugHandle = found
        console.log('[文件夹] 递归找到debug文件夹')
      }
    } else {
      console.log('[文件夹] 当前文件夹就是 debug 文件夹')
    }

    let content = ''

    for (const bakName of BAK_LOG_CANDIDATES) {
      try {
        const bakLogHandle = await debugHandle.getFileHandle(bakName)
        const bakFile = await bakLogHandle.getFile()
        content += await bakFile.text()
        console.log(`[文件夹] 读取 ${bakName}`)
      } catch {}
    }

    for (const mainName of MAIN_LOG_CANDIDATES) {
      try {
        const mainLogHandle = await debugHandle.getFileHandle(mainName)
        const mainFile = await mainLogHandle.getFile()
        if (content && !content.endsWith('\n')) {
          content += '\n'
        }
        content += await mainFile.text()
        console.log(`[文件夹] 读取 ${mainName}`)
      } catch {}
    }

    if (!content) {
      alert('未找到日志文件（maa.log / maa.bak.log / maafw.log / maafw.bak.log）')
      return null
    }

    console.log('[文件夹] 日志文件读取完成，大小:', content.length)

    const errorImages = await readErrorImagesWeb(debugHandle)
    const visionImages = await readVisionImagesWeb(debugHandle)
    const waitFreezesImages = await readWaitFreezesImagesWeb(debugHandle)
    let textFiles: LoadedTextFile[] = []
    try {
      textFiles = await collectTextFilesWeb(debugHandle)
    } catch (error) {
      console.warn('[文件夹] 收集文本文件失败(Web):', error)
    }

    return { content, errorImages, visionImages, waitFreezesImages, textFiles }
  } catch (error) {
    console.error('[文件夹] 打开失败:', error)
    if ((error as Error).name === 'AbortError') {
      return null
    }
    alert('打开文件夹失败: ' + error)
    return null
  }
}
/**
 * Web 版本：读取 vision 文件夹中的 wait_freezes 调试截图
 */
async function readWaitFreezesImagesWeb(debugHandle: FileSystemDirectoryHandle): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const visionHandle = await debugHandle.getDirectoryHandle('vision')

    for await (const entry of visionHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseWaitFreezesKey(entry.name)
        if (key != null) {
          const file = await (entry as FileSystemFileHandle).getFile()
          const url = URL.createObjectURL(file)
          imageMap.set(key, url)
        }
      }
    }
    console.log('[wait_freezes] 总共加载调试截图数:', imageMap.size)
  } catch (error) {
    console.log('[wait_freezes] vision 文件夹不存在')
  }
  return imageMap
}
