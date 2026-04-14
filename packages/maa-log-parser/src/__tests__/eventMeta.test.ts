import { describe, expect, it } from 'vitest'
import {
  buildEventDedupSignature,
  formatEventTimestampMs,
  isTaskTerminalPhase,
  parseEventTimestampMs,
  parseMaaMessageMeta,
  resolveCompletionStatus,
  resolveTaskLifecyclePhase,
  resolveTaskTerminalStatus,
  resolveTerminalCompletionStatus,
} from '../event/meta'

describe('EventMeta', () => {
  it('parses Tasker.Task message meta and resolves task lifecycle phase', () => {
    const meta = parseMaaMessageMeta('Tasker.Task.Succeeded')
    expect(meta).toEqual({
      domain: 'Tasker',
      phase: 'Succeeded',
      taskerKind: 'Task',
      nodeKind: 'Unknown',
    })
    expect(resolveTaskLifecyclePhase(meta)).toBe('Succeeded')
    expect(isTaskTerminalPhase('Succeeded')).toBe(true)
    expect(resolveTaskTerminalStatus('Succeeded')).toBe('succeeded')
    expect(resolveCompletionStatus('Succeeded')).toBe('success')
    expect(resolveTerminalCompletionStatus('Succeeded')).toBe('success')
  })

  it('returns unknown metadata for malformed message and rejects lifecycle phase', () => {
    const malformed = parseMaaMessageMeta('Tasker.Task')
    expect(malformed).toEqual({
      domain: 'Unknown',
      phase: 'Unknown',
      taskerKind: 'Unknown',
      nodeKind: 'Unknown',
    })
    expect(resolveTaskLifecyclePhase(malformed)).toBeNull()

    const nodeMeta = parseMaaMessageMeta('Node.NextList.Custom')
    expect(nodeMeta.domain).toBe('Node')
    expect(nodeMeta.nodeKind).toBe('NextList')
    expect(nodeMeta.phase).toBe('Unknown')
    expect(resolveTaskLifecyclePhase(nodeMeta)).toBeNull()
  })

  it('normalizes timestamp string and keeps invalid timestamp as NaN/empty', () => {
    const timestampMs = parseEventTimestampMs('2026-04-07 10:00:01.123')
    expect(Number.isFinite(timestampMs)).toBe(true)
    expect(formatEventTimestampMs(timestampMs)).toMatch(/^2026-04-07 10:00:01\.123$/)

    const invalidMs = parseEventTimestampMs('not-a-time')
    expect(Number.isNaN(invalidMs)).toBe(true)
    expect(formatEventTimestampMs(invalidMs)).toBe('')
  })

  it('builds deterministic dedup signature from message and details', () => {
    const signatureA1 = buildEventDedupSignature('Node.Action.Succeeded', '{"action_id":1}')
    const signatureA2 = buildEventDedupSignature('Node.Action.Succeeded', '{"action_id":1}')
    const signatureB = buildEventDedupSignature('Node.Action.Succeeded', '{"action_id":2}')

    expect(signatureA1).toBe(signatureA2)
    expect(signatureA1).not.toBe(signatureB)
  })
})
