import { describe, expect, it } from 'vitest'
import { tryParseStructuredOutput } from '../structuredOutput'

describe('tryParseStructuredOutput', () => {
  it('parses strict json payload', () => {
    const text = '{"answer":"ok","memory_update":"memo"}'
    const parsed = tryParseStructuredOutput(text)
    expect(parsed).toEqual({ answer: 'ok', memory_update: 'memo' })
  })

  it('parses fenced json payload', () => {
    const text = '```json\n{"answer":"结论","memory_update":"摘要"}\n```'
    const parsed = tryParseStructuredOutput(text)
    expect(parsed).toEqual({ answer: '结论', memory_update: '摘要' })
  })

  it('extracts json object from wrapped text', () => {
    const text = '模型输出如下：\n{"answer":"A","memory_update":"M"}\n完毕'
    const parsed = tryParseStructuredOutput(text)
    expect(parsed).toEqual({ answer: 'A', memory_update: 'M' })
  })

  it('falls back answer to default when memory_update exists', () => {
    const text = '{"memory_update":"only memory"}'
    const parsed = tryParseStructuredOutput(text)
    expect(parsed).toEqual({ answer: '证据不足', memory_update: 'only memory' })
  })

  it('returns null when no valid json is found', () => {
    const parsed = tryParseStructuredOutput('this is not json')
    expect(parsed).toBeNull()
  })
})

