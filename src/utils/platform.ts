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
  return typeof window !== 'undefined' && (window.isVSCode === true || typeof window.vscodeApi !== 'undefined')
}
