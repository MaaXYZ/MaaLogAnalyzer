import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const extensionSource = readFileSync(
  new URL('../../../src-vscode/src/extension.ts', import.meta.url),
  'utf8',
)

describe('VS Code Webview security policy', () => {
  it('does not execute or connect to third-party origins', () => {
    expect(extensionSource).not.toContain('cloud.umami.is')
    expect(extensionSource).not.toContain('gateway.umami.is')
    expect(extensionSource).not.toMatch(/<script[^>]+src=["']https?:\/\//i)
    expect(extensionSource).toContain('connect-src ${webview.cspSource} data: blob:;')
  })

  it('allows the bundled 7z wasm extractor', () => {
    // 打包产物里有 7z-wasm（7zz.es6.js + 7zz.wasm），拖入 .7z/.rar 时会 import(7z-wasm)
    // 并 WebAssembly.instantiate。script-src 少了 'wasm-unsafe-eval' 就被 CSP 拦掉，
    // 同一个文件网页版 / 桌面版能开、面板里开不了（src-tauri/tauri.conf.json 里有这一项）。
    const scriptSrc = /script-src ([^;]+);/.exec(extensionSource)?.[1] ?? ''
    expect(scriptSrc).toContain("'wasm-unsafe-eval'")
  })

  it('starts load generations before asynchronous picker dialogs resolve', () => {
    const filePicker = extensionSource.slice(
      extensionSource.indexOf("case 'openFile':"),
      extensionSource.indexOf("case 'openFolder':"),
    )
    const folderPicker = extensionSource.slice(
      extensionSource.indexOf("case 'openFolder':"),
      extensionSource.indexOf("case 'showError':"),
    )

    expect(filePicker.indexOf('loadOperationCoordinator.begin()')).toBeLessThan(
      filePicker.indexOf('showOpenDialog'),
    )
    expect(filePicker).toContain('analyzeFileUri(fileUri[0], fileOperation)')
    expect(folderPicker.indexOf('loadOperationCoordinator.begin()')).toBeLessThan(
      folderPicker.indexOf('showOpenDialog'),
    )
    expect(folderPicker).toContain('analyzeFolderUri(folderUri[0], folderOperation)')
  })
})
