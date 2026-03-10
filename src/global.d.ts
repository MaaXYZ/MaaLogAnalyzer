import type { MessageApi } from 'naive-ui'

// VS Code Webview API 类型
interface VSCodeApi {
  postMessage(message: any): void
  getState(): any
  setState(state: any): void
}

declare global {
  interface Window {
    $message: MessageApi | undefined
    // VS Code 环境
    vscodeApi?: VSCodeApi
    isVSCode?: boolean
  }
  // 构建时定义的常量
  const __VSCODE__: boolean | undefined

  // 扩展 File System Access API 类型定义
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemHandle>
  }
}

export {}