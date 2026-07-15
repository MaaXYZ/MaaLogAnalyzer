import { describe, expect, it } from 'vitest'
import { analyzeTextContent } from '../contentMetrics'
import { runContentSearch } from './contentSearch'

describe('large in-memory text search', () => {
  it('counts UTF-8 bytes and lines without splitting the full content', async () => {
    await expect(analyzeTextContent('ascii\n中文😀')).resolves.toEqual({
      byteLength: 16,
      lineCount: 2,
    })
  })

  it('searches content incrementally and preserves line numbers', async () => {
    const results = await runContentSearch({
      content: 'first\nneedle here\nlast needle',
      keyword: 'needle',
      useRegex: false,
      caseSensitive: false,
      maxResults: 10,
      shouldAbort: () => false,
    })

    expect(results?.map(result => result.lineNumber)).toEqual([2, 3])
  })
})
