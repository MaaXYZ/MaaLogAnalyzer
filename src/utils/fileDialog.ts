/**
 * Tauri 文件对话框工具
 * 提供统一的文件访问接口，同时支持 Tauri、VS Code 和 Web 环境
 */

import { isTauri, isVSCode } from './platform'
import { toastError, toastWarning } from './toast'
import { decodeFileContent } from './textEncoding'
import type { TextFileSource } from './textFileSource'
import { invoke } from '@tauri-apps/api/core'
import { joinNativePath } from './nativePath'
import { replaceBlobUrl } from './blobUrlMap'
import { releaseTauriArchiveResource } from './tauriArchiveResources'
import { ArchiveLimitError } from './archiveLimits'
import {
  InputResourceLimitError,
  chargeInputResourceBytes,
  createBrowserInputBudget,
  createInputResourceBudget,
  registerInputResourceEntry,
  type BrowserInputBudget,
  type InputResourceBudget,
} from './browserInputBudget'
import {
  combineLoadedPrimaryLogSegments,
  createPrimaryLogSelectionOptions,
  isPrimaryLogFileName,
  type LoadedPrimaryLogFile,
  type FilePrimaryLogFile,
  type LoadablePrimaryLogFile,
  type PrimaryLogFile,
  type PrimaryLogSelectionOption,
  PRIMARY_LOG_FILE_HINT,
  selectPrimaryLogGroup,
} from './logFileDiscovery'

export { isTauri, isVSCode }

const TEXT_SEARCH_EXTENSIONS = ['.log', '.txt', '.jsonl'] as const

export const normalizeTauriDialogPaths = (
  selected: string | string[] | null,
): string[] => {
  if (typeof selected === 'string') return [selected]
  if (!Array.isArray(selected)) return []
  return selected.filter((path): path is string => typeof path === 'string' && path.length > 0)
}

export type LoadedTextFile = TextFileSource

interface OpenFolderResult {
  content: string
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
  textFiles: LoadedTextFile[]
  primaryLogFiles: PrimaryLogFile[]
}

export interface OpenFolderDialogOptions {
  selectPrimaryLogs?: (
    options: PrimaryLogSelectionOption[],
  ) => Promise<PrimaryLogSelectionOption[] | null>
}

const isTextSearchFileName = (name: string) => {
  const lower = name.toLowerCase()
  return TEXT_SEARCH_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

const shouldSkipCollectedTextFile = (name: string) => isPrimaryLogFileName(name)
const toPosixPath = (value: string) => value.replace(/\\/g, '/')

const isInputResourceLimitError = (error: unknown) =>
  error instanceof ArchiveLimitError || error instanceof InputResourceLimitError

const withUnmeteredInput = async <T>(
  load: (budget: InputResourceBudget) => Promise<T>,
): Promise<T> => load(createInputResourceBudget(null))

const withUnmeteredBrowserInput = async <T>(
  load: (budget: BrowserInputBudget) => Promise<T>,
): Promise<T> => load(createBrowserInputBudget(null))

export const chargeTauriRegularFile = async (
  path: string,
  budget: InputResourceBudget,
  options: { image?: boolean } = {},
) => {
  const normalizedPath = toPosixPath(path)
  if (budget.chargedPaths.has(normalizedPath)) return
  const { lstat } = await import('@tauri-apps/plugin-fs')
  const info = await lstat(path)
  if (!info.isFile || info.isSymlink) {
    throw new InputResourceLimitError('所选目录包含不受支持的文件链接')
  }
  chargeInputResourceBytes(budget, info.size, options)
  budget.chargedPaths.add(normalizedPath)
}

export const assertTauriDirectory = async (path: string) => {
  const { lstat } = await import('@tauri-apps/plugin-fs')
  const info = await lstat(path)
  if (!info.isDirectory || info.isSymlink) {
    throw new InputResourceLimitError('所选目录包含不受支持的目录链接')
  }
}

const chargeWebRegularFile = (
  file: File,
  path: string,
  budget: BrowserInputBudget,
  options: { image?: boolean } = {},
) => {
  const normalizedPath = toPosixPath(path)
  if (budget.chargedPaths.has(normalizedPath)) return
  chargeInputResourceBytes(budget, file.size, options)
  budget.chargedPaths.add(normalizedPath)
}

interface WebDirectoryLocation {
  handle: FileSystemDirectoryHandle
  path: string
  depth: number
}

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
      multiple: true,
      filters: [{
        name: 'Log Files',
        extensions: ['log', 'jsonl', 'txt', 'zip', '7z', 'rar']
      }, {
        name: 'Archive Files',
        extensions: ['zip', '7z', 'rar']
      }],
      directory: false,
      title: '选择日志文件'
    })

    const selectedPaths = normalizeTauriDialogPaths(selected)
    const anchor = selectedPaths[0]
    if (anchor) {
      const lower = anchor.toLowerCase()
      if (lower.endsWith('.zip') || lower.endsWith('.7z') || lower.endsWith('.rar')) {
        return await openArchiveFileWithTauri(anchor, selectedPaths)
      }
      await withUnmeteredInput(async (budget) => {
        registerInputResourceEntry(budget, anchor, 0)
        await chargeTauriRegularFile(anchor, budget)
      })
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const bytes = await readFile(anchor)
      const content = decodeFileContent(bytes)
      return content
    }
  } catch (error) {
    toastError('打开文件失败: ' + error)
  }
  return null
}

async function openArchiveFileWithTauri(path: string, paths: string[]): Promise<string | null> {
  type ArchiveResult = {
    content: string
    primary_log_files: LoadedPrimaryLogFile[]
    resource_token?: string | null
  }
  const result = await invoke<ArchiveResult>('extract_zip_log', { path, paths })
  try {
    // Rust extract_zip_log returns empty content; real logs live in primary_log_files
    const primaryLogFiles = result.primary_log_files ?? []
    if (primaryLogFiles.length === 0) return null
    return combineLoadedPrimaryLogSegments(primaryLogFiles)
  } finally {
    await releaseTauriArchiveResource(result.resource_token).catch((error) => {
      console.warn('Failed to release unused Tauri archive images:', error)
    })
  }
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
          const budget = createBrowserInputBudget(null)
          registerInputResourceEntry(budget, file.name, 0)
          chargeWebRegularFile(file, file.name, budget)
          const content = await file.text()
          resolve(content)
        } catch (error) {
          toastError('读取文件失败: ' + error)
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
      toastError('保存失败: ' + error)
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
async function findDebugFolder(
  basePath: string,
  budget: InputResourceBudget,
  depth = 0,
): Promise<string | null> {
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')
    registerInputResourceEntry(budget, basePath, depth)
    await assertTauriDirectory(basePath)

    // 检查当前路径下是否有debug文件夹
    const debugPath = joinNativePath(basePath, 'debug')
    if (await exists(debugPath)) {
      registerInputResourceEntry(budget, debugPath, depth + 1)
      await assertTauriDirectory(debugPath)
      return debugPath
    }

    // 递归查找子文件夹
    const entries = await readDir(basePath)
    for (const entry of entries) {
      const fullPath = joinNativePath(basePath, entry.name)
      registerInputResourceEntry(budget, fullPath, depth + 1)
      if (entry.isDirectory && !entry.isSymlink) {
        const found = await findDebugFolder(fullPath, budget, depth + 1)
        if (found) return found
      }
    }
  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
    console.error('[查找debug] 错误:', error)
  }
  return null
}

/**
 * 读取on_error文件夹中的截图
 */
async function readErrorImages(
  debugPath: string,
  budget: InputResourceBudget,
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')

    const onErrorPath = joinNativePath(debugPath, 'on_error')

    if (!(await exists(onErrorPath))) {
      return imageMap
    }

    registerInputResourceEntry(budget, onErrorPath, 1)
    await assertTauriDirectory(onErrorPath)
    const entries = await readDir(onErrorPath)

    for (const entry of entries) {
      const fullPath = joinNativePath(onErrorPath, entry.name)
      registerInputResourceEntry(budget, fullPath, 2)
      if (entry.isFile && !entry.isSymlink && entry.name.endsWith('.png')) {
        // 解析文件名: 2026.03.08-13.12.30.216_CCUpdate.png (毫秒可能是1-3位)
        const match = entry.name.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/)
        if (match) {
          const [, timestamp, ms, nodeName] = match
          // 将毫秒补齐为3位
          const paddedMs = ms.padEnd(3, '0')
          const key = `${timestamp}.${paddedMs}_${nodeName}`
          await chargeTauriRegularFile(fullPath, budget, { image: true })
          imageMap.set(key, fullPath)
        }
      }
    }

  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
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
async function readVisionImages(
  debugPath: string,
  budget: InputResourceBudget,
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')

    const visionPath = joinNativePath(debugPath, 'vision')
    if (!(await exists(visionPath))) {
      return imageMap
    }

    registerInputResourceEntry(budget, visionPath, 1)
    await assertTauriDirectory(visionPath)
    const entries = await readDir(visionPath)
    for (const entry of entries) {
      const fullPath = joinNativePath(visionPath, entry.name)
      registerInputResourceEntry(budget, fullPath, 2)
      if (entry.isFile && !entry.isSymlink && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseVisionImageKey(entry.name)
        if (key != null) {
          await chargeTauriRegularFile(fullPath, budget, { image: true })
          // 同一 key 覆盖（取最后出现的文件）
          imageMap.set(key, fullPath)
        }
      }
    }
  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
    console.warn('[vision] 读取调试截图失败:', error)
  }
  return imageMap
}


async function collectTextFilesTauri(
  rootPath: string,
  budget: InputResourceBudget,
): Promise<LoadedTextFile[]> {
  const result: LoadedTextFile[] = []
  const seen = new Set<string>()
  const { readDir, readFile } = await import('@tauri-apps/plugin-fs')

  const walk = async (dirPath: string, depth: number) => {
    registerInputResourceEntry(budget, dirPath, depth)
    await assertTauriDirectory(dirPath)
    const entries = await readDir(dirPath)
    for (const entry of entries) {
      const fullPath = joinNativePath(dirPath, entry.name)
      registerInputResourceEntry(budget, fullPath, depth + 1)
      if (entry.isDirectory && !entry.isSymlink) {
        await walk(fullPath, depth + 1)
        continue
      }
      if (!entry.isFile || entry.isSymlink) continue
      if (!isTextSearchFileName(entry.name)) continue
      if (shouldSkipCollectedTextFile(entry.name)) continue
      const path = normalizeLoadedPath(fullPath, rootPath) || entry.name
      if (seen.has(path)) continue
      seen.add(path)
      await chargeTauriRegularFile(fullPath, budget)
      result.push({
        path,
        name: entry.name,
        loadContent: async () => decodeFileContent(await readFile(fullPath)),
      })
    }
  }

  await walk(rootPath, 0)
  return result
}

async function collectTextFilesWeb(
  root: WebDirectoryLocation,
  budget: BrowserInputBudget,
): Promise<LoadedTextFile[]> {
  const result: LoadedTextFile[] = []
  const seen = new Set<string>()

  const walk = async (location: WebDirectoryLocation, relativePrefix: string) => {
    registerInputResourceEntry(budget, location.path, location.depth)
    for await (const entry of location.handle.values()) {
      const nextPath = `${location.path}/${entry.name}`
      const nextRelativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name
      registerInputResourceEntry(budget, nextPath, location.depth + 1)
      if (entry.kind === 'directory') {
        await walk({
          handle: entry as FileSystemDirectoryHandle,
          path: nextPath,
          depth: location.depth + 1,
        }, nextRelativePath)
        continue
      }
      if (!isTextSearchFileName(entry.name)) continue
      if (shouldSkipCollectedTextFile(entry.name)) continue
      const path = normalizeLoadedPath(nextRelativePath) || entry.name
      if (seen.has(path)) continue
      seen.add(path)
      const file = await (entry as FileSystemFileHandle).getFile()
      chargeWebRegularFile(file, nextPath, budget)
      result.push({
        path,
        name: entry.name,
        loadContent: async () => decodeFileContent(new Uint8Array(await file.arrayBuffer())),
      })
    }
  }

  await walk(root, '')
  return result
}

async function listPrimaryLogFilesTauri(
  dirPath: string,
  budget: InputResourceBudget,
): Promise<Array<{ path: string; name: string }>> {
  const { readDir } = await import('@tauri-apps/plugin-fs')
  await assertTauriDirectory(dirPath)
  const entries = await readDir(dirPath)
  for (const entry of entries) {
    registerInputResourceEntry(budget, joinNativePath(dirPath, entry.name), 1)
  }
  return entries
    .filter(entry => entry.isFile && !entry.isSymlink && !!entry.name && isPrimaryLogFileName(entry.name))
    .map(entry => ({
      path: joinNativePath(dirPath, entry.name),
      name: entry.name!,
    }))
}

async function hasPrimaryLogInTauri(dirPath: string, budget: InputResourceBudget): Promise<boolean> {
  return (await listPrimaryLogFilesTauri(dirPath, budget)).length > 0
}

async function readPrimaryLogFilesTauri(
  dirPath: string,
  budget: InputResourceBudget,
  selectPrimaryLogs?: OpenFolderDialogOptions['selectPrimaryLogs'],
): Promise<LoadablePrimaryLogFile[] | null> {
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const selectedLogs = selectPrimaryLogGroup(await listPrimaryLogFilesTauri(dirPath, budget))
  if (selectedLogs.length === 0) return []
  const selectedOptions = selectPrimaryLogs
    ? await selectPrimaryLogs(createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item)))
    : createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item))
  if (!selectedOptions) return null
  if (selectedOptions.length === 0) return []
  const selectedPaths = new Set(selectedOptions.map(option => option.path))

  const selectedOrder = new Map(selectedOptions.map((option, index) => [option.path, index]))
  const selectedLogItems = selectedLogs
    .filter(({ item }) => selectedPaths.has(item.path))
    .sort((a, b) => (selectedOrder.get(a.item.path) ?? 0) - (selectedOrder.get(b.item.path) ?? 0))
  for (const { item } of selectedLogItems) {
    await chargeTauriRegularFile(item.path, budget)
  }
  return selectedLogItems.map(({ item }): LoadablePrimaryLogFile => ({
    path: item.path,
    name: item.name,
    loadBytes: async () => await readFile(item.path),
    loadContent: async () => decodeFileContent(await readFile(item.path)),
  }))
}

async function listPrimaryLogFilesWeb(
  location: WebDirectoryLocation,
  budget: BrowserInputBudget,
): Promise<Array<{
  path: string
  name: string
  resourcePath: string
  handle: FileSystemFileHandle
}>> {
  const result: Array<{
    path: string
    name: string
    resourcePath: string
    handle: FileSystemFileHandle
  }> = []
  registerInputResourceEntry(budget, location.path, location.depth)
  for await (const entry of location.handle.values()) {
    const resourcePath = `${location.path}/${entry.name}`
    registerInputResourceEntry(budget, resourcePath, location.depth + 1)
    if (entry.kind !== 'file') continue
    if (!isPrimaryLogFileName(entry.name)) continue
    result.push({
      path: entry.name,
      name: entry.name,
      resourcePath,
      handle: entry as FileSystemFileHandle,
    })
  }
  return result
}

async function hasPrimaryLogInWeb(
  location: WebDirectoryLocation,
  budget: BrowserInputBudget,
): Promise<boolean> {
  return (await listPrimaryLogFilesWeb(location, budget)).length > 0
}

async function readPrimaryLogFilesWeb(
  location: WebDirectoryLocation,
  budget: BrowserInputBudget,
  selectPrimaryLogs?: OpenFolderDialogOptions['selectPrimaryLogs'],
): Promise<FilePrimaryLogFile[] | null> {
  const selectedLogs = selectPrimaryLogGroup(await listPrimaryLogFilesWeb(location, budget))
  if (selectedLogs.length === 0) return []
  const selectedOptions = selectPrimaryLogs
    ? await selectPrimaryLogs(createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item)))
    : createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item))
  if (!selectedOptions) return null
  if (selectedOptions.length === 0) return []
  const selectedPaths = new Set(selectedOptions.map(option => option.path))

  const selectedOrder = new Map(selectedOptions.map((option, index) => [option.path, index]))
  const selectedLogItems = selectedLogs
    .filter(({ item }) => selectedPaths.has(item.path))
    .sort((a, b) => (selectedOrder.get(a.item.path) ?? 0) - (selectedOrder.get(b.item.path) ?? 0))
  const selectedFiles: Array<{ item: typeof selectedLogItems[number]['item']; file: File }> = []
  for (const { item } of selectedLogItems) {
    const file = await item.handle.getFile()
    chargeWebRegularFile(file, item.resourcePath, budget)
    selectedFiles.push({ item, file })
  }
  return selectedFiles.map(({ item, file }): FilePrimaryLogFile => ({
    path: item.path,
    name: item.name,
    file,
    loadContent: async () => decodeFileContent(new Uint8Array(await file.arrayBuffer())),
  }))
}

/**
 * 打开文件夹并读取日志
 */
export async function openFolderDialog(options: OpenFolderDialogOptions = {}): Promise<OpenFolderResult | null> {
  if (isTauri()) {
    return await openFolderDialogTauri(options)
  } else {
    return await openFolderDialogWeb(options)
  }
}

/**
 * Tauri 版本：打开文件夹并读取日志
 */
async function openFolderDialogTauri(options: OpenFolderDialogOptions): Promise<OpenFolderResult | null> {

  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { exists } = await import('@tauri-apps/plugin-fs')


    const selected = await open({
      multiple: false,
      directory: true,
      recursive: true,
      title: '选择日志文件夹',
    })

    if (!selected || typeof selected !== 'string') {
      return null
    }

    return await withUnmeteredInput(async (budget) => {
      registerInputResourceEntry(budget, selected, 0)
      await assertTauriDirectory(selected)
      let debugPath = selected

      if (!(await hasPrimaryLogInTauri(debugPath, budget))) {
        debugPath = joinNativePath(selected, 'debug')

        if (!(await exists(debugPath)) || !(await hasPrimaryLogInTauri(debugPath, budget))) {
          const found = await findDebugFolder(selected, budget)
          if (!found || !(await hasPrimaryLogInTauri(found, budget))) {
            toastWarning(`未找到debug文件夹或日志文件（${PRIMARY_LOG_FILE_HINT}）`)
            return null
          }
          debugPath = found
        }
      }

      const primaryLogFiles = await readPrimaryLogFilesTauri(
        debugPath,
        budget,
        options.selectPrimaryLogs,
      )

      if (primaryLogFiles == null) {
        return null
      }

      if (primaryLogFiles.length === 0) {
        toastWarning(`未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
        return null
      }

      const errorImages = await readErrorImages(debugPath, budget)
      const visionImages = await readVisionImages(debugPath, budget)
      const waitFreezesImages = await readWaitFreezesImages(debugPath, budget)
      let textFiles: LoadedTextFile[] = []
      try {
        textFiles = await collectTextFilesTauri(debugPath, budget)
      } catch (error) {
        if (isInputResourceLimitError(error)) throw error
        console.warn('[文件夹] 收集文本文件失败(Tauri):', error)
      }

      return {
        content: '',
        errorImages,
        visionImages,
        waitFreezesImages,
        textFiles,
        primaryLogFiles,
      }
    })
  } catch (error) {
    console.error('[文件夹] 打开失败:', error)
    toastError('打开文件夹失败: ' + error)
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
async function readWaitFreezesImages(
  debugPath: string,
  budget: InputResourceBudget,
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>()
  try {
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')

    const visionPath = joinNativePath(debugPath, 'vision')
    if (!(await exists(visionPath))) {
      return imageMap
    }

    registerInputResourceEntry(budget, visionPath, 1)
    await assertTauriDirectory(visionPath)
    const entries = await readDir(visionPath)
    for (const entry of entries) {
      const fullPath = joinNativePath(visionPath, entry.name)
      registerInputResourceEntry(budget, fullPath, 2)
      if (entry.isFile && !entry.isSymlink && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseWaitFreezesKey(entry.name)
        if (key != null) {
          await chargeTauriRegularFile(fullPath, budget, { image: true })
          imageMap.set(key, fullPath)
        }
      }
    }
  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
    console.warn('[wait_freezes] 读取调试截图失败:', error)
  }
  return imageMap
}

/**
 * Web 版本：递归查找 debug 文件夹
 */
async function findDebugFolderWeb(
  location: WebDirectoryLocation,
  budget: BrowserInputBudget,
): Promise<WebDirectoryLocation | null> {
  try {
    // 检查当前目录下是否有 debug 文件夹
    try {
      const handle = await location.handle.getDirectoryHandle('debug')
      const debugLocation = {
        handle,
        path: `${location.path}/debug`,
        depth: location.depth + 1,
      }
      registerInputResourceEntry(budget, debugLocation.path, debugLocation.depth)
      if (await hasPrimaryLogInWeb(debugLocation, budget)) return debugLocation
    } catch (error) {
      if (isInputResourceLimitError(error)) throw error
      // debug 不存在，继续递归查找
    }

    // 递归查找子文件夹
    for await (const entry of location.handle.values()) {
      const nextPath = `${location.path}/${entry.name}`
      registerInputResourceEntry(budget, nextPath, location.depth + 1)
      if (entry.kind === 'directory') {
        const found = await findDebugFolderWeb({
          handle: entry as FileSystemDirectoryHandle,
          path: nextPath,
          depth: location.depth + 1,
        }, budget)
        if (found) return found
      }
    }
  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
    console.error('[查找debug] 错误:', error)
  }
  return null
}

type WebImageFiles = Map<string, File>

const createWebImageUrlMap = (files: WebImageFiles): Map<string, string> => {
  const result = new Map<string, string>()
  try {
    for (const [key, file] of files) replaceBlobUrl(result, key, file)
    return result
  } catch (error) {
    for (const url of result.values()) URL.revokeObjectURL(url)
    throw error
  }
}

const revokeWebImageUrlMaps = (maps: Array<Map<string, string>>) => {
  for (const map of maps) {
    for (const url of map.values()) URL.revokeObjectURL(url)
  }
}

/**
 * Web 版本：读取 on_error 文件夹中的截图
 */
async function readErrorImagesWeb(
  debugLocation: WebDirectoryLocation,
  budget: BrowserInputBudget,
): Promise<WebImageFiles> {
  const imageMap = new Map<string, File>()
  try {
    const onErrorHandle = await debugLocation.handle.getDirectoryHandle('on_error')
    const onErrorPath = `${debugLocation.path}/on_error`
    registerInputResourceEntry(budget, onErrorPath, debugLocation.depth + 1)

    for await (const entry of onErrorHandle.values()) {
      const resourcePath = `${onErrorPath}/${entry.name}`
      registerInputResourceEntry(budget, resourcePath, debugLocation.depth + 2)
      if (entry.kind === 'file' && entry.name.endsWith('.png')) {
        const match = entry.name.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/)
        if (match) {
          const [, timestamp, ms, nodeName] = match
          // 将毫秒补齐为3位
          const paddedMs = ms.padEnd(3, '0')
          const key = `${timestamp}.${paddedMs}_${nodeName}`
          const file = await (entry as FileSystemFileHandle).getFile()
          chargeWebRegularFile(file, resourcePath, budget, { image: true })
          imageMap.set(key, file)
        }
      }
    }
  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
    // Optional debug image directory is absent.
  }
  return imageMap
}

/**
 * Web 版本：读取 vision 文件夹中的调试截图
 */
async function readVisionImagesWeb(
  debugLocation: WebDirectoryLocation,
  budget: BrowserInputBudget,
): Promise<WebImageFiles> {
  const imageMap = new Map<string, File>()
  try {
    const visionHandle = await debugLocation.handle.getDirectoryHandle('vision')
    const visionPath = `${debugLocation.path}/vision`
    registerInputResourceEntry(budget, visionPath, debugLocation.depth + 1)

    for await (const entry of visionHandle.values()) {
      const resourcePath = `${visionPath}/${entry.name}`
      registerInputResourceEntry(budget, resourcePath, debugLocation.depth + 2)
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseVisionImageKey(entry.name)
        if (key != null) {
          const file = await (entry as FileSystemFileHandle).getFile()
          chargeWebRegularFile(file, resourcePath, budget, { image: true })
          imageMap.set(key, file)
        }
      }
    }
  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
    // Optional debug image directory is absent.
  }
  return imageMap
}

/**
 * Web 版本：打开文件夹并读取日志
 */
async function openFolderDialogWeb(
  options: OpenFolderDialogOptions,
): Promise<OpenFolderResult | null> {
  try {
    if (!('showDirectoryPicker' in window)) {
      toastWarning('您的浏览器不支持文件夹选择功能，请使用 Chrome/Edge 等现代浏览器')
      return null
    }

    const dirHandle = (await (window as any).showDirectoryPicker()) as FileSystemDirectoryHandle
    return await withUnmeteredBrowserInput(async (budget) => {
      const rootLocation: WebDirectoryLocation = {
        handle: dirHandle,
        path: dirHandle.name || 'selected-folder',
        depth: 0,
      }
      registerInputResourceEntry(budget, rootLocation.path, rootLocation.depth)

      let debugLocation = rootLocation

      if (!(await hasPrimaryLogInWeb(rootLocation, budget))) {
        const found = await findDebugFolderWeb(rootLocation, budget)
        if (!found) {
          toastWarning(`未找到debug文件夹或日志文件（${PRIMARY_LOG_FILE_HINT}）`)
          return null
        }
        debugLocation = found
      }

      const primaryLogFiles = await readPrimaryLogFilesWeb(
        debugLocation,
        budget,
        options.selectPrimaryLogs,
      )

      if (primaryLogFiles == null) {
        return null
      }

      if (primaryLogFiles.length === 0) {
        toastWarning(`未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
        return null
      }

      const errorImageFiles = await readErrorImagesWeb(debugLocation, budget)
      const visionImageFiles = await readVisionImagesWeb(debugLocation, budget)
      const waitFreezesImageFiles = await readWaitFreezesImagesWeb(debugLocation, budget)
      let textFiles: LoadedTextFile[] = []
      try {
        textFiles = await collectTextFilesWeb(debugLocation, budget)
      } catch (error) {
        if (isInputResourceLimitError(error)) throw error
        console.warn('[文件夹] 收集文本文件失败(Web):', error)
      }

      const createdImageMaps: Array<Map<string, string>> = []
      try {
        const errorImages = createWebImageUrlMap(errorImageFiles)
        createdImageMaps.push(errorImages)
        const visionImages = createWebImageUrlMap(visionImageFiles)
        createdImageMaps.push(visionImages)
        const waitFreezesImages = createWebImageUrlMap(waitFreezesImageFiles)
        createdImageMaps.push(waitFreezesImages)
        return {
          content: '',
          errorImages,
          visionImages,
          waitFreezesImages,
          textFiles,
          primaryLogFiles,
        }
      } catch (error) {
        revokeWebImageUrlMaps(createdImageMaps)
        throw error
      }
    })
  } catch (error) {
    console.error('[文件夹] 打开失败:', error)
    if ((error as Error).name === 'AbortError') {
      return null
    }
    toastError('打开文件夹失败: ' + error)
    return null
  }
}
/**
 * Web 版本：读取 vision 文件夹中的 wait_freezes 调试截图
 */
async function readWaitFreezesImagesWeb(
  debugLocation: WebDirectoryLocation,
  budget: BrowserInputBudget,
): Promise<WebImageFiles> {
  const imageMap = new Map<string, File>()
  try {
    const visionHandle = await debugLocation.handle.getDirectoryHandle('vision')
    const visionPath = `${debugLocation.path}/vision`
    registerInputResourceEntry(budget, visionPath, debugLocation.depth + 1)

    for await (const entry of visionHandle.values()) {
      const resourcePath = `${visionPath}/${entry.name}`
      registerInputResourceEntry(budget, resourcePath, debugLocation.depth + 2)
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.jpg')) {
        const key = parseWaitFreezesKey(entry.name)
        if (key != null) {
          const file = await (entry as FileSystemFileHandle).getFile()
          chargeWebRegularFile(file, resourcePath, budget, { image: true })
          imageMap.set(key, file)
        }
      }
    }
  } catch (error) {
    if (isInputResourceLimitError(error)) throw error
    // Optional debug image directory is absent.
  }
  return imageMap
}
