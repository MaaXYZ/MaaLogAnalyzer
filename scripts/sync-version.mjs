import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const readText = (rootDir, relativePath) => {
  return readFileSync(resolve(rootDir, relativePath), 'utf8')
}

const updateJsonVersion = (content, version, updateLockRoot = false) => {
  const parsed = JSON.parse(content)
  if (typeof parsed.version !== 'string') {
    throw new Error('JSON manifest is missing a top-level version')
  }
  let updated = content.replace(
    /("version"\s*:\s*")[^"]+(")/,
    (_match, prefix, suffix) => `${prefix}${version}${suffix}`,
  )
  if (updateLockRoot) {
    if (!parsed.packages || typeof parsed.packages !== 'object' || !parsed.packages['']) {
      throw new Error('src-vscode/package-lock.json is missing packages[""]')
    }
    updated = updated.replace(
      /("packages"\s*:\s*\{\s*""\s*:\s*\{[\s\S]*?"version"\s*:\s*")[^"]+(")/,
      (_match, prefix, suffix) => `${prefix}${version}${suffix}`,
    )
  }
  const result = JSON.parse(updated)
  if (result.version !== version || (updateLockRoot && result.packages[''].version !== version)) {
    throw new Error('Failed to update JSON manifest version')
  }
  return updated
}

const replaceExactlyOnce = (content, pattern, replacement, fileName) => {
  const matches = content.match(
    new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`),
  )
  if (matches?.length !== 1) {
    throw new Error(
      `${fileName} must contain exactly one version target; found ${matches?.length ?? 0}`,
    )
  }
  return content.replace(pattern, replacement)
}

export const isValidReleaseVersion = (version) => SEMVER_PATTERN.test(version)

export const collectVersionUpdates = (rootDir, version) => {
  if (!isValidReleaseVersion(version)) {
    throw new Error(`Invalid semantic version: ${version}`)
  }

  const updates = new Map()
  const rootPackage = 'package.json'
  const vscodePackage = 'src-vscode/package.json'
  const vscodeLock = 'src-vscode/package-lock.json'
  const tauriConfig = 'src-tauri/tauri.conf.json'
  const cargoManifest = 'src-tauri/Cargo.toml'
  const cargoLock = 'src-tauri/Cargo.lock'

  updates.set(rootPackage, updateJsonVersion(readText(rootDir, rootPackage), version))
  updates.set(vscodePackage, updateJsonVersion(readText(rootDir, vscodePackage), version))
  updates.set(vscodeLock, updateJsonVersion(readText(rootDir, vscodeLock), version, true))
  updates.set(tauriConfig, updateJsonVersion(readText(rootDir, tauriConfig), version))
  updates.set(
    cargoManifest,
    replaceExactlyOnce(
      readText(rootDir, cargoManifest),
      /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
      (_match, prefix, suffix) => `${prefix}${version}${suffix}`,
      cargoManifest,
    ),
  )
  updates.set(
    cargoLock,
    replaceExactlyOnce(
      readText(rootDir, cargoLock),
      /(\[\[package\]\]\r?\nname = "maa-log-analyzer"\r?\nversion = ")[^"]+(")/,
      (_match, prefix, suffix) => `${prefix}${version}${suffix}`,
      cargoLock,
    ),
  )

  return updates
}

export const syncVersion = ({ rootDir, version, check = false }) => {
  const updates = collectVersionUpdates(rootDir, version)
  const changed = []

  for (const [relativePath, nextContent] of updates) {
    const currentContent = readText(rootDir, relativePath)
    if (currentContent === nextContent) continue
    changed.push(relativePath)
    if (!check) {
      writeFileSync(resolve(rootDir, relativePath), nextContent, 'utf8')
    }
  }

  if (check && changed.length > 0) {
    throw new Error(`Version ${version} is not synchronized in: ${changed.join(', ')}`)
  }
  return changed
}

const isMainModule =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const positional = args.filter((arg) => !arg.startsWith('--'))
  if (positional.length > 1) {
    throw new Error('Usage: node scripts/sync-version.mjs [version] [--check]')
  }

  const rootDir = resolve(import.meta.dirname, '..')
  const rootPackage = JSON.parse(readText(rootDir, 'package.json'))
  const version = positional[0] || process.env.npm_package_version || rootPackage.version
  const changed = syncVersion({ rootDir, version, check })
  process.stdout.write(
    check
      ? `Version ${version} is synchronized.\n`
      : `Synchronized version ${version} in ${changed.length} file(s).\n`,
  )
}
