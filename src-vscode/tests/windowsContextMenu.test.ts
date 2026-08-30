import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeEditorUriScheme, WINDOWS_CONTEXT_MENU_KEYS } from '../src/windowsContextMenu'

describe('Windows context menu integration', () => {
  it.each(['vscode', 'vscode-insiders', 'code-oss', 'cursor+preview'])(
    'preserves safe editor URI scheme %s',
    (scheme) => expect(normalizeEditorUriScheme(scheme)).toBe(scheme),
  )

  it.each(['', '1vscode', 'vscode://host', 'vscode" & calc', 'a'.repeat(65)])(
    'rejects unsafe editor URI scheme %#',
    (scheme) => expect(normalizeEditorUriScheme(scheme)).toBe('vscode'),
  )

  it('owns every installed registry entry from one shared list', () => {
    expect(WINDOWS_CONTEXT_MENU_KEYS).toHaveLength(4)
    expect(new Set(WINDOWS_CONTEXT_MENU_KEYS).size).toBe(4)
  })

  it('packages an automatic uninstall lifecycle hook', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string> }

    expect(manifest.scripts?.['vscode:uninstall']).toBe('node ./dist/uninstall.js')
  })
})
