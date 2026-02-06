/**
 * Tauri 文件对话框工具
 * 提供统一的文件访问接口，同时支持 Tauri 和 Web 环境
 */

// 检测是否在 Tauri 环境中
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

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
