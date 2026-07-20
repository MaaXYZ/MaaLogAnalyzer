import type { KernelOutput, NodeInfo, TaskInfo } from '@windsland52/maa-log-kernel'
import { describe, expect, it } from 'vitest'
import type { FrameworkSessionExtraction } from '../frameworkVersion'
import { buildRuntimeInspection, type SourceSegment } from '../runtimeInspection'

const position = (line: number, timestamp: string) => ({
  source: 'file:C:/logs/maafw.log',
  path: 'maafw.log',
  line,
  timestamp,
})

const framework: FrameworkSessionExtraction = {
  sessions: [{
    sessionId: 'framework-session-1',
    startKind: 'partial_file',
    status: 'resolved',
    version: 'v5.11.1',
    versions: ['v5.11.1'],
    start: position(1, '2026-07-20 10:00:00.000'),
    end: position(1000, '2026-07-20 11:00:00.000'),
    versionEvidence: [{ ...position(1, '2026-07-20 10:00:00.000'), version: 'v5.11.1' }],
  }],
  summary: { status: 'single', versions: ['v5.11.1'] },
  warnings: ['partial session'],
}

const sourceSegments: SourceSegment[] = [
  { source: 'file:test/maa.log', path: 'maa.log', startLine: 1, lineCount: 1000 },
]

const node = (
  nodeId: number,
  name: string,
  timestamp: string,
  overrides: Partial<NodeInfo> = {},
): NodeInfo => ({
  node_id: nodeId,
  name,
  ts: timestamp,
  end_ts: timestamp,
  status: 'success',
  task_id: 1,
  next_list: [],
  ...overrides,
})

const task = (overrides: Partial<TaskInfo>): TaskInfo => ({
  task_id: 1,
  entry: 'Fight',
  hash: 'hash',
  uuid: 'uuid',
  start_time: '2026-07-20 10:01:00.000',
  end_time: '2026-07-20 10:02:00.000',
  status: 'failed',
  nodes: [],
  events: [],
  ...overrides,
})

const output = (tasks: TaskInfo[]): KernelOutput => ({
  meta: { schemaVersion: '1.0.0', parserVersion: 'test', generatedAt: '2026-07-20T12:00:00Z' },
  tasks,
  events: [],
  stats: { nodes: [], recognitionActions: [] },
  warnings: [],
})

describe('runtime inspection', () => {
  it('aggregates recognition next-list activity and repetition patterns', () => {
    const firstNextListNode = node(11, 'ChooseNext', '2026-07-20 10:01:10.000', {
      status: 'success',
      next_list: [{ name: 'Target', anchor: false, jump_back: false }],
      node_flow: [
        { id: 'r1', type: 'recognition', name: 'Target', status: 'failed', ts: '2026-07-20 10:01:10.000' },
        { id: 'r2', type: 'recognition', name: 'Target', status: 'success', ts: '2026-07-20 10:01:11.000' },
      ],
    })
    const secondNextListNode = node(14, 'ChooseNext', '2026-07-20 10:01:15.000', {
      status: 'success',
      next_list: [{ name: 'Target', anchor: false, jump_back: false }],
      node_flow: [
        { id: 'r4', type: 'recognition', name: 'Target', status: 'failed', ts: '2026-07-20 10:01:15.000' },
        { id: 'r5', type: 'recognition', name: 'Target', status: 'failed', ts: '2026-07-20 10:01:16.000' },
        { id: 'r6', type: 'recognition', name: 'Target', status: 'success', ts: '2026-07-20 10:01:17.000' },
      ],
    })
    const differentNextListNode = node(15, 'ChooseNext', '2026-07-20 10:01:18.000', {
      status: 'success',
      next_list: [
        { name: 'OtherTarget', anchor: false, jump_back: false },
        { name: 'Target', anchor: true, jump_back: false },
      ],
      node_flow: [
        { id: 'r7', type: 'recognition', name: 'OtherTarget', status: 'failed', ts: '2026-07-20 10:01:18.000' },
        { id: 'r8', type: 'recognition', name: 'Target', status: 'success', ts: '2026-07-20 10:01:19.000' },
      ],
    })
    const actionFailedNode = node(16, 'ActionNode', '2026-07-20 10:01:19.500', {
      status: 'failed',
      next_list: [{ name: 'Target', anchor: false, jump_back: false }],
      action_details: {
        action_id: 1,
        action: 'Click',
        box: [1, 2, 3, 4],
        detail: {},
        name: 'Target',
        success: false,
      },
      node_flow: [
        { id: 'r9', type: 'recognition', name: 'Target', status: 'success', ts: '2026-07-20 10:01:19.500' },
      ],
    })
    const timeout = node(12, 'WaitForNext', '2026-07-20 10:01:20.000', {
      status: 'failed',
      next_list: [{ name: 'NeverMatched', anchor: false, jump_back: false }],
      node_flow: [
        { id: 'r3', type: 'recognition', name: 'NeverMatched', status: 'failed', ts: '2026-07-20 10:01:20.000' },
      ],
    })
    const unattributedFailure = node(13, 'UnknownFailure', '2026-07-20 10:01:30.000', {
      status: 'failed',
    })
    const failedTask = task({
      nodes: [firstNextListNode, secondNextListNode, differentNextListNode, actionFailedNode, timeout, unattributedFailure],
      events: [
        { timestamp: actionFailedNode.ts, level: 'DBG', message: 'action', details: {}, _lineNumber: 20 },
        { timestamp: timeout.ts, level: 'DBG', message: 'timeout', details: {}, _lineNumber: 30 },
      ],
    })
    const names = ['A', 'B', 'A', 'B', 'A', 'B']
    const loopingTask = task({
      task_id: 2,
      entry: 'LoopingTask',
      uuid: 'loop',
      start_time: '2026-07-20 10:05:00.000',
      end_time: undefined,
      status: 'running',
      nodes: names.map((name, index) => node(
        100 + index,
        name,
        `2026-07-20 10:05:0${index}.000`,
        { task_id: 2 },
      )),
    })

    const inspection = buildRuntimeInspection(output([failedTask, loopingTask]), framework, sourceSegments)

    expect(inspection.sessions[0]?.startKind).toBe('partial_file')
    expect(inspection.sessions[0]?.tasks).toHaveLength(2)
    expect(inspection.unscopedTasks).toHaveLength(0)
    expect(inspection.failures.map(item => item.kind)).toEqual(['action_failed', 'next_list_timeout'])
    expect(inspection.failures[0]?.evidence.localLine).toBe(20)
    expect(inspection.failures[0]?.evidence.source).toBe('file:test/maa.log')
    expect(inspection.outcomes.some(item => item.kind === 'task' && item.status === 'failed')).toBe(true)
    expect(inspection.outcomes.some(item => (
      item.nodeName === 'UnknownFailure' && item.directFailureIds.length === 0
    ))).toBe(true)

    const recognitionGroups = inspection.signals.filter(item => item.kind === 'recognition_activity')
    expect(recognitionGroups).toHaveLength(4)
    const sameNextListGroup = recognitionGroups.find(item => (
      item.kind === 'recognition_activity'
      && item.pipelineNodeName === 'ChooseNext'
      && item.nextList.length === 1
      && item.nextList[0]?.name === 'Target'
    ))
    expect(sameNextListGroup).toMatchObject({
      occurrenceCount: 2,
      occurrencesWithMixedResults: 2,
      terminalOutcomes: { matched: 2, timeout: 0, running: 0, unmatched: 0 },
      terminalMatches: [{ name: 'Target', count: 2 }],
      attempts: { count: 2, minimum: 2, maximum: 3 },
      unsuccessfulAttempts: { count: 2, minimum: 1, maximum: 2 },
    })
    expect(sameNextListGroup?.candidateStatistics).toEqual([
      expect.objectContaining({
        name: 'Target',
        evaluationCount: 5,
        matchedAttemptCount: 2,
        unsuccessfulAttemptCount: 3,
        terminalMatchCount: 2,
      }),
    ])
    expect(sameNextListGroup?.representatives.worst.attemptCount).toBe(3)

    const differentNextListGroup = recognitionGroups.find(item => (
      item.kind === 'recognition_activity'
      && item.pipelineNodeName === 'ChooseNext'
      && item.nextList.length === 2
    ))
    expect(differentNextListGroup).toMatchObject({
      occurrenceCount: 1,
      terminalMatches: [{ name: 'Target', count: 1 }],
    })

    const timeoutGroup = recognitionGroups.find(item => (
      item.kind === 'recognition_activity' && item.pipelineNodeName === 'WaitForNext'
    ))
    expect(timeoutGroup).toMatchObject({
      occurrenceCount: 1,
      terminalOutcomes: { matched: 0, timeout: 1, running: 0, unmatched: 0 },
    })

    expect(inspection.sessions[0]?.tasks[0]?.statistics.recognitionActivityGroups).toBe(4)
    expect(inspection.sessions[0]?.tasks[0]?.statistics.nodeExecutionsWithMixedRecognitionResults).toBe(3)
    expect(inspection.sessions[0]?.tasks[0]?.signalHighlights.recognitionActivity).toEqual(
      expect.arrayContaining([sameNextListGroup?.signalId]),
    )

    const repetition = inspection.signals.find(item => item.kind === 'repeated_node_cycle')
    expect(repetition).toMatchObject({
      pattern: ['A', 'B'],
      segmentCount: 1,
      totalRepeatCount: 3,
      maximumRepeatCount: 3,
      terminations: { leftPattern: 0, taskEnded: 0, stillRepeatingAtLogEnd: 1 },
      representatives: {
        longest: {
          pattern: ['A', 'B'],
          durationMs: 5000,
          termination: 'still_repeating_at_log_end',
        },
      },
    })
    expect(inspection.sessions[0]?.tasks[1]?.signalHighlights.repetitions).toEqual([
      repetition?.signalId,
    ])
  })

  it('keeps reused framework task ids as distinct executions', () => {
    const first = task({ task_id: 0, entry: 'First', status: 'succeeded' })
    const second = task({ task_id: 0, entry: 'Second', status: 'succeeded' })

    const inspection = buildRuntimeInspection(output([first, second]), framework, sourceSegments)

    expect(inspection.sessions[0]?.tasks.map(item => item.executionId)).toEqual([
      'task-execution-0-1',
      'task-execution-0-2',
    ])
  })

  it('treats a completed repetition that leaves its pattern as normal telemetry', () => {
    const repeatedNodes = Array.from({ length: 5 }, (_, index) => node(
      200 + index,
      'RetryNode',
      `2026-07-20 10:10:0${index}.000`,
    ))
    const completedTask = task({
      status: 'succeeded',
      nodes: [
        ...repeatedNodes,
        node(210, 'NextNode', '2026-07-20 10:10:05.000'),
      ],
    })

    const inspection = buildRuntimeInspection(output([completedTask]), framework, sourceSegments)
    const repetition = inspection.signals.find(item => item.kind === 'repeated_node')

    expect(repetition).toMatchObject({
      pattern: ['RetryNode'],
      terminations: { leftPattern: 1, taskEnded: 0, stillRepeatingAtLogEnd: 0 },
      priority: 'low',
      priorityReasons: [],
    })
  })

  it('does not report an earlier pattern as still repeating when another node is running', () => {
    const repeatedNodes = Array.from({ length: 5 }, (_, index) => node(
      300 + index,
      'RetryNode',
      `2026-07-20 10:15:0${index}.000`,
    ))
    const runningTask = task({
      status: 'running',
      end_time: undefined,
      nodes: [
        ...repeatedNodes,
        node(310, 'DifferentNode', '2026-07-20 10:15:05.000', { status: 'running' }),
      ],
    })

    const inspection = buildRuntimeInspection(output([runningTask]), framework, sourceSegments)
    const repetition = inspection.signals.find(item => item.kind === 'repeated_node')

    expect(repetition).toMatchObject({
      pattern: ['RetryNode'],
      terminations: { leftPattern: 1, taskEnded: 0, stillRepeatingAtLogEnd: 0 },
    })
  })

  it('counts all recognition activity groups while limiting highlights to five', () => {
    const recognitionNodes = Array.from({ length: 6 }, (_, index) => {
      const candidate = `Candidate${index}`
      return node(400 + index, `Pipeline${index}`, `2026-07-20 10:20:0${index}.000`, {
        next_list: [{ name: candidate, anchor: false, jump_back: false }],
        node_flow: [{
          id: `recognition-${index}`,
          type: 'recognition',
          name: candidate,
          status: 'success',
          ts: `2026-07-20 10:20:0${index}.000`,
        }],
      })
    })
    const recognitionTask = task({ status: 'succeeded', nodes: recognitionNodes })

    const inspection = buildRuntimeInspection(output([recognitionTask]), framework, sourceSegments)
    const taskResult = inspection.sessions[0]?.tasks[0]

    expect(taskResult?.statistics.recognitionActivityGroups).toBe(6)
    expect(taskResult?.signalHighlights.recognitionActivity).toHaveLength(5)
  })

  it('enriches evidence positions with source segments and local line numbers', () => {
    const actionFailedNode = node(16, 'ActionNode', '2026-07-20 10:01:19.500', {
      status: 'failed',
      next_list: [{ name: 'Target', anchor: false, jump_back: false }],
      action_details: {
        action_id: 1,
        action: 'Click',
        box: [1, 2, 3, 4],
        detail: {},
        name: 'Target',
        success: false,
      },
      node_flow: [
        { id: 'r9', type: 'recognition', name: 'Target', status: 'success', ts: '2026-07-20 10:01:19.500' },
      ],
    })
    const timeout = node(12, 'WaitForNext', '2026-07-20 10:01:20.000', {
      status: 'failed',
      next_list: [{ name: 'NeverMatched', anchor: false, jump_back: false }],
      node_flow: [
        { id: 'r3', type: 'recognition', name: 'NeverMatched', status: 'failed', ts: '2026-07-20 10:01:20.000' },
      ],
    })
    const failedTask = task({
      nodes: [actionFailedNode, timeout],
      events: [
        { timestamp: actionFailedNode.ts, level: 'DBG', message: 'action', details: {}, _lineNumber: 20 },
        { timestamp: timeout.ts, level: 'DBG', message: 'timeout', details: {}, _lineNumber: 30 },
      ],
    })

    const sourceSegments: SourceSegment[] = [
      { source: 'file:C:/logs/maa.bak.log', path: 'maa.bak.log', startLine: 1, lineCount: 25 },
      { source: 'file:C:/logs/maa.log', path: 'maa.log', startLine: 26, lineCount: 100 },
    ]

    const inspection = buildRuntimeInspection(output([failedTask]), framework, sourceSegments)

    const actionFailure = inspection.failures.find(item => item.kind === 'action_failed')
    expect(actionFailure?.evidence.source).toBe('file:C:/logs/maa.bak.log')
    expect(actionFailure?.evidence.path).toBe('maa.bak.log')
    expect(actionFailure?.evidence.localLine).toBe(20)

    const timeoutFailure = inspection.failures.find(item => item.kind === 'next_list_timeout')
    expect(timeoutFailure?.evidence.source).toBe('file:C:/logs/maa.log')
    expect(timeoutFailure?.evidence.path).toBe('maa.log')
    expect(timeoutFailure?.evidence.localLine).toBe(5)
  })
})
