import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const cargoManifest = readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8')

const cargoVersion = (name: string) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = cargoManifest.match(
    new RegExp(
      `^${escapedName}\\s*=\\s*(?:\\{\\s*)?version\\s*=\\s*"=([^"]+)"|^${escapedName}\\s*=\\s*"=([^"]+)"`,
      'm',
    ),
  )
  return match?.[1] ?? match?.[2]
}

describe('Tauri dependency alignment', () => {
  it('pins JavaScript packages to reproducible versions', () => {
    const versions = [
      rootPackage.dependencies['@tauri-apps/api'],
      rootPackage.dependencies['@tauri-apps/plugin-dialog'],
      rootPackage.dependencies['@tauri-apps/plugin-fs'],
      rootPackage.devDependencies['@tauri-apps/cli'],
    ]

    expect(versions).toEqual(versions.map((version) => version.match(/^\d+\.\d+\.\d+$/)?.[0]))
  })

  it('pins Rust crates and keeps shared plugins on the same release', () => {
    expect(cargoVersion('tauri')).toBeDefined()
    expect(cargoVersion('tauri-build')).toBeDefined()
    expect(cargoVersion('tauri-plugin-dialog')).toBe(
      rootPackage.dependencies['@tauri-apps/plugin-dialog'],
    )
    expect(cargoVersion('tauri-plugin-fs')).toBe(rootPackage.dependencies['@tauri-apps/plugin-fs'])
  })
})
