import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RELEASE_TARGETS = [
  { artifact: 'windows-x86_64-artifacts', extension: '.msi', prefix: 'windows-x86_64' },
  { artifact: 'macos-x86_64-artifacts', extension: '.dmg', prefix: 'macos-x86_64' },
  { artifact: 'macos-aarch64-artifacts', extension: '.dmg', prefix: 'macos-aarch64' },
  { artifact: 'linux-x86_64-artifacts', extension: '.deb', prefix: 'linux-x86_64' },
]

const collectFiles = (directory) => {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

const sha256 = (path) => {
  const hash = createHash('sha256')
  hash.update(readFileSync(path))
  return hash.digest('hex')
}

export const prepareReleaseAssets = (artifactsRoot, outputDirectory) => {
  const resolvedArtifactsRoot = resolve(artifactsRoot)
  const resolvedOutputDirectory = resolve(outputDirectory)
  const artifactsWithinOutput = relative(resolvedOutputDirectory, resolvedArtifactsRoot)
  if (
    resolvedOutputDirectory === parse(resolvedOutputDirectory).root ||
    (!artifactsWithinOutput.startsWith('..') && !isAbsolute(artifactsWithinOutput))
  ) {
    throw new Error(
      'Release output directory must not be a filesystem root or contain the artifacts directory',
    )
  }

  rmSync(resolvedOutputDirectory, { recursive: true, force: true })
  mkdirSync(resolvedOutputDirectory, { recursive: true })

  const outputs = []
  for (const target of RELEASE_TARGETS) {
    const artifactDirectory = join(resolvedArtifactsRoot, target.artifact)
    const matches = collectFiles(artifactDirectory).filter((path) =>
      path.toLowerCase().endsWith(target.extension),
    )
    if (matches.length !== 1) {
      throw new Error(
        `${target.artifact} must contain exactly one ${target.extension} file; found ${matches.length}`,
      )
    }

    const outputName = `${target.prefix}-${basename(matches[0])}`
    const outputPath = join(resolvedOutputDirectory, outputName)
    copyFileSync(matches[0], outputPath)
    outputs.push({ name: outputName, path: outputPath })
  }

  const checksumLines = outputs.map((output) => `${sha256(output.path)}  ${output.name}`).join('\n')
  writeFileSync(join(resolvedOutputDirectory, 'SHA256SUMS'), `${checksumLines}\n`, 'utf8')
  return outputs.map((output) => output.name)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [artifactsRoot, outputDirectory] = process.argv.slice(2)
  if (!artifactsRoot || !outputDirectory) {
    throw new Error(
      'Usage: node scripts/prepare-release-assets.mjs <artifacts-root> <output-directory>',
    )
  }
  prepareReleaseAssets(artifactsRoot, outputDirectory)
}
