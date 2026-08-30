import { lstat } from 'node:fs/promises'
import path from 'node:path'
import type { FrameworkLogSource } from './frameworkVersion'
import {
  extractInspectedZipEntriesWithinLimits,
  inspectZipDirectory,
  resolveArchiveLimits,
  type ArchiveLimits,
} from './archiveLimits'
import {
  createNodeInputBudgetContext,
  findExistingRegularNodeFile,
  InputFileError,
  readNodeArchiveFileBytes,
  readNodeTextFileContent,
  readNodeTextFilesContent,
  resolveNodeDebugDirectory,
} from './nodeInput'

const MAIN_LOG_NAMES = ['maafw.log', 'maa.log'] as const
const BAK_LOG_NAMES = ['maafw.bak.log', 'maa.bak.log'] as const

export interface LoadFrameworkLogSourcesOptions {
  archiveLimits?: Partial<ArchiveLimits>
}

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
  return (
    paths.find((candidate) => toPosixPath(candidate).toLowerCase() === normalizedTarget) ?? null
  )
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

const loadZipSources = async (
  zipPath: string,
  limits: Readonly<ArchiveLimits>,
): Promise<FrameworkLogSource[]> => {
  const bytes = await readNodeArchiveFileBytes(zipPath, limits)
  const entries = inspectZipDirectory(bytes, limits)
  const paths = entries.map((entry) => entry.name)
  const basePath = findZipBasePath(paths)
  if (basePath == null) return []

  const selected: string[] = []
  for (const name of [...BAK_LOG_NAMES, ...MAIN_LOG_NAMES]) {
    const candidate = findEntryPath(paths, basePath ? `${basePath}/${name}` : name)
    if (candidate && !selected.includes(candidate)) selected.push(candidate)
    if (candidate && MAIN_LOG_NAMES.includes(name as (typeof MAIN_LOG_NAMES)[number])) break
  }

  const selectedPaths = new Set(selected)
  const { files } = extractInspectedZipEntriesWithinLimits(
    bytes,
    entries,
    (entryPath) => selectedPaths.has(entryPath),
    limits,
  )

  return selected.flatMap((entryPath) => {
    const bytes = files[entryPath]
    if (!bytes) return []
    const normalized = toPosixPath(entryPath)
    return [
      {
        path: normalized,
        name: path.posix.basename(normalized),
        content: decodeBytes(bytes),
        reference: `zip:${toPosixPath(zipPath)}#${normalized}`,
      },
    ]
  })
}

const loadDirectorySources = async (
  directoryPath: string,
  limits: Readonly<ArchiveLimits>,
): Promise<FrameworkLogSource[]> => {
  const context = await createNodeInputBudgetContext(directoryPath, limits)
  const debugPath = await resolveNodeDebugDirectory(directoryPath, context)
  if (!debugPath) return []
  const selected = [
    await findExistingRegularNodeFile(context, debugPath, BAK_LOG_NAMES),
    await findExistingRegularNodeFile(context, debugPath, MAIN_LOG_NAMES),
  ].filter((candidate): candidate is string => candidate != null)

  const contents = await readNodeTextFilesContent(selected, {
    archiveLimits: limits,
    budgetContext: context,
  })
  return selected.map((absolutePath, index) => ({
    path: toPosixPath(path.relative(debugPath, absolutePath)),
    name: path.basename(absolutePath),
    content: contents[index] ?? '',
    reference: `file:${toPosixPath(absolutePath)}`,
  }))
}

export const loadFrameworkLogSources = async (
  targetPath: string,
  options: LoadFrameworkLogSourcesOptions = {},
): Promise<FrameworkLogSource[]> => {
  const limits = resolveArchiveLimits(options.archiveLimits)
  const targetStat = await lstat(targetPath)
  if (targetStat.isSymbolicLink()) {
    throw new InputFileError(
      'symlink',
      targetPath,
      `Symbolic-link inputs are not allowed: ${targetPath}`,
    )
  }
  if (targetStat.isDirectory()) return loadDirectorySources(targetPath, limits)
  if (!targetStat.isFile()) {
    throw new InputFileError(
      'not-regular-file',
      targetPath,
      `Expected a regular file: ${targetPath}`,
    )
  }
  if (targetPath.toLowerCase().endsWith('.zip')) return loadZipSources(targetPath, limits)
  return [
    {
      path: toPosixPath(targetPath),
      name: path.basename(targetPath),
      content: await readNodeTextFileContent(targetPath, { archiveLimits: limits }),
      reference: `file:${toPosixPath(targetPath)}`,
    },
  ]
}
