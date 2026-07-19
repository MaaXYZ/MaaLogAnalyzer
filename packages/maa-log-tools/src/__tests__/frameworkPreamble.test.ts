import { describe, expect, it } from 'vitest'
import { extractFrameworkSessions } from '../frameworkVersion'

describe('framework session preamble handling', () => {
  it('does not create a partial session for ordinary Logger setup before process start', () => {
    const extraction = extractFrameworkSessions([{
      path: 'maafw.log',
      name: 'maafw.log',
      reference: 'file:C:/logs/maafw.log',
      content: [
        '[2026-07-01 10:00:00.000][DBG][Px1][Tx1][Logger] Logger initialized',
        '[2026-07-01 10:00:00.001][DBG][Px1][Tx1][Logger] MAA Process Start',
        '[2026-07-01 10:00:00.002][DBG][Px1][Tx1][Logger] Version v5.11.1',
      ].join('\n'),
    }])

    expect(extraction.sessions).toHaveLength(1)
    expect(extraction.sessions[0]).toMatchObject({
      startKind: 'process_start',
      version: 'v5.11.1',
      start: { line: 2 },
    })
    expect(extraction.warnings).not.toContain(
      'Some core log content starts without a MAA Process Start marker; its session boundary is partial.',
    )
  })
})
