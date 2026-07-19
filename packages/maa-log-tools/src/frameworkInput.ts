import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'
import type { FrameworkLogSource } from './frameworkVersion'
import { readNodeTextFileContent } from './nodeInput'

const MAIN_LOG_NAMES = ['maafw.log', 'maa.log'] as const
const BAK_LOG_NAMES = ['maafw.bak.log', 'maa.bak.log'] as const

const toPosixPath = (value: string): string => value.replace(/\\/g, '/')

const decodeBytes = (bytes: Uint8Array): string => {
  for (const encoding of ['utf-8', 'gbk', 'gb18030', 'gb2312']) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes)
    } catch {
      continue
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}

const findEntryPath = (paths: string[], target: string): string | null => {
  const normalizedTarget = toPosixPath(target).toLowerCase()
  return paths.find((candidate) => toPosixPath(candidate).toLowerCase() === normalizedTarget) ?? null
}

const findZipBasePath = (paths: string[]): string | null => {
  for (const candidate of paths) {
    const normalized = toPosixPath(candidate)
    const lowerName = path.posix.basename(normalized).toLowerCase()
    if (!MAIN_LOG_NAMES.includes(lowerName as (typeof MAIN_LOG_NAMES)[number])) continue
    const parent = path.posix.dirname(normalized)
    return parent === '.' ? '' : parent
  }
  return null
}

const loadZipSources = async (zipPath: string): Promise<FrameworkLogSource[]> => {
  const files = unzipSync(new Uint8Array(await readFile(zipPath)))
  const paths = Object.keys(files)
  const basePath = findZipBasePath(paths)
  if (basePath == null) return []

  const selected: string[] = []
  for (const name of [...BAK_LOG_NAMES, ...MAIN_LOG_NAMES]) {
    const candidate = findEntryPath(paths, basePath ? `${basePath}/${name}` : name)
    if (candidate && !selected.includes(candidate)) selected.push(candidate)
    if (candidate && MAIN_LOG_NAMES.includes(name as (typeof MAIN_LOG_NAMES)[number])) break
  }

  return selected.flatMap((entryPath) => {
    const bytes = files[entryPath]
    if (!bytes) return []
    const normalized = toPosixPath(entryPath)
    return [{
      path: normalized,
      name: path.posix.basename(normalized),
      content: decodeBytes(bytes),
      reference: `zip:${toPosixPath(zipPath)}#${normalized}`,
    }]
  })
}

const pathExists = async (candidate: string): Promise<boolean> => {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

const findDebugDirectory = async (root: string): Promise<string | null> => {
  for (const name of MAIN_LOG_NAMES) {
    if (await pathExists(path.join(root, name))) return root
  }
  const directDebug = path.join(root, 'debug')
  for (const name of MAIN_LOG_NAMES) {
    if (await pathExists(path.join(directDebug, name))) return directDebug
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const found = await findDebugDirectory(path.join(root, entry.name))
    if (found) return found
  }
  return null
}

const firstExisting = async (root: string, names: readonly string[]): Promise<string | null> => {
  for (const name of names) {
    const candidate = path.join(root, name)
    if (await pathExists(candidate)) return candidate
  }
  return null
}

const loadDirectorySources = async (directoryPath: string): Promise<FrameworkLogSource[]> => {
  const debugPath = await findDebugDirectory(directoryPath)
  if (!debugPath) return []
  const selected = [
    await firstExisting(debugPath, BAK_LOG_NAMES),
    await firstExisting(debugPath, MAIN_LOG_NAMES),
  ].filter((candidate): candidate is string => candidate != null)

  return Promise.all(selected.map(async (absolutePath) => ({
    path: toPosixPath(path.relative(debugPath, absolutePath)),
    name: path.basename(absolutePath),
    content: await readNodeTextFileContent(absolutePath),
    reference: `file:${toPosixPath(absolutePath)}`,
  })))
}

export const loadFrameworkLogSources = async (
  targetPath: string,
): Promise<FrameworkLogSource[]> => {
  const targetStat = await stat(targetPath)
  if (targetStat.isDirectory()) return loadDirectorySources(targetPath)
  if (targetPath.toLowerCase().endsWith('.zip')) return loadZipSources(targetPath)
  return [{
    path: toPosixPath(targetPath),
    name: path.basename(targetPath),
    content: await readNodeTextFileContent(targetPath),
    reference: `file:${toPosixPath(targetPath)}`,
  }]
}
