export interface StructuredAiOutput {
  answer: string
  memory_update: string
}

const normalizeJsonCandidate = (text: string): string => {
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()
  }

  return trimmed
}

export const tryParseStructuredOutput = (text: string): StructuredAiOutput | null => {
  const candidates: string[] = []
  const normalized = normalizeJsonCandidate(text)
  if (normalized) candidates.push(normalized)

  const firstBrace = normalized.indexOf('{')
  const lastBrace = normalized.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
      const memoryUpdate = typeof parsed.memory_update === 'string' ? parsed.memory_update.trim() : ''
      if (answer || memoryUpdate) {
        return {
          answer: answer || '证据不足',
          memory_update: memoryUpdate,
        }
      }
    } catch {
      // ignore parse error
    }
  }

  return null
}

