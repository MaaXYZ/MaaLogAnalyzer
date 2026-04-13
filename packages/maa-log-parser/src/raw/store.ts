export interface RawLineSource {
  sourceKey: string
  sourcePath?: string
  inputIndex: number
  lines: string[]
}

export interface RawLineRef {
  sourceKey: string
  line: number
}

export interface RawLineRecord extends RawLineRef {
  text: string
}

export interface RawLineStore {
  sources: Map<string, RawLineSource>
}

export interface RawLineQueryOptions {
  sourceKey?: string
  lineStart?: number
  lineEnd?: number
  keywords?: string[]
  limit?: number
}

const sortSources = (sources: Iterable<RawLineSource>): RawLineSource[] => {
  return [...sources].sort((left, right) => {
    if (left.inputIndex !== right.inputIndex) {
      return left.inputIndex - right.inputIndex
    }
    return left.sourceKey.localeCompare(right.sourceKey)
  })
}

const matchesLineFilters = (
  text: string,
  line: number,
  options: RawLineQueryOptions,
): boolean => {
  if (options.lineStart != null && line < options.lineStart) return false
  if (options.lineEnd != null && line > options.lineEnd) return false
  if (options.keywords && options.keywords.length > 0) {
    return options.keywords.every((keyword) => text.includes(keyword))
  }
  return true
}

export const createRawLineStore = (): RawLineStore => ({
  sources: new Map(),
})

export const cloneRawLineStore = (
  store: RawLineStore | null | undefined,
): RawLineStore | null => {
  if (!store) return null

  const cloned = createRawLineStore()
  for (const source of store.sources.values()) {
    cloned.sources.set(source.sourceKey, {
      sourceKey: source.sourceKey,
      sourcePath: source.sourcePath,
      inputIndex: source.inputIndex,
      lines: source.lines.slice(),
    })
  }
  return cloned
}

export const setRawLineSource = (
  store: RawLineStore,
  source: RawLineSource,
): RawLineSource => {
  const normalized: RawLineSource = {
    sourceKey: source.sourceKey,
    sourcePath: source.sourcePath,
    inputIndex: source.inputIndex,
    lines: source.lines.slice(),
  }
  store.sources.set(normalized.sourceKey, normalized)
  return normalized
}

export const appendRawLineSourceLines = (
  store: RawLineStore,
  source: Omit<RawLineSource, 'lines'>,
  lines: string[],
): RawLineSource => {
  const existing = store.sources.get(source.sourceKey)
  if (!existing) {
    return setRawLineSource(store, {
      ...source,
      lines,
    })
  }

  existing.sourcePath = source.sourcePath ?? existing.sourcePath
  existing.inputIndex = source.inputIndex
  existing.lines.push(...lines)
  return existing
}

export const getRawLineSource = (
  store: RawLineStore | null | undefined,
  sourceKey: string,
): RawLineSource | null => {
  if (!store) return null
  return store.sources.get(sourceKey) ?? null
}

export const getRawLine = (
  store: RawLineStore | null | undefined,
  ref: RawLineRef,
): RawLineRecord | null => {
  const source = getRawLineSource(store, ref.sourceKey)
  if (!source) return null
  if (ref.line <= 0 || ref.line > source.lines.length) return null
  return {
    sourceKey: ref.sourceKey,
    line: ref.line,
    text: source.lines[ref.line - 1] ?? '',
  }
}

export const getRawLinesByRefs = (
  store: RawLineStore | null | undefined,
  refs: Iterable<RawLineRef>,
  limit?: number,
): RawLineRecord[] => {
  if (!store) return []

  const deduped = new Map<string, RawLineRef>()
  for (const ref of refs) {
    if (!ref.sourceKey || ref.line <= 0) continue
    deduped.set(`${ref.sourceKey}:${ref.line}`, ref)
  }

  const records = [...deduped.values()]
    .map((ref) => getRawLine(store, ref))
    .filter((record): record is RawLineRecord => record != null)
    .sort((left, right) => {
      const leftSource = store.sources.get(left.sourceKey)
      const rightSource = store.sources.get(right.sourceKey)
      const leftIndex = leftSource?.inputIndex ?? Number.MAX_SAFE_INTEGER
      const rightIndex = rightSource?.inputIndex ?? Number.MAX_SAFE_INTEGER
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }
      if (left.sourceKey !== right.sourceKey) {
        return left.sourceKey.localeCompare(right.sourceKey)
      }
      return left.line - right.line
    })

  return limit != null && limit >= 0 ? records.slice(0, limit) : records
}

export const queryRawLines = (
  store: RawLineStore | null | undefined,
  options: RawLineQueryOptions = {},
): RawLineRecord[] => {
  if (!store) return []

  const sources = options.sourceKey
    ? [store.sources.get(options.sourceKey)].filter((value): value is RawLineSource => value != null)
    : sortSources(store.sources.values())

  const lines: RawLineRecord[] = []
  for (const source of sources) {
    for (let index = 0; index < source.lines.length; index += 1) {
      const line = index + 1
      const text = source.lines[index] ?? ''
      if (!matchesLineFilters(text, line, options)) continue
      lines.push({
        sourceKey: source.sourceKey,
        line,
        text,
      })
      if (options.limit != null && options.limit >= 0 && lines.length >= options.limit) {
        return lines
      }
    }
  }

  return lines
}
