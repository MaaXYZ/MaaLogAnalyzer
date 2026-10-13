import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATUS_COLORS } from '../statusColors'

const readRepositoryFile = (relativePath: string) =>
  readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8')

describe('status color single source of truth', () => {
  const styleCss = readRepositoryFile('src/style.css')

  it('defines each JS status color as the matching CSS token', () => {
    const tokenByStatus: Record<keyof typeof STATUS_COLORS, string> = {
      success: '--app-status-success',
      warning: '--app-status-warning',
      failed: '--app-status-failed',
      neutral: '--app-status-neutral',
    }

    for (const [status, token] of Object.entries(tokenByStatus)) {
      const declaration = new RegExp(`${token}\\s*:[^;]*${STATUS_COLORS[status as never]}`)
      expect(styleCss, `${token} 应与 STATUS_COLORS.${status} 同值`).toMatch(declaration)
    }
  })
})
