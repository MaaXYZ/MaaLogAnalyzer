import { describe, expect, it } from 'vitest'
import {
  extractFrameworkSessions,
  resolveFrameworkSessionForTimestamp,
  type FrameworkLogSource,
} from '../frameworkVersion'

const line = (timestamp: string, component: string, message: string): string => {
  return `[${timestamp}][DBG][Px1][Tx1][${component}] ${message}`
}

const source = (content: string): FrameworkLogSource => ({
  path: 'maafw.log',
  name: 'maafw.log',
  content,
  reference: 'file:C:/logs/maafw.log',
})

describe('extractFrameworkSessions', () => {
  it('keeps two framework versions in one file as separate runtime sessions', () => {
    const extraction = extractFrameworkSessions([source([
      line('2026-07-01 10:00:00.000', 'Logger', 'MAA Process Start'),
      line('2026-07-01 10:00:00.010', 'Logger', 'Version v5.10.4'),
      line('2026-07-01 10:05:00.000', 'Tasker', 'first run'),
      line('2026-07-02 09:00:00.000', 'Logger', 'MAA Process Start'),
      line('2026-07-02 09:00:00.010', 'Logger', 'Version v5.11.1'),
      line('2026-07-02 09:05:00.000', 'Tasker', 'second run'),
    ].join('\n'))])

    expect(extraction.summary).toEqual({
      status: 'multiple',
      versions: ['v5.10.4', 'v5.11.1'],
    })
    expect(extraction.sessions).toHaveLength(2)
    expect(extraction.sessions[0]).toMatchObject({
      startKind: 'process_start',
      status: 'resolved',
      version: 'v5.10.4',
      start: { line: 1 },
      end: { line: 3 },
      versionEvidence: [{ line: 2, version: 'v5.10.4' }],
    })
    expect(extraction.sessions[1]).toMatchObject({
      version: 'v5.11.1',
      start: { line: 4 },
      end: { line: 6 },
    })
    expect(resolveFrameworkSessionForTimestamp(
      extraction,
      '2026-07-02 09:04:00.000',
    )?.version).toBe('v5.11.1')
  })

  it('does not treat non-Logger version text as framework evidence', () => {
    const extraction = extractFrameworkSessions([source([
      line('2026-07-01 10:00:00.000', 'Logger', 'MAA Process Start'),
      line('2026-07-01 10:00:00.010', 'GUI', 'MaaFramework Version v9.9.9'),
    ].join('\n'))])

    expect(extraction.summary).toEqual({ status: 'none', versions: [] })
    expect(extraction.sessions[0]).toMatchObject({
      status: 'missing_version',
      version: null,
    })
  })

  it('reports conflicting Logger version headers in the same runtime session', () => {
    const extraction = extractFrameworkSessions([source([
      line('2026-07-01 10:00:00.000', 'Logger', 'MAA Process Start'),
      line('2026-07-01 10:00:00.010', 'Logger', 'Version v5.10.4'),
      line('2026-07-01 10:00:00.020', 'Logger', 'Version v5.11.1'),
    ].join('\n'))])

    expect(extraction.summary.status).toBe('conflict')
    expect(extraction.sessions[0]).toMatchObject({
      status: 'conflict',
      version: null,
      versions: ['v5.10.4', 'v5.11.1'],
    })
  })

  it('does not resolve timestamps against a partial file segment', () => {
    const extraction = extractFrameworkSessions([source([
      line('2026-07-01 10:00:00.010', 'Logger', 'Version v5.10.4'),
      line('2026-07-01 10:05:00.000', 'Tasker', 'continued run'),
    ].join('\n'))])

    expect(extraction.sessions[0]?.startKind).toBe('partial_file')
    expect(resolveFrameworkSessionForTimestamp(
      extraction,
      '2026-07-01 10:04:00.000',
    )).toBeNull()
  })
})
