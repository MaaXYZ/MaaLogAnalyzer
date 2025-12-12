/**
 * Log Highlighter Utility
 * Parses log lines into tokens for syntax highlighting similar to VS Code's .log format
 */

export interface LogToken {
  type: 'timestamp' | 'level-info' | 'level-warn' | 'level-error' | 'level-debug' | 'string' | 'number' | 'text' | 'key'
  content: string
}

// Regex patterns
const PATTERNS = {
  // Timestamp: YYYY-MM-DD HH:mm:ss.mmm or HH:mm:ss
  timestamp: /^(\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}(\.\d{3})?/,

  // Log Levels
  levelInfo: /\[(INFO|INF)\]/i,
  levelWarn: /\[(WARN|WARNING|WRN)\]/i,
  levelError: /\[(ERROR|ERR|FATAL)\]/i,
  levelDebug: /\[(DEBUG|DBG|TRACE)\]/i,

  // Quoted strings
  string: /"([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)'/,

  // Numbers (integers, floats, hex)
  number: /\b\d+(\.\d+)?\b|0x[0-9a-fA-F]+/,

  // Key-Value keys (e.g. "key":)
  key: /\b[\w_]+(?=:)/
}

/**
 * Parses a log line into a list of tokens
 */
export function parseLogLine(line: string): LogToken[] {
  const tokens: LogToken[] = []
  let remaining = line

  while (remaining.length > 0) {
    let match: RegExpMatchArray | null = null
    let matchedType: LogToken['type'] | null = null
    let matchedLength = 0

    // 1. Try to match timestamp at the beginning (or if preceded by space/brackets)
    if (tokens.length === 0 || tokens[tokens.length - 1].content.endsWith(' ') || tokens[tokens.length - 1].content.endsWith('[')) {
      match = remaining.match(PATTERNS.timestamp)
      if (match && match.index === 0) {
        matchedType = 'timestamp'
        matchedLength = match[0].length
      }
    }

    // 2. Try to match log levels
    if (!matchedType) {
      if ((match = remaining.match(PATTERNS.levelInfo)) && match.index === 0) matchedType = 'level-info'
      else if ((match = remaining.match(PATTERNS.levelWarn)) && match.index === 0) matchedType = 'level-warn'
      else if ((match = remaining.match(PATTERNS.levelError)) && match.index === 0) matchedType = 'level-error'
      else if ((match = remaining.match(PATTERNS.levelDebug)) && match.index === 0) matchedType = 'level-debug'

      if (matchedType && match) matchedLength = match[0].length
    }

    // 3. Try to match strings
    if (!matchedType) {
      match = remaining.match(PATTERNS.string)
      if (match && match.index === 0) {
        matchedType = 'string'
        matchedLength = match[0].length
      }
    }

    // 4. Try to match numbers
    if (!matchedType) {
      match = remaining.match(PATTERNS.number)
      if (match && match.index === 0) {
        matchedType = 'number'
        matchedLength = match[0].length
      }
    }

    // 5. Try to match keys
    if (!matchedType) {
      match = remaining.match(PATTERNS.key)
      if (match && match.index === 0) {
        matchedType = 'key'
        matchedLength = match[0].length
      }
    }

    // If a match was found
    if (matchedType && matchedLength > 0) {
      tokens.push({ type: matchedType, content: remaining.substring(0, matchedLength) })
      remaining = remaining.substring(matchedLength)
    } else {
      // No match, consume one character as text
      // Optimization: consume until next potential match start
      const nextSpecialChar = remaining.search(/["'\d[\n]|(?<=\s)\d{2}:/)

      if (nextSpecialChar > 0) {
        tokens.push({ type: 'text', content: remaining.substring(0, nextSpecialChar) })
        remaining = remaining.substring(nextSpecialChar)
      } else if (nextSpecialChar === 0) {
        // Should not happen if logic above is correct, but fallback
        tokens.push({ type: 'text', content: remaining[0] })
        remaining = remaining.substring(1)
      } else {
        // No more special chars
        tokens.push({ type: 'text', content: remaining })
        remaining = ''
      }
    }
  }

  // Merge adjacent text tokens
  const mergedTokens: LogToken[] = []
  for (const token of tokens) {
    if (mergedTokens.length > 0 && mergedTokens[mergedTokens.length - 1].type === 'text' && token.type === 'text') {
      mergedTokens[mergedTokens.length - 1].content += token.content
    } else {
      mergedTokens.push(token)
    }
  }

  return mergedTokens
}
