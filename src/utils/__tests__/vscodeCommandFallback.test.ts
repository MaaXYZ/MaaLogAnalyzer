import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const extensionSource = readFileSync(
  new URL('../../../src-vscode/src/extension.ts', import.meta.url),
  'utf8',
)

describe('VS Code analyze-file command', () => {
  it('falls back from a missing command URI to an active file or picker', () => {
    expect(extensionSource).toMatch(
      /'maaLogAnalyzer\.analyzeFile',\s*async \(uri\?: vscode\.Uri\) =>/,
    )
    expect(extensionSource).toMatch(
      /const targetUri = uri \?\? getActiveFileUri\(\) \?\?\s*\(?await\s*pickFileUriForAnalysis\(\)/,
    )
    expect(extensionSource).toContain("return uri?.scheme === 'file' ? uri : undefined")
  })
})
