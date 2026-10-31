import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATUS_COLORS, STATUS_TEXT_COLORS } from '../statusColors'

const readRepositoryFile = (relativePath: string) =>
  readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8')

interface CssRule {
  selector: string
  /** 外层 @media / @supports 的原文，顶层规则为 null */
  atRule: string | null
  declarations: Map<string, string>
}

const parseDeclarations = (body: string): Map<string, string> => {
  const declarations = new Map<string, string>()
  for (const chunk of body.split(';')) {
    const separator = chunk.indexOf(':')
    if (separator < 0) continue
    declarations.set(chunk.slice(0, separator).trim(), chunk.slice(separator + 1).trim())
  }
  return declarations
}

/** 把 style.css 拆成「选择器 → 声明表」，@media 里的规则带上外层条件原文。
    之所以自己解析而不是正则全文件搜：同一个 token 在深浅两套里各出现一次，
    全文件搜索分不清命中的是哪一套，浅色值抄错也测不出来。 */
const parseRules = (css: string): CssRule[] => {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  const stack: Array<{ selector: string; atRule: string | null }> = []
  let buffer = ''

  for (const char of source) {
    if (char === '{') {
      const selector = buffer.trim()
      const parent = stack[stack.length - 1]
      const atRule = selector.startsWith('@')
        ? selector
        : (parent?.atRule ?? (parent?.selector.startsWith('@') ? parent.selector : null))
      stack.push({ selector, atRule })
      buffer = ''
      continue
    }
    if (char === '}') {
      const frame = stack.pop()
      if (frame && !frame.selector.startsWith('@')) {
        rules.push({
          selector: frame.selector,
          atRule: frame.atRule,
          declarations: parseDeclarations(buffer),
        })
      }
      buffer = ''
      continue
    }
    buffer += char
  }

  return rules
}

const styleCss = readRepositoryFile('src/style.css')
const rules = parseRules(styleCss)

const findDeclaration = (
  property: string,
  predicate: (rule: CssRule) => boolean,
): string | undefined => {
  const matches = rules.filter((rule) => predicate(rule) && rule.declarations.has(property))
  return matches[matches.length - 1]?.declarations.get(property)
}

const isBaseBodyRule = (rule: CssRule) => rule.selector.trim() === 'body' && rule.atRule === null
const isLightClassRule = (rule: CssRule) => /body\.(?:force-light|vscode-light)/.test(rule.selector)
const isLightMediaRule = (rule: CssRule) =>
  (rule.atRule ?? '').includes('prefers-color-scheme: light')

const statusKeys = ['success', 'warning', 'failed', 'neutral'] as const

describe('status color single source of truth', () => {
  it('defines each JS graphic color as the matching CSS token', () => {
    for (const status of statusKeys) {
      const declaration = findDeclaration(`--app-status-${status}`, isBaseBodyRule)
      expect(declaration, `缺少 body 上的 --app-status-${status}`).toBeDefined()
      // 图形色在 CSS 里是 var(--vscode-xxx, 兜底值) 的链，只要求兜底值出现在声明里
      expect(
        declaration,
        `--app-status-${status} 兜底值应与 STATUS_COLORS.${status} 同值`,
      ).toContain(STATUS_COLORS[status])
    }
  })

  it('defines the dark text tokens with the dark palette', () => {
    for (const status of statusKeys) {
      const declaration = findDeclaration(`--app-status-${status}-text`, isBaseBodyRule)
      expect(declaration, `缺少 body 上的 --app-status-${status}-text`).toBe(
        STATUS_TEXT_COLORS.dark[status],
      )
    }
  })

  it('defines the light text tokens in both light entry points, with identical values', () => {
    for (const status of statusKeys) {
      const property = `--app-status-${status}-text`
      const classEntry = findDeclaration(property, isLightClassRule)
      const mediaEntry = findDeclaration(property, isLightMediaRule)
      expect(classEntry, `缺少浅色 class 入口的 ${property}`).toBe(STATUS_TEXT_COLORS.light[status])
      expect(mediaEntry, `缺少系统浅色的 ${property}`).toBe(STATUS_TEXT_COLORS.light[status])
      expect(mediaEntry, `${property} 的两处浅色入口必须同值`).toBe(classEntry)
    }
  })

  it('keeps the light graphic warning override consistent across light entry points', () => {
    // 浅色下 #f0a020 的圆点压白底只有 2.15:1，图形色也必须提到 3:1 以上
    const classEntry = findDeclaration('--app-status-warning', isLightClassRule)
    expect(classEntry).toBe('#b45309')
    expect(findDeclaration('--app-status-warning', isLightMediaRule)).toBe(classEntry)
  })
})
