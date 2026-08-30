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

    expect(results?.map((result) => result.lineNumber)).toEqual([2, 3])
  })

  it('finds regular expression matches and preserves their ranges', async () => {
    const results = await runContentSearch({
      content: 'alpha 123\nno digits\nBETA 456',
      keyword: '[a-z]+\\s+\\d+',
      useRegex: true,
      caseSensitive: false,
      maxResults: 10,
      shouldAbort: () => false,
    })

    expect(results).toEqual([
      expect.objectContaining({ lineNumber: 1, matchStart: 0, matchEnd: 9 }),
      expect.objectContaining({ lineNumber: 3, matchStart: 0, matchEnd: 8 }),
    ])
  })

  it('honors case sensitivity for regular expression searches', async () => {
    const results = await runContentSearch({
      content: 'Node 1\nnode 2',
      keyword: 'Node\\s+\\d',
      useRegex: true,
      caseSensitive: true,
      maxResults: 10,
      shouldAbort: () => false,
    })

    expect(results?.map((result) => result.lineNumber)).toEqual([1])
  })
})
