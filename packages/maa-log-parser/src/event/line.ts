import type { EventNotification } from '../shared/types'
import { buildEventDedupSignature, formatEventTimestampMs, parseEventTimestampMs } from './meta'

// Event line regex: extracts timestamp, level, processId, threadId, msg, detailsJson.
// 优化正则：使用 .*? 减少贪婪匹配带来的回溯消耗，极大提升长行解析速度
const EVENT_LINE_REGEX =
  /^\[([^\]]+)\]\[([^\]]+)\]\[(Px[^\]]+)\]\[(Tx[^\]]+)\].*?!!!OnEventNotify!!!\s*\[handle=[^\]]*\]\s*\[msg=([^\]]+)\]\s*\[details=(.*)\]\s*$/

export type ParsedEventLine = EventNotification & {
  processId: string
  threadId: string
  _dedupSignature: string
  _timestampMs: number
}

interface ParseEventLineOptions {
  internEventToken: (raw: string) => string
  forceCopyString: (value: string) => string
}

export const parseEventLine = (
  line: string,
  lineNum: number,
  options: ParseEventLineOptions,
): ParsedEventLine | null => {
  const match = line.match(EVENT_LINE_REGEX)
  if (!match) return null

  const [, rawTimestamp, rawLevel, rawProcessId, rawThreadId, rawMsg, detailsJson] = match
  const timestampMs = parseEventTimestampMs(rawTimestamp)
  const timestamp = Number.isFinite(timestampMs)
    ? formatEventTimestampMs(timestampMs)
    : options.forceCopyString(rawTimestamp)
  const level = options.internEventToken(rawLevel)
  const processId = options.internEventToken(rawProcessId)
  const threadId = options.internEventToken(rawThreadId)
  const msg = options.internEventToken(rawMsg)

  let parsedDetails: unknown
  try {
    parsedDetails = JSON.parse(detailsJson)
  } catch {
    return null
  }
  if (parsedDetails == null || typeof parsedDetails !== 'object' || Array.isArray(parsedDetails)) {
    return null
  }
  const details = parsedDetails as Record<string, any>

  return {
    timestamp,
    level,
    message: msg,
    details,
    processId,
    threadId,
    _lineNumber: lineNum,
    _dedupSignature: buildEventDedupSignature(msg, detailsJson),
    _timestampMs: timestampMs,
  }
}
