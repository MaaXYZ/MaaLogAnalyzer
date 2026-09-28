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
  collectNodeCoreLogPaths,
  createNodeInputBudgetContext,
  InputFileError,
  readNodeArchiveFileBytes,
  readNodeTextFileContent,
  readNodeTextFilesContent,
  resolveNodeDebugDirectory,
  selectPrimaryLogGroup,
} from './nodeInput'

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


const loadZipSources = async (
  zipPath: string,
  limits: Readonly<ArchiveLimits>,
): Promise<FrameworkLogSource[]> => {
  const bytes = await readNodeArchiveFileBytes(zipPath, limits)
  const entries = inspectZipDirectory(bytes, limits)
  const paths = entries.map((entry) => entry.name)
  // 版本探测沿用「一个备份 + 一个主日志（maafw 优先）」的老规则，只是备份侧现在也包含
  // *.bak.<时间戳>.log 轮转片段；只有轮转片段的压缩包同样能选出这一组，而不是返回空。
  const group = selectPrimaryLogGroup(paths, { singleMain: true })
  if (!group) return []

  const selectedPaths = new Set(group.paths)
  const { files } = extractInspectedZipEntriesWithinLimits(
    bytes,
    entries,
    (entryPath) => selectedPaths.has(entryPath),
    limits,
  )

  return group.paths.flatMap((entryPath) => {
    const data = files[entryPath]
    if (!data) return []
    const normalized = toPosixPath(entryPath)
    return [
      {
        path: normalized,
        name: path.posix.basename(normalized),
        content: decodeBytes(data),
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
  const selected =
    selectPrimaryLogGroup(await collectNodeCoreLogPaths(debugPath, context), {
      singleMain: true,
    })?.paths ?? []

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
