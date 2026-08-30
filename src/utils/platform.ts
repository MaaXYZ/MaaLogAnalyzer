/**
 * 平台检测工具函数
 */

/**
 * 检测是否在 Tauri 环境中运行
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 检测是否在 VS Code Webview 环境中运行
 */
export function isVSCode(): boolean {
  if (typeof window === 'undefined') return false

  if (window.isVSCode === true || typeof window.vscodeApi !== 'undefined') return true
  if (typeof window.vscodeThemeKind === 'number') return true

  const protocol = window.location?.protocol ?? ''
  if (protocol === 'vscode-webview:' || protocol === 'vscode-web:') return true

  const classList = document.body?.classList
  if (!classList) return false
  return (
    classList.contains('vscode-light') ||
    classList.contains('vscode-high-contrast-light') ||
    classList.contains('vscode-dark') ||
    classList.contains('vscode-high-contrast')
  )
}
