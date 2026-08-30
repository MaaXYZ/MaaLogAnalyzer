import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isValidReleaseVersion } from '../../../scripts/sync-version.mjs'

const readWorkflow = (name: string): string =>
  readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), 'utf8')

const extractRunBlocks = (workflow: string): string[] => {
  const lines = workflow.split(/\r?\n/)
  const blocks: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*\|\s*$/.exec(lines[index] ?? '')
    if (!match) continue

    const indentation = match[1]!.length
    const block: string[] = []
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      if (line.trim() && line.length - line.trimStart().length <= indentation) {
        index -= 1
        break
      }
      block.push(line)
    }
    blocks.push(block.join('\n'))
  }

  return blocks
}

describe('release workflow shell safety', () => {
  it.each(['build.yml', 'release-vscode.yml'])(
    'does not inject refs into run blocks in %s',
    (name) => {
      const runScripts = extractRunBlocks(readWorkflow(name)).join('\n')

      expect(runScripts).not.toContain('${{ github.ref }}')
      expect(runScripts).not.toContain('${{ github.ref_name }}')
      expect(runScripts).toContain('GITHUB_REF')
    },
  )

  it('delegates manifest updates and tag validation to the shared version command', () => {
    const workflows = [
      readWorkflow('build.yml'),
      readWorkflow('release-vscode.yml'),
      readWorkflow('deploy.yml'),
    ].join('\n')

    expect(workflows.match(/pnpm run version --/g)).toHaveLength(5)
    expect(workflows).not.toContain('npm pkg set')
    expect(workflows).not.toMatch(/sed -i.*version/)
    expect(['3.5.0', '3.5.0-rc.1', '3.5.0+build.7'].every(isValidReleaseVersion)).toBe(true)
    expect(
      ['1.2.3;id', '1.2.3$(id)', '1.2.3";whoami;#', 'main'].every(
        (version) => !isValidReleaseVersion(version),
      ),
    ).toBe(true)
  })

  it('creates desktop releases only for version tags', () => {
    const workflow = readWorkflow('build.yml')
    expect(workflow).toMatch(
      /\n {2}release:\r?\n {4}if: startsWith\(github\.ref, 'refs\/tags\/v'\)/,
    )
    expect(workflow).toContain("prerelease: ${{ contains(github.ref_name, '-') }}")
    expect(workflow).not.toContain('prerelease: false')
    expect(workflow).toContain('node scripts/prepare-release-assets.mjs artifacts release-assets')
    expect(workflow).toContain('files: release-assets/*')
  })

  it('uses lock files and the local VS Code packaging toolchain', () => {
    const workflow = readWorkflow('release-vscode.yml')

    expect(workflow).toContain('pnpm install --frozen-lockfile')
    expect(workflow.match(/npm ci/g)).toHaveLength(2)
    expect(workflow.match(/npm exec -- vsce/g)).toHaveLength(2)
    expect(workflow).not.toMatch(/npm (?:i|install) -g/)
    expect(workflow).not.toMatch(/^\s*vsce\s/m)
  })

  it('publishes VS Code packages only for stable version tags', () => {
    const workflow = readWorkflow('release-vscode.yml')

    expect(workflow).toContain(
      "if: ${{ !startsWith(github.ref, 'refs/tags/v') || !contains(github.ref_name, '-') }}",
    )
    expect(workflow).toContain(
      "if: startsWith(github.ref, 'refs/tags/v') && !contains(github.ref_name, '-')",
    )
  })
})
