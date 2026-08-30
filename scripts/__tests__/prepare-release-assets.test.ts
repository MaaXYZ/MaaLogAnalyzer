import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareReleaseAssets } from '../prepare-release-assets.mjs'

const roots: string[] = []

const createArtifacts = () => {
  const root = mkdtempSync(join(tmpdir(), 'mla-release-assets-'))
  roots.push(root)
  const fixtures = [
    ['windows-x86_64-artifacts', 'bundle/app.msi'],
    ['macos-x86_64-artifacts', 'bundle/app.dmg'],
    ['macos-aarch64-artifacts', 'bundle/app.dmg'],
    ['linux-x86_64-artifacts', 'bundle/app.deb'],
  ]
  for (const [artifact, relativePath] of fixtures) {
    const path = join(root, 'artifacts', artifact, relativePath)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, `${artifact}\n`, 'utf8')
  }
  return root
}

describe('desktop release asset preparation', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('uses unique platform names and emits checksums for every installer', () => {
    const root = createArtifacts()
    const output = join(root, 'release-assets')

    expect(prepareReleaseAssets(join(root, 'artifacts'), output)).toEqual([
      'windows-x86_64-app.msi',
      'macos-x86_64-app.dmg',
      'macos-aarch64-app.dmg',
      'linux-x86_64-app.deb',
    ])

    const checksums = readFileSync(join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')
    expect(checksums).toHaveLength(4)
    expect(checksums.every((line) => /^[a-f0-9]{64} {2}\S+$/.test(line))).toBe(true)
  })

  it('rejects ambiguous platform artifacts', () => {
    const root = createArtifacts()
    writeFileSync(
      join(root, 'artifacts', 'windows-x86_64-artifacts', 'second.msi'),
      'duplicate',
      'utf8',
    )

    expect(() =>
      prepareReleaseAssets(join(root, 'artifacts'), join(root, 'release-assets')),
    ).toThrow('must contain exactly one .msi file; found 2')
  })

  it('refuses to delete an output directory that contains the source artifacts', () => {
    const root = createArtifacts()

    expect(() => prepareReleaseAssets(join(root, 'artifacts'), root)).toThrow(
      'must not be a filesystem root or contain the artifacts directory',
    )
  })
})
