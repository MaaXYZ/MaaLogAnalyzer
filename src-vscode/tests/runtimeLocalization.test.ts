import { readFileSync } from 'node:fs'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const sourceText = readFileSync(new URL('../src/extension.ts', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  l10n?: string
}
const zhBundle = JSON.parse(
  readFileSync(new URL('../l10n/bundle.l10n.zh-cn.json', import.meta.url), 'utf8'),
) as Record<string, string>

const sourceFile = ts.createSourceFile(
  'extension.ts',
  sourceText,
  ts.ScriptTarget.ES2020,
  true,
  ts.ScriptKind.TS,
)

const localizedMessages: string[] = []
const hardcodedChinese: string[] = []
const visit = (node: ts.Node) => {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 't'
  ) {
    const message = node.arguments[0]
    if (message && ts.isStringLiteral(message)) localizedMessages.push(message.text)
  }
  if (ts.isStringLiteralLike(node) && /\p{Script=Han}/u.test(node.text)) {
    hardcodedChinese.push(node.text)
  }
  ts.forEachChild(node, visit)
}
visit(sourceFile)

describe('VS Code runtime localization', () => {
  it('declares a standard VS Code localization bundle', () => {
    expect(manifest.l10n).toBe('./l10n')
  })

  it('provides a Chinese translation for every runtime message', () => {
    expect(localizedMessages.length).toBeGreaterThan(40)
    expect(localizedMessages.filter((message) => !(message in zhBundle))).toEqual([])
  })

  it('does not hardcode Chinese user-facing strings in extension source', () => {
    expect(hardcodedChinese).toEqual([])
  })
})
