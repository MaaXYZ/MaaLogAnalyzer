import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRepositoryFile = (relativePath: string) =>
  readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8')

describe('large browser dependency loading', () => {
  it('runs ELK in a same-origin blob web worker outside SSR tests', () => {
    const builder = readRepositoryFile('src/utils/flowchartBuilder.ts')
    const extension = readRepositoryFile('src-vscode/src/extension.ts')

    expect(builder).toContain('import.meta.env.SSR')
    expect(builder).toContain("import('elkjs/lib/elk-api.js')")
    // worker 源码必须内联成字符串再用 Blob URL 构造：webview 的文档源是
    // vscode-webview://，扩展资源在 https://*.vscode-cdn.net，直接 new Worker(资源URL)
    // 会因跨源被拒绝。
    expect(builder).toContain("import('elkjs/lib/elk-worker.min.js?raw')")
    expect(builder).toContain('workerFactory: () => createElkWorker(elkWorkerSource)')
    expect(builder).toContain('new Worker(scriptUrl)')
    expect(builder).not.toContain('?worker&inline')
    expect(extension).toContain('worker-src ${webview.cspSource} blob:')
  })

  it('allows blob web workers in the Tauri desktop CSP', () => {
    const config = JSON.parse(readRepositoryFile('src-tauri/tauri.conf.json'))
    for (const key of ['csp', 'devCsp'] as const) {
      expect(config.app.security[key]['worker-src']).toEqual(
        expect.arrayContaining(["'self'", 'blob:']),
      )
    }
  })
})
