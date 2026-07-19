import { describe, expect, it } from 'vitest'
import type { KernelOutput } from '@windsland52/maa-log-kernel/protocol'
import {
  buildPreflightOutput,
  MLA_PREFLIGHT_SCHEMA_VERSION,
} from '../cli'

const output = (
  eventCount: number,
  taskCount: number,
  warnings: string[] = [],
): KernelOutput => ({
  meta: {
    schemaVersion: '1.0.0',
    parserVersion: 'test-parser/1.0.0',
    generatedAt: '2026-07-19T00:00:00Z',
  },
  tasks: Array.from({ length: taskCount }, () => ({}) as KernelOutput['tasks'][number]),
  events: Array.from({ length: eventCount }, () => ({}) as KernelOutput['events'][number]),
  stats: {
    nodes: [],
    recognitionActions: [],
  },
  warnings,
})

describe('buildPreflightOutput', () => {
  it('reports supported when Notify events assemble task lifecycles', () => {
    expect(buildPreflightOutput(output(8, 2))).toEqual({
      schemaVersion: MLA_PREFLIGHT_SCHEMA_VERSION,
      status: 'supported',
      reason: 'notify_events_parsed',
      parserVersion: 'test-parser/1.0.0',
      taskCount: 2,
      eventCount: 8,
      nodeStatisticCount: 0,
      recognitionStatisticCount: 0,
      frameworkVersionSummary: { status: 'none', versions: [] },
      frameworkSessions: [],
      warnings: [],
    })
  })

  it('includes framework sessions and their warnings', () => {
    const frameworkWarning = 'Multiple MaaFramework versions found in selected logs: v5.10.4, v5.11.1.'
    const result = buildPreflightOutput(output(8, 2), {
      sessions: [],
      summary: { status: 'multiple', versions: ['v5.10.4', 'v5.11.1'] },
      warnings: [frameworkWarning],
    })

    expect(result.frameworkVersionSummary).toEqual({
      status: 'multiple',
      versions: ['v5.10.4', 'v5.11.1'],
    })
    expect(result.warnings).toContain(frameworkWarning)
  })

  it('distinguishes logs without Notify events', () => {
    const warning = 'No !!!OnEventNotify!!! events found in content.'
    expect(buildPreflightOutput(output(0, 0, [warning]))).toMatchObject({
      status: 'unsupported',
      reason: 'no_notify_events',
      warnings: [warning],
    })
  })

  it('reports archives without analyzable log content', () => {
    expect(buildPreflightOutput(null)).toMatchObject({
      status: 'unsupported',
      reason: 'no_analyzable_content',
      parserVersion: null,
      frameworkVersionSummary: { status: 'none', versions: [] },
      frameworkSessions: [],
    })
  })
})
