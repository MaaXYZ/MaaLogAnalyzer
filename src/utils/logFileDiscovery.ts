import type { ParseSourceInput } from '@windsland52/maa-log-parser'
import type { LogParseSourceInput } from './logInputSource'

export const PRIMARY_LOG_FILE_HINT = 'maa.log / maa.bak*.log / maafw.log / maafw.bak*.log'

export type PrimaryLogKind = 'main' | 'bak'
export type PrimaryLogFamily = 'maa' | 'maafw'

export interface PrimaryLogCandidate {
  path: string
  normalizedPath: string
  dirPath: string
  fileName: string
  normalizedName: string
  kind: PrimaryLogKind
  family: PrimaryLogFamily
  rotatedTimestampHint: string | null
}

export interface PrimaryLogSourceEntry {
  path: string
  name: string
}

export interface LoadedPrimaryLogFile extends PrimaryLogSourceEntry {
  content: string
  loadContent?: never
}

export interface BytePrimaryLogFile extends PrimaryLogSourceEntry {
  bytes: Uint8Array
  loadContent: () => Promise<string>
}

export interface FilePrimaryLogFile extends PrimaryLogSourceEntry {
  file: File
  loadContent: () => Promise<string>
}

export interface LoadablePrimaryLogFile extends PrimaryLogSourceEntry {
  loadBytes: () => Promise<Uint8Array>
  loadContent: () => Promise<string>
}

export type PrimaryLogFile =
  LoadedPrimaryLogFile | BytePrimaryLogFile | FilePrimaryLogFile | LoadablePrimaryLogFile

export interface PrimaryLogSelectionOption extends PrimaryLogSourceEntry {
  kind: PrimaryLogKind
  family: PrimaryLogFamily
  rotatedTimestampHint: string | null
  selected: boolean
}

export interface MatchedPrimaryLogEntry<T extends PrimaryLogSourceEntry> {
  item: T
  candidate: PrimaryLogCandidate
}

const MAIN_LOG_RE = /^(maa|maafw)\.log$/i
const BAK_LOG_RE =
  /^(maa|maafw)\.bak(?:\.(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}\.\d{1,3}))?\.log$/i
const CONTENT_TIMESTAMP_RE = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{1,3})\]/

const toPosixPath = (value: string): string => value.replace(/\\/g, '/')

const getBaseName = (value: string): string => {
  const normalized = toPosixPath(value)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
}

const getDirName = (value: string): string => {
  const normalized = toPosixPath(value)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : ''
}

const normalizeTimestampMilliseconds = (value: string): string => {
  const lastDot = value.lastIndexOf('.')
  if (lastDot < 0) return value
  const ms = value.slice(lastDot + 1)
  if (!/^\d{1,3}$/.test(ms)) return value
  return `${value.slice(0, lastDot)}.${ms.padEnd(3, '0')}`
}

const compareNullableAscending = (a: string | null, b: string | null): number => {
  if (a && b) return a.localeCompare(b)
  if (a) return -1
  if (b) return 1
  return 0
}

const groupDepth = (dirPath: string): number => {
  if (!dirPath) return 0
  return dirPath.split('/').filter(Boolean).length
}

export const isMainLogFileName = (name: string): boolean => MAIN_LOG_RE.test(name.trim())

export const isBakLogFileName = (name: string): boolean => BAK_LOG_RE.test(name.trim())

export const isPrimaryLogFileName = (name: string): boolean => {
  const trimmed = name.trim()
  return isMainLogFileName(trimmed) || isBakLogFileName(trimmed)
}

export const matchPrimaryLogFile = (
  rawPath: string,
  rawName?: string,
): PrimaryLogCandidate | null => {
  const normalizedPath = toPosixPath(rawPath)
  const fileName = rawName ?? getBaseName(normalizedPath)
  const normalizedName = fileName.trim().toLowerCase()

  const mainMatch = normalizedName.match(MAIN_LOG_RE)
  if (mainMatch) {
    return {
      path: rawPath,
      normalizedPath,
      dirPath: getDirName(normalizedPath),
      fileName,
      normalizedName,
      kind: 'main',
      family: mainMatch[1] as PrimaryLogFamily,
      rotatedTimestampHint: null,
    }
  }

  const bakMatch = normalizedName.match(BAK_LOG_RE)
  if (!bakMatch) return null

  return {
    path: rawPath,
    normalizedPath,
    dirPath: getDirName(normalizedPath),
    fileName,
    normalizedName,
    kind: 'bak',
    family: bakMatch[1] as PrimaryLogFamily,
    rotatedTimestampHint: bakMatch[2] ? normalizeTimestampMilliseconds(bakMatch[2]) : null,
  }
}

export const extractFirstLogTimestamp = (content: string): string | null => {
  const match = content.match(CONTENT_TIMESTAMP_RE)
  return match ? normalizeTimestampMilliseconds(match[1]) : null
}

export const selectPrimaryLogGroup = <T extends PrimaryLogSourceEntry>(
  entries: Iterable<T>,
): MatchedPrimaryLogEntry<T>[] => {
  const groups = new Map<string, MatchedPrimaryLogEntry<T>[]>()

  for (const item of entries) {
    const candidate = matchPrimaryLogFile(item.path, item.name)
    if (!candidate) continue
    const bucket = groups.get(candidate.dirPath) ?? []
    bucket.push({ item, candidate })
    groups.set(candidate.dirPath, bucket)
  }

  const rankedGroups = Array.from(groups.entries()).map(([dirPath, group]) => {
    const mainCount = group.filter((entry) => entry.candidate.kind === 'main').length
    return {
      dirPath,
      group,
      hasMain: mainCount > 0,
      mainCount,
      count: group.length,
      depth: groupDepth(dirPath),
    }
  })

  rankedGroups.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth
    if (a.hasMain !== b.hasMain) return a.hasMain ? -1 : 1
    if (a.mainCount !== b.mainCount) return b.mainCount - a.mainCount
    if (a.count !== b.count) return b.count - a.count
    return a.dirPath.localeCompare(b.dirPath)
  })

  return rankedGroups[0]?.group ?? []
}

export const sortPrimaryLogSelectionOptions = (
  options: PrimaryLogSelectionOption[],
): PrimaryLogSelectionOption[] => {
  return [...options].sort((a, b) => {
    const chronoDelta = compareNullableAscending(a.rotatedTimestampHint, b.rotatedTimestampHint)
    if (chronoDelta !== 0) return chronoDelta

    if (a.kind !== b.kind) return a.kind === 'bak' ? -1 : 1
    return toPosixPath(a.path).localeCompare(toPosixPath(b.path))
  })
}

export const createPrimaryLogSelectionOptions = <T extends PrimaryLogSourceEntry>(
  entries: Iterable<T>,
): PrimaryLogSelectionOption[] => {
  const options = selectPrimaryLogGroup(entries).map(({ item, candidate }) => ({
    path: item.path,
    name: item.name,
    kind: candidate.kind,
    family: candidate.family,
    rotatedTimestampHint: candidate.rotatedTimestampHint,
    selected: true,
  }))
  return sortPrimaryLogSelectionOptions(options)
}

export const sortLoadedPrimaryLogSegments = <T extends PrimaryLogSourceEntry & { content: string }>(
  entries: Iterable<T>,
): T[] => {
  return Array.from(entries)
    .map((item) => {
      const candidate = matchPrimaryLogFile(item.path, item.name)
      return {
        item,
        normalizedPath: candidate?.normalizedPath ?? toPosixPath(item.path),
        kind: candidate?.kind ?? 'main',
        rotatedTimestampHint: candidate?.rotatedTimestampHint ?? null,
        contentTimestamp: extractFirstLogTimestamp(item.content),
      }
    })
    .sort((a, b) => {
      const aChronoHint = a.contentTimestamp ?? a.rotatedTimestampHint
      const bChronoHint = b.contentTimestamp ?? b.rotatedTimestampHint
      const chronoDelta = compareNullableAscending(aChronoHint, bChronoHint)
      if (chronoDelta !== 0) return chronoDelta

      const contentDelta = compareNullableAscending(a.contentTimestamp, b.contentTimestamp)
      if (contentDelta !== 0) return contentDelta

      if (a.kind !== b.kind) return a.kind === 'bak' ? -1 : 1
      return a.normalizedPath.localeCompare(b.normalizedPath)
    })
    .map(({ item }) => item)
}

export const sortPrimaryLogParseInputs = (
  inputs: readonly ParseSourceInput[],
): ParseSourceInput[] => {
  const sortable = inputs.map((input, index) => ({
    input,
    path: input.sourcePath ?? input.sourceKey ?? `primary-log:${index}`,
    name:
      (input.sourcePath ?? input.sourceKey ?? `primary-log:${index}`)
        .replace(/\\/g, '/')
        .split('/')
        .pop() ?? `primary-log:${index}`,
    content: input.content,
  }))
  return sortLoadedPrimaryLogSegments(sortable).map(({ input }, index) => ({
    ...input,
    inputIndex: index,
  }))
}

export const combineLoadedPrimaryLogSegments = <
  T extends PrimaryLogSourceEntry & { content: string },
>(
  entries: Iterable<T>,
): string => {
  let combined = ''
  for (const entry of sortLoadedPrimaryLogSegments(entries)) {
    if (!entry.content) continue
    if (combined && !combined.endsWith('\n')) {
      combined += '\n'
    }
    combined += entry.content
  }
  return combined
}

export const createPrimaryLogParseInputs = <T extends PrimaryLogFile>(
  entries: Iterable<T>,
): LogParseSourceInput[] => {
  const sourceEntries = Array.from(entries)
  const orderedEntries = sourceEntries.every(
    (entry): entry is T & LoadedPrimaryLogFile => 'content' in entry,
  )
    ? sortLoadedPrimaryLogSegments(sourceEntries)
    : sourceEntries

  return orderedEntries.map((entry, index) => {
    const metadata = {
      sourceKey: entry.path || entry.name || `primary-log:${index}`,
      sourcePath: entry.path,
      inputIndex: index,
    }
    if ('content' in entry) return { ...metadata, content: entry.content }
    if ('bytes' in entry) return { ...metadata, bytes: entry.bytes }
    if ('file' in entry) return { ...metadata, file: entry.file }
    return { ...metadata, loadBytes: entry.loadBytes }
  })
}

export const getPrimaryLogContentLoader = (entry: PrimaryLogFile): (() => Promise<string>) => {
  if ('loadContent' in entry && entry.loadContent) return entry.loadContent
  return async () => entry.content
}
