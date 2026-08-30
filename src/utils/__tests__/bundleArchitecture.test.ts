import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRepositoryFile = (relativePath: string) =>
  readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8')

describe('large browser dependency loading', () => {
  it('runs ELK in a separately loaded web worker outside SSR tests', () => {
    const builder = readRepositoryFile('src/utils/flowchartBuilder.ts')
    const extension = readRepositoryFile('src-vscode/src/extension.ts')

    expect(builder).toContain('import.meta.env.SSR')
    expect(builder).toContain("import('elkjs/lib/elk-api.js')")
    expect(builder).toContain("import('elkjs/lib/elk-worker.min.js?worker')")
    expect(builder).toContain('workerFactory: () => new ElkWorker()')
    expect(extension).toContain('worker-src ${webview.cspSource} blob:')
  })
})
