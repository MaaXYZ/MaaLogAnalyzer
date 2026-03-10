/**
 * Tauri 文件对话框工具
 * 提供统一的文件访问接口，同时支持 Tauri、VS Code 和 Web 环境
 */

import { isTauri, isVSCode } from './platform'

export { isTauri, isVSCode }

/**
 * 解码文件内容，自动尝试多种编码
 * @param bytes 文件的原始字节数组
 * @returns 解码后的字符串
 */
function decodeFileContent(bytes: Uint8Array): string {
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
 */
async function openLogFileWithTauri(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readFile } = await import('@tauri-apps/plugin-fs')

    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Log Files',
        extensions: ['log', 'jsonl', 'txt']
      }],
      directory: false,
      title: '选择日志文件'
    })

    if (selected && typeof selected === 'string') {
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
 * 打开文件夹并读取日志
 */
export async function openFolderDialog(): Promise<{ content: string; errorImages: Map<string, string> } | null> {
  if (isTauri()) {
    return await openFolderDialogTauri()
  } else {
    return await openFolderDialogWeb()
  }
}

/**
 * Tauri 版本：打开文件夹并读取日志
 */
async function openFolderDialogTauri(): Promise<{ content: string; errorImages: Map<string, string> } | null> {

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

    let debugPath = `${selected}\\debug`

    // 如果没有debug文件夹，递归查找
    if (!(await exists(debugPath))) {
      console.log('[文件夹] debug文件夹不存在，开始递归查找')
      const found = await findDebugFolder(selected)
      if (!found) {
        alert('未找到debug文件夹')
        return null
      }
      debugPath = found
      console.log('[文件夹] 找到debug文件夹:', debugPath)
    }

    // 读取日志文件
    let content = ''
    const bakLogPath = `${debugPath}\\maa.bak.log`
    const mainLogPath = `${debugPath}\\maa.log`

    console.log('[文件夹] 读取日志文件')

    if (await exists(bakLogPath)) {
      console.log('[文件夹] 读取 maa.bak.log')
      content += await readTextFile(bakLogPath)
    }

    if (await exists(mainLogPath)) {
      console.log('[文件夹] 读取 maa.log')
      if (content && !content.endsWith('\n')) {
        content += '\n'
      }
      content += await readTextFile(mainLogPath)
    }

    if (!content) {
      alert('未找到maa.log文件')
      return null
    }

    console.log('[文件夹] 日志文件读取完成，大小:', content.length)

    // 读取截图
    const errorImages = await readErrorImages(debugPath)

    return { content, errorImages }
  } catch (error) {
    console.error('[文件夹] 打开失败:', error)
    alert('打开文件夹失败: ' + error)
    return null
  }
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
 * Web 版本：打开文件夹并读取日志
 */
async function openFolderDialogWeb(): Promise<{ content: string; errorImages: Map<string, string> } | null> {
  try {
    if (!('showDirectoryPicker' in window)) {
      alert('您的浏览器不支持文件夹选择功能，请使用 Chrome/Edge 等现代浏览器')
      return null
    }

    console.log('[文件夹] 打开文件夹对话框 (Web)')
    const dirHandle = await (window as any).showDirectoryPicker()
    console.log('[文件夹] 选择的文件夹:', dirHandle.name)

    // 查找 debug 文件夹
    let debugHandle = dirHandle

    // 先检查当前文件夹是否有 maa.log（可能用户直接选择了 debug 文件夹）
    try {
      await dirHandle.getFileHandle('maa.log')
      console.log('[文件夹] 当前文件夹就是 debug 文件夹')
    } catch {
      // 当前文件夹没有 maa.log，尝试找 debug 子文件夹
      try {
        debugHandle = await dirHandle.getDirectoryHandle('debug')
        console.log('[文件夹] 找到 debug 子文件夹')
      } catch {
        console.log('[文件夹] debug子文件夹不存在，开始递归查找')
        const found = await findDebugFolderWeb(dirHandle)
        if (!found) {
          alert('未找到debug文件夹或maa.log文件')
          return null
        }
        debugHandle = found
        console.log('[文件夹] 递归找到debug文件夹')
      }
    }

    // 读取日志文件
    let content = ''

    try {
      const bakLogHandle = await debugHandle.getFileHandle('maa.bak.log')
      const bakFile = await bakLogHandle.getFile()
      content += await bakFile.text()
      console.log('[文件夹] 读取 maa.bak.log')
    } catch {
      // 文件不存在
    }

    try {
      const mainLogHandle = await debugHandle.getFileHandle('maa.log')
      const mainFile = await mainLogHandle.getFile()
      if (content && !content.endsWith('\n')) {
        content += '\n'
      }
      content += await mainFile.text()
      console.log('[文件夹] 读取 maa.log')
    } catch {
      // 文件不存在
    }

    if (!content) {
      alert('未找到maa.log文件')
      return null
    }

    console.log('[文件夹] 日志文件读取完成，大小:', content.length)

    // 读取截图
    const errorImages = await readErrorImagesWeb(debugHandle)

    return { content, errorImages }
  } catch (error) {
    console.error('[文件夹] 打开失败:', error)
    if ((error as Error).name === 'AbortError') {
      return null // 用户取消
    }
    alert('打开文件夹失败: ' + error)
    return null
  }
}
