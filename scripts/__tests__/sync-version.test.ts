import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectVersionUpdates, isValidReleaseVersion, syncVersion } from '../sync-version.mjs'

const writeFixture = (root: string, relativePath: string, content: string) => {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

const fixtureRoots: string[] = []

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'mla-version-'))
  fixtureRoots.push(root)
  writeFixture(root, 'package.json', '{"name":"app","version":"0.0.1"}\n')
  writeFixture(root, 'src-vscode/package.json', '{"name":"extension","version":"0.0.1"}\n')
  writeFixture(
    root,
    'src-vscode/package-lock.json',
    '{"name":"extension","version":"0.0.1","packages":{"":{"version":"0.0.1"}}}\n',
  )
  writeFixture(root, 'src-tauri/tauri.conf.json', '{"productName":"app","version":"0.0.1"}\n')
  writeFixture(
    root,
    'src-tauri/Cargo.toml',
    '[package]\nname = "maa-log-analyzer"\nversion = "0.0.1"\n\n[dependencies]\n',
  )
  writeFixture(
    root,
    'src-tauri/Cargo.lock',
    'version = 4\n\n[[package]]\nname = "maa-log-analyzer"\nversion = "0.0.1"\n',
  )
  return root
}

describe('version synchronization', () => {
  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each(['1.2.3', '1.2.3-beta.1', '1.2.3+build.7'])('accepts semantic version %s', (version) =>
    expect(isValidReleaseVersion(version)).toBe(true),
  )

  it.each(['v1.2.3', '01.2.3', '1.2', '1.2.3-'])('rejects invalid version %s', (version) => {
    expect(() => collectVersionUpdates(createFixture(), version)).toThrow(
      'Invalid semantic version',
    )
  })

  it('updates every application manifest and lock file', () => {
    const root = createFixture()

    expect(syncVersion({ rootDir: root, version: '2.3.4-beta.1' })).toHaveLength(6)
    expect(syncVersion({ rootDir: root, version: '2.3.4-beta.1', check: true })).toEqual([])

    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe(
      '2.3.4-beta.1',
    )
    expect(JSON.parse(readFileSync(join(root, 'src-vscode/package.json'), 'utf8')).version).toBe(
      '2.3.4-beta.1',
    )
    const vscodeLock = JSON.parse(readFileSync(join(root, 'src-vscode/package-lock.json'), 'utf8'))
    expect(vscodeLock.version).toBe('2.3.4-beta.1')
    expect(vscodeLock.packages[''].version).toBe('2.3.4-beta.1')
    expect(readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8')).toContain(
      'version = "2.3.4-beta.1"',
    )
    expect(readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8')).toContain(
      'version = "2.3.4-beta.1"',
    )
  })

  it('reports drift without modifying files in check mode', () => {
    const root = createFixture()

    expect(() => syncVersion({ rootDir: root, version: '3.0.0', check: true })).toThrow(
      'Version 3.0.0 is not synchronized',
    )
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('0.0.1')
  })
})
