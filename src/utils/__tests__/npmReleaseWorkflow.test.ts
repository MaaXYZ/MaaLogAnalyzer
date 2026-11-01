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

  // OIDC 交换失败是静默的（npm 的 oidc() 从不抛错，只在 verbose 级别记录原因），
  // 不给 verbose 的话线上只能看到一个没有原因的 ENEEDAUTH。
  it('publishes with verbose logging so a rejected OIDC exchange is diagnosable', () => {
    const publish = step('Publish release tarballs')

    expect(publish).toContain('--loglevel verbose')
  })

  // 每个包是独立的一次发布：一个包配错 trusted publishing 不能连带吞掉后面所有包
  // （出现过 adapter 发成功、kernel 失败后 parser/runtime/tools 完全没被尝试）。
  // 发布顺序必须自底向上：adapter 精确钉住 parser，若先发 adapter 再挂掉，
  // 线上会留下一个依赖未发布版本的包，消费者的 `npm i` 直接坏掉。
  it('publishes in dependency order so a partial run leaves only a consistent prefix', () => {
    const publish = step('Publish release tarballs')
    const order = [
      '*maa-log-kernel-*',
      '*maa-log-parser-*',
      '*maa-log-runtime-*',
      '*maa-log-adapter-*',
      '*maa-log-tools-*',
    ].map((pattern) => publish.indexOf(pattern))

    expect(publish).toContain('order_key()')
    for (const index of order) expect(index).toBeGreaterThan(-1)
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i], `${order[i - 1]} 应排在 ${order[i]} 之前`).toBeGreaterThan(order[i - 1])
    }
  })

  it('keeps publishing after a failure and reports every failed package at the end', () => {
    const publish = step('Publish release tarballs')

    expect(publish).toContain('if npm publish "${tarball}"')
    expect(publish).toContain('failed_refs+=("${package_ref}")')
    expect(publish).toContain('Failed to publish: ${failed_refs[*]}')
    expect(publish).toMatch(/Trusted publishing is configured per package/)
    expect(publish).toContain('exit 1')
  })
})
