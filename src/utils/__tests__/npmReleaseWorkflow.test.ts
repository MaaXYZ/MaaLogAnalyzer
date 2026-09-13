import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../../.github/workflows/release-npm.yml', import.meta.url),
  'utf8',
)

const stepIndex = (name: string) => {
  const index = workflow.indexOf(`- name: ${name}`)
  expect(index, `step "${name}" is missing`).toBeGreaterThan(-1)
  return index
}

const step = (name: string, next?: string) =>
  workflow.slice(stepIndex(name), next ? stepIndex(next) : undefined)

describe('npm release workflow', () => {
  it('packs every package into an artifact instead of publishing from the build job', () => {
    const pack = step('Pack release tarballs', 'Upload release tarballs')

    expect(pack).toContain('pnpm --dir "${pkg_dir}" pack')
    expect(pack).toContain('find "${pack_root}" -maxdepth 1 -type f -name \'*.tgz\'')
    expect(pack).not.toMatch(/\b(?:npm|pnpm) publish\b/)
    expect(workflow).toContain('name: npm-packages')
  })

  it('publishes the tarballs it downloaded, not a fresh build', () => {
    const publish = step('Publish release tarballs')
    const publishJob = workflow.slice(workflow.indexOf('  publish:'))

    expect(publishJob).toContain('needs: pack')
    expect(publishJob).toContain('actions/download-artifact')
    expect(publish).toContain("find dist/npm -maxdepth 1 -type f -name '*.tgz'")
    expect(publish).toContain('tar -xzf "${tarball}" -C "${metadata_root}" package/package.json')
    expect(publish).toContain('npm publish "${tarball}" --access public --provenance')
    expect(publish).not.toMatch(/\bpnpm (?:install|pack)\b/)
    expect(workflow).not.toContain('pnpm publish --access public')
  })

  it('skips a version that is already published before touching the registry', () => {
    const publish = step('Publish release tarballs')
    const checkIndex = publish.indexOf("grep -q 'E404'")
    const publishIndex = publish.indexOf('npm publish "${tarball}"')

    expect(publish).toContain('npm view "${package_ref}" version')
    expect(checkIndex).toBeGreaterThan(-1)
    expect(publishIndex).toBeGreaterThan(checkIndex)
  })

  it('authenticates through OIDC instead of a stored npm token', () => {
    const publishJob = workflow.slice(workflow.indexOf('  publish:'))

    expect(publishJob).toContain('id-token: write')
    expect(workflow).not.toMatch(/secrets\.NPM_TOKEN/)
    expect(workflow).not.toContain('NODE_AUTH_TOKEN: ${{')
    expect(workflow).toContain('NODE_AUTH_TOKEN is set; trusted publishing expects no npm token.')
    expect(workflow).not.toMatch(/^\s*registry-url:/m)
  })

  it('limits registry mutations to the upstream repository', () => {
    expect(workflow).toContain("if: ${{ github.repository == 'MaaXYZ/MaaLogAnalyzer' }}")
  })
})
