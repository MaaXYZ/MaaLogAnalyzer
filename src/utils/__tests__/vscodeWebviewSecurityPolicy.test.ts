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
