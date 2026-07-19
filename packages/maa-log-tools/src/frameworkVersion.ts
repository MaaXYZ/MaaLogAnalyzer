export interface FrameworkLogSource {
  path: string
  name: string
  content: string
  reference: string
}

export interface FrameworkLogPosition {
  source: string
  path: string
  line: number
  timestamp: string | null
}

export interface FrameworkVersionEvidence extends FrameworkLogPosition {
  version: string
}

export interface FrameworkSession {
  sessionId: string
  startKind: 'process_start' | 'partial_file'
  status: 'resolved' | 'missing_version' | 'conflict'
  version: string | null
  versions: string[]
  start: FrameworkLogPosition
  end: FrameworkLogPosition
  versionEvidence: FrameworkVersionEvidence[]
}

export interface FrameworkVersionSummary {
  status: 'none' | 'single' | 'multiple' | 'conflict'
  versions: string[]
}

export interface FrameworkSessionExtraction {
  sessions: FrameworkSession[]
  summary: FrameworkVersionSummary
  warnings: string[]
}

const PROCESS_START_PATTERN = /\]\[Logger\]\s+MAA Process Start(?:\s|$)/
const VERSION_PATTERN = /\]\[Logger\]\s+Version\s+(v\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/
const TIMESTAMP_PATTERN = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]/

const splitLines = (content: string): string[] => {
  const lines = content.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

const timestampOf = (line: string | undefined): string | null => {
  if (!line) return null
  return line.match(TIMESTAMP_PATTERN)?.[1] ?? null
}

const position = (
  source: FrameworkLogSource,
  lines: string[],
  lineIndex: number,
): FrameworkLogPosition => ({
  source: source.reference,
  path: source.path,
  line: lineIndex + 1,
  timestamp: timestampOf(lines[lineIndex]),
})

const findTimestamp = (
  lines: string[],
  startIndex: number,
  endIndex: number,
  direction: 1 | -1,
): string | null => {
  for (
    let index = direction === 1 ? startIndex : endIndex;
    index >= startIndex && index <= endIndex;
    index += direction
  ) {
    const timestamp = timestampOf(lines[index])
    if (timestamp) return timestamp
  }
  return null
}

const buildSession = (
  source: FrameworkLogSource,
  lines: string[],
  startIndex: number,
  endIndex: number,
  startKind: FrameworkSession['startKind'],
  sessionIndex: number,
): FrameworkSession => {
  const versionEvidence: FrameworkVersionEvidence[] = []
  for (let index = startIndex; index <= endIndex; index += 1) {
    const match = lines[index]?.match(VERSION_PATTERN)
    const version = match?.[1]
    if (!version) continue
    versionEvidence.push({
      ...position(source, lines, index),
      version,
    })
  }

  const versions = [...new Set(versionEvidence.map((item) => item.version))]
  const status: FrameworkSession['status'] = versions.length === 0
    ? 'missing_version'
    : versions.length === 1
      ? 'resolved'
      : 'conflict'
  const start = position(source, lines, startIndex)
  start.timestamp = findTimestamp(lines, startIndex, endIndex, 1)
  const end = position(source, lines, endIndex)
  end.timestamp = findTimestamp(lines, startIndex, endIndex, -1)

  return {
    sessionId: `framework-session-${sessionIndex}`,
    startKind,
    status,
    version: status === 'resolved' ? (versions[0] ?? null) : null,
    versions,
    start,
    end,
    versionEvidence,
  }
}

export const extractFrameworkSessions = (
  sources: readonly FrameworkLogSource[],
): FrameworkSessionExtraction => {
  const sessions: FrameworkSession[] = []

  for (const source of sources) {
    const lines = splitLines(source.content)
    if (lines.length === 0) continue

    const processStarts: number[] = []
    for (let index = 0; index < lines.length; index += 1) {
      if (PROCESS_START_PATTERN.test(lines[index] ?? '')) processStarts.push(index)
    }

    const firstProcessStart = processStarts[0]
    const hasPartialPrefix = firstProcessStart != null
      && firstProcessStart > 0
      && lines.slice(0, firstProcessStart).some((line) => (
        VERSION_PATTERN.test(line) || line.includes('!!!OnEventNotify!!!')
      ))
    const boundaries = processStarts.length === 0 || hasPartialPrefix
      ? [0, ...processStarts]
      : processStarts
    for (let index = 0; index < boundaries.length; index += 1) {
      const startIndex = boundaries[index]
      if (startIndex == null) continue
      const nextStart = boundaries[index + 1]
      const endIndex = nextStart == null ? lines.length - 1 : nextStart - 1
      const isProcessStart = processStarts.includes(startIndex)
      sessions.push(buildSession(
        source,
        lines,
        startIndex,
        endIndex,
        isProcessStart ? 'process_start' : 'partial_file',
        sessions.length + 1,
      ))
    }
  }

  const versions = [...new Set(sessions.flatMap((session) => session.versions))]
  const hasConflict = sessions.some((session) => session.status === 'conflict')
  const summary: FrameworkVersionSummary = {
    status: hasConflict
      ? 'conflict'
      : versions.length === 0
        ? 'none'
        : versions.length === 1
          ? 'single'
          : 'multiple',
    versions,
  }
  const warnings: string[] = []
  if (summary.status === 'multiple') {
    warnings.push(`Multiple MaaFramework versions found in selected logs: ${versions.join(', ')}.`)
  }
  if (summary.status === 'conflict') {
    warnings.push('Conflicting MaaFramework version headers found within a runtime session.')
  }
  if (sessions.some((session) => session.startKind === 'partial_file')) {
    warnings.push('Some core log content starts without a MAA Process Start marker; its session boundary is partial.')
  }
  if (sessions.some((session) => session.status === 'missing_version')) {
    warnings.push('Some MaaFramework runtime sessions do not contain a Logger version header.')
  }

  return { sessions, summary, warnings }
}

export const resolveFrameworkSessionForTimestamp = (
  extraction: FrameworkSessionExtraction,
  timestamp: string,
): FrameworkSession | null => {
  const candidates = extraction.sessions.filter((session) => {
    if (session.status !== 'resolved' || session.startKind !== 'process_start') return false
    const start = session.start.timestamp
    const end = session.end.timestamp
    return start != null && end != null && timestamp >= start && timestamp <= end
  })
  return candidates.length === 1 ? (candidates[0] ?? null) : null
}
