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

/**
 * 强制拷贝要长期保留的字符串。
 *
 * 这里的 timestamp / version 都是从日志行（可能是 1MB 级文本块的 slice）里切出来的；
 * 直接存进 session 会让整个块无法回收（V8 sliced string 保留），实测 2.4GB 语料上
 * `loadFrameworkLogSources` 峰值 ~5GB 有一部分就来自这类保留。拷贝后只留几十字节。
 */
const copyRetainedString = (value: string): string => Buffer.from(value, 'utf8').toString('utf8')

/**
 * 逐行遍历内容，语义与 `content.split(/\r?\n/)`（去掉末尾空行）一致，但不物化行数组。
 */
export const forEachContentLine = (content: string, onLine: (line: string) => void): void => {
  let start = 0
  while (true) {
    const end = content.indexOf('\n', start)
    if (end < 0) break
    const line = content.slice(start, end)
    onLine(line.endsWith('\r') ? line.slice(0, -1) : line)
    start = end + 1
  }
  if (start < content.length) {
    const tail = content.slice(start)
    onLine(tail.endsWith('\r') ? tail.slice(0, -1) : tail)
  }
}

const timestampOf = (line: string | undefined): string | null => {
  if (!line) return null
  return line.match(TIMESTAMP_PATTERN)?.[1] ?? null
}

interface FrameworkSourceLike {
  path: string
  name?: string
  reference: string
}

interface SessionBuffer {
  source: FrameworkSourceLike
  startIndex: number
  startKind: FrameworkSession['startKind']
  firstTimestamp: string | null
  lastTimestamp: string | null
  versionEvidence: FrameworkVersionEvidence[]
}

/**
 * 增量框架会话扫描器：逐行喂入、喂完即丢，不要求整段内容常驻。
 *
 * 语义与 `extractFrameworkSessions()` 完全一致（后者现在是本扫描器的薄封装）：
 * 每个来源内部按 `MAA Process Start` 切会话；首个 Process Start 之前若有版本/事件行，
 * 则额外产出一个 `partial_file` 会话；sessionId 跨来源连续编号。
 */
export interface FrameworkSessionsScanner {
  beginSource(source: FrameworkSourceLike): void
  addLine(line: string): void
  endSource(): void
  finish(): FrameworkSessionExtraction
}

export const createFrameworkSessionsScanner = (): FrameworkSessionsScanner => {
  const sessions: FrameworkSession[] = []
  let source: FrameworkSourceLike | null = null
  let lineIndex = 0
  let current: SessionBuffer | null = null
  let sawProcessStart = false
  let prefixHasRelevantLine = false

  const startSession = (startIndex: number, startKind: FrameworkSession['startKind']): void => {
    if (!source) throw new Error('Framework scanner source was not initialized.')
    current = {
      source,
      startIndex,
      startKind,
      firstTimestamp: null,
      lastTimestamp: null,
      versionEvidence: [],
    }
  }

  const track = (line: string, index: number): void => {
    if (!current) return
    const timestamp = timestampOf(line)
    if (timestamp) {
      const copied = copyRetainedString(timestamp)
      if (current.firstTimestamp == null) current.firstTimestamp = copied
      current.lastTimestamp = copied
    }
    const version = line.match(VERSION_PATTERN)?.[1]
    if (!version) return
    current.versionEvidence.push({
      source: current.source.reference,
      path: current.source.path,
      line: index + 1,
      timestamp: timestamp ? copyRetainedString(timestamp) : null,
      version: copyRetainedString(version),
    })
  }

  const closeSession = (endIndex: number): void => {
    if (!current) return
    if (endIndex < current.startIndex) {
      current = null
      return
    }
    const versions = [...new Set(current.versionEvidence.map((item) => item.version))]
    const status: FrameworkSession['status'] =
      versions.length === 0 ? 'missing_version' : versions.length === 1 ? 'resolved' : 'conflict'
    sessions.push({
      sessionId: `framework-session-${sessions.length + 1}`,
      startKind: current.startKind,
      status,
      version: status === 'resolved' ? (versions[0] ?? null) : null,
      versions,
      start: {
        source: current.source.reference,
        path: current.source.path,
        line: current.startIndex + 1,
        timestamp: current.firstTimestamp,
      },
      end: {
        source: current.source.reference,
        path: current.source.path,
        line: endIndex + 1,
        timestamp: current.lastTimestamp,
      },
      versionEvidence: current.versionEvidence,
    })
    current = null
  }

  const finish = (): FrameworkSessionExtraction => {
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
      warnings.push(
        'Some core log content starts without a MAA Process Start marker; its session boundary is partial.',
      )
    }
    if (sessions.some((session) => session.status === 'missing_version')) {
      warnings.push('Some MaaFramework runtime sessions do not contain a Logger version header.')
    }
    return { sessions, summary, warnings }
  }

  return {
    beginSource(nextSource) {
      source = {
        path: nextSource.path,
        name: nextSource.name,
        reference: nextSource.reference,
      }
      lineIndex = 0
      sawProcessStart = false
      prefixHasRelevantLine = false
      startSession(0, 'partial_file')
    },
    addLine(line) {
      const index = lineIndex
      lineIndex += 1
      const isProcessStart = PROCESS_START_PATTERN.test(line)
      if (!sawProcessStart) {
        if (isProcessStart) {
          sawProcessStart = true
          if (index === 0) {
            if (current) current.startKind = 'process_start'
          } else if (prefixHasRelevantLine) {
            closeSession(index - 1)
            startSession(index, 'process_start')
          } else {
            current = null
            startSession(index, 'process_start')
          }
        } else if (VERSION_PATTERN.test(line) || line.includes('!!!OnEventNotify!!!')) {
          prefixHasRelevantLine = true
        }
      } else if (isProcessStart) {
        closeSession(index - 1)
        startSession(index, 'process_start')
      }
      track(line, index)
    },
    endSource() {
      // 空来源（0 行）与 `splitLines` 的空结果一致：不产出会话。
      if (lineIndex > 0) closeSession(lineIndex - 1)
      current = null
      source = null
      lineIndex = 0
    },
    finish,
  }
}

/**
 * 整段内容入口（保持原签名与输出）：逐行喂给扫描器，不保留行数组。
 */
export const extractFrameworkSessions = (
  sources: readonly FrameworkLogSource[],
): FrameworkSessionExtraction => {
  const scanner = createFrameworkSessionsScanner()
  for (const source of sources) {
    scanner.beginSource(source)
    forEachContentLine(source.content, (line) => scanner.addLine(line))
    scanner.endSource()
  }
  return scanner.finish()
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
