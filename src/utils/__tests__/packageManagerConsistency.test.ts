import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('package manager consistency', () => {
  it('uses the root pnpm version in every setup action', () => {
    const root = resolve(import.meta.dirname, '../../..')
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      packageManager?: string
    }
    const pnpmVersion = /^pnpm@([^+]+)/.exec(packageJson.packageManager ?? '')?.[1]
    expect(pnpmVersion).toBe('10.34.5')

    const files = readdirSync(resolve(root, '.github'), {
      recursive: true,
      encoding: 'utf8',
    }).filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    const setupVersions: string[] = []
    for (const file of files) {
      const content = readFileSync(resolve(root, '.github', file), 'utf8')
      const blocks = content.matchAll(
        /uses:\s*pnpm\/action-setup@[0-9a-f]{40}[^\n]*\r?\n\s*with:\r?\n\s*version:\s*([^\s#]+)/g,
      )
      setupVersions.push(...[...blocks].map((match) => match[1]!))
    }

    expect(setupVersions.length).toBeGreaterThan(0)
    expect(new Set(setupVersions)).toEqual(new Set([pnpmVersion]))

    const vscodePackage = JSON.parse(
      readFileSync(resolve(root, 'src-vscode/package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }
    expect(vscodePackage.scripts?.['build:webview']).toContain(`corepack pnpm@${pnpmVersion}`)

    const rootPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(rootPackage.scripts?.['build:packages']).toContain(`corepack pnpm@${pnpmVersion}`)
    expect(Object.values(rootPackage.scripts ?? {}).join('\n')).not.toMatch(/(?:^|&&\s*)pnpm\s/)

    const tauriConfig = JSON.parse(
      readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { build?: { beforeDevCommand?: string; beforeBuildCommand?: string } }
    expect(tauriConfig.build?.beforeDevCommand).toContain(`corepack pnpm@${pnpmVersion}`)
    expect(tauriConfig.build?.beforeBuildCommand).toContain(`corepack pnpm@${pnpmVersion}`)
  })

  it('uses frozen pnpm installs in CI', () => {
    const root = resolve(import.meta.dirname, '../../..')
    const files = readdirSync(resolve(root, '.github'), {
      recursive: true,
      encoding: 'utf8',
    }).filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))

    const installCommands = files.flatMap((file) => {
      const content = readFileSync(resolve(root, '.github', file), 'utf8')
      return [...content.matchAll(/\bpnpm install[^\r\n]*/g)].map((match) => match[0])
    })

    expect(installCommands.length).toBeGreaterThan(0)
    expect(installCommands.filter((command) => !command.includes('--frozen-lockfile'))).toEqual([])
  })
})
