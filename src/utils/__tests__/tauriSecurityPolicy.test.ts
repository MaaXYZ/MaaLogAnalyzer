import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRepositoryFile = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

describe('Tauri security policy', () => {
  it('does not load remote scripts in the privileged app shell', () => {
    const html = readRepositoryFile('index.html')

    expect(html).not.toContain('cloud.umami.is')
    expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//i)
  })

  it('uses a restrictive CSP and an empty static asset scope', () => {
    const config = JSON.parse(readRepositoryFile('src-tauri/tauri.conf.json')) as {
      app: {
        security: {
          csp: Record<string, string[]>
          devCsp: Record<string, string[]>
          assetProtocol: { scope: string[] }
        }
      }
    }

    expect(config.app.security.csp['default-src']).toEqual(["'self'"])
    expect(config.app.security.csp['script-src']).not.toContain('https:')
    expect(config.app.security.devCsp['script-src']).not.toContain('https:')
    expect(config.app.security.assetProtocol.scope).toEqual([])
  })

  it('keeps filesystem access command- and dialog-scoped', () => {
    const capability = JSON.parse(readRepositoryFile('src-tauri/capabilities/default.json')) as {
      permissions: unknown[]
    }
    const rustEntry = readRepositoryFile('src-tauri/src/main.rs')
    const fileDialog = readRepositoryFile('src/utils/fileDialog.ts')

    expect(capability.permissions).not.toContain('fs:read-all')
    expect(capability.permissions).not.toContain('fs:write-all')
    expect(capability.permissions).toContain('fs:allow-lstat')
    expect(capability.permissions.every((permission) => typeof permission === 'string')).toBe(true)
    expect(rustEntry).toContain('app.fs_scope().is_allowed')
    expect(rustEntry).toContain('app.asset_protocol_scope()')
    expect(rustEntry).toContain('release_archive_resource')
    expect(rustEntry).toContain('resource_token: Option<String>')
    expect(rustEntry).not.toContain('.forbid_directory(')
    expect(fileDialog).toMatch(/directory:\s*true,\s*recursive:\s*true,/)
    expect(fileDialog).toContain('createInputResourceBudget')
    expect(fileDialog).toContain('chargeTauriRegularFile')
    expect(fileDialog).toContain("import('@tauri-apps/plugin-fs')")
    expect(fileDialog).toContain('lstat(path)')
  })
})
