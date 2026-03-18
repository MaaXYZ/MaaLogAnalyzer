import { describe, expect, it } from 'vitest'
import type { EventNotification, TaskInfo } from '../../types'
import { buildAiAnalysisContext, buildDeterministicFindings, buildEventChainDiagnostics, buildSignalDiagnostics } from '../contextBuilder'

const makeEvent = (
  message: string,
  details: Record<string, unknown>,
  line: number,
  timestamp = '2026-03-18 12:00:00.000'
): EventNotification => ({
  timestamp,
  level: 'INF',
  message,
  details,
  _lineNumber: line,
})

describe('buildSignalDiagnostics', () => {
  it('splits reco_result_fetch vs recognition_miss_or_rule failures', () => {
    const lines = [
      { line: 1, text: '[ERR] failed to get_reco_result reco_id=1001' },
      { line: 2, text: '[ERR] failed to get_reco_result reco_id=1001' },
      { line: 3, text: '[ERR] failed to get_reco_result reco_id=1002' },
      { line: 4, text: '[ERR] failed to get_reco_result reco_id=9999' },
    ]

    const recoIdToName = new Map<number, string>([
      [1001, 'TemplateA'],
      [1002, 'TemplateB'],
    ])

    const recoFailuresByName = [
      { name: 'TemplateA', failed: 5 },
      { name: 'TemplateB', failed: 2 },
      { name: 'TemplateC', failed: 1 },
    ]

    const diagnostics = buildSignalDiagnostics(lines, recoIdToName, recoFailuresByName)

    expect(diagnostics.totalRecoResultFailed).toBe(3)
    expect(diagnostics.totalTimelineFailed).toBe(8)
    expect(diagnostics.unknownRecoNameCount).toBe(1)
    expect(diagnostics.recoResultFailureRatio).toBeCloseTo(3 / 8, 4)

    const a = diagnostics.failureTypeBreakdown.find(item => item.name === 'TemplateA')
    expect(a).toBeTruthy()
    expect(a?.recoResultFailed).toBe(2)
    expect(a?.recognitionMissOrRuleFailed).toBe(3)
  })
})

describe('buildDeterministicFindings', () => {
  it('produces deterministic findings and confidence for high-risk signals', () => {
    const findings = buildDeterministicFindings(
      {
        longStayNodes: [
          {
            node: 'BossFight',
            occurrences: 9,
            spanMs: 62000,
            failedRecoCount: 18,
            successRecoCount: 2,
          },
        ],
        repeatedRuns: [
          {
            node: 'BossFight',
            count: 6,
            spanMs: 21000,
          },
        ],
        hotspotRecoPairs: [
          {
            node: 'BossFight',
            reco: 'TemplateA',
            failed: 15,
            total: 16,
            failedRate: 0.9375,
          },
        ],
      },
      {
        failureTypeBreakdown: [
          {
            name: 'TemplateA',
            totalFailed: 15,
            recoResultFailed: 12,
            recognitionMissOrRuleFailed: 3,
            dominantType: 'reco_result_fetch_failed',
          },
        ],
        recoResultFailureRatio: 0.72,
        totalRecoResultFailed: 18,
        totalTimelineFailed: 25,
      }
    )

    expect(findings.findings.length).toBeGreaterThanOrEqual(4)
    expect(findings.findings.some(item => item.id === 'long_stay_hotspot')).toBe(true)
    expect(findings.findings.some(item => item.id === 'reco_pair_hotspot')).toBe(true)
    expect(findings.findings.some(item => item.id === 'reco_result_fetch_ratio')).toBe(true)

    const ratioFinding = findings.findings.find(item => item.id === 'reco_result_fetch_ratio')
    expect(ratioFinding?.causeType).toBe('reco_result_fetch')
    expect(ratioFinding?.confidence).toBeGreaterThanOrEqual(80)
  })

  it('down-weights loop-like findings when task succeeded without pipeline failures', () => {
    const findings = buildDeterministicFindings(
      {
        longStayNodes: [
          {
            node: 'PopupHandler',
            occurrences: 10,
            spanMs: 90000,
            failedRecoCount: 12,
            successRecoCount: 5,
          },
        ],
        repeatedRuns: [
          {
            node: 'PopupHandler',
            count: 7,
            spanMs: 24000,
          },
        ],
        hotspotRecoPairs: [
          {
            node: 'PopupHandler',
            reco: 'ClosePopup',
            failed: 10,
            total: 14,
            failedRate: 10 / 14,
          },
        ],
      },
      null,
      {
        taskStatus: 'succeeded',
        pipelineFailedCount: 0,
        jumpBackHotNodes: ['PopupHandler'],
      }
    )

    const longStay = findings.findings.find(item => item.id === 'long_stay_hotspot')
    expect(longStay?.causeType).toBe('mixed')
    expect(longStay?.confidence).toBeLessThan(70)
    expect(longStay?.summary).toContain('任务整体成功且无节点失败')
    expect(longStay?.summary).toContain('jump_back')
  })
})

describe('buildEventChainDiagnostics', () => {
  it('extracts next/recognition chains, action failure chains, and on_error chains', () => {
    const events = [
      {
        timestamp: '2026-03-18 10:00:00.000',
        level: 'INF',
        message: 'Node.NextList.Starting',
        details: {
          task_id: 1,
          name: 'Start',
          list: [{ name: 'PopupHandler', jump_back: true, anchor: false }],
        },
        _lineNumber: 100,
      },
      {
        timestamp: '2026-03-18 10:00:00.100',
        level: 'INF',
        message: 'Node.Recognition.Failed',
        details: { task_id: 1, name: 'PopupHandler', reco_id: 101 },
        _lineNumber: 101,
      },
      {
        timestamp: '2026-03-18 10:00:00.200',
        level: 'INF',
        message: 'Node.Recognition.Succeeded',
        details: { task_id: 1, name: 'PopupHandler', reco_id: 101 },
        _lineNumber: 102,
      },
      {
        timestamp: '2026-03-18 10:00:00.300',
        level: 'INF',
        message: 'Node.PipelineNode.Succeeded',
        details: { task_id: 1, name: 'PopupHandler', node_id: 201 },
        _lineNumber: 103,
      },
      {
        timestamp: '2026-03-18 10:00:01.000',
        level: 'ERR',
        message: 'Node.Action.Failed',
        details: { task_id: 1, name: 'FightBoss', action_id: 301, node_id: 401 },
        _lineNumber: 110,
      },
      {
        timestamp: '2026-03-18 10:00:01.100',
        level: 'ERR',
        message: 'Node.PipelineNode.Failed',
        details: { task_id: 1, name: 'FightBoss', node_id: 401 },
        _lineNumber: 111,
      },
      {
        timestamp: '2026-03-18 10:00:01.900',
        level: 'ERR',
        message: 'Tasker.Task.Failed',
        details: { task_id: 1, entry: 'Start' },
        _lineNumber: 118,
      },
    ]

    const diagnostics = buildEventChainDiagnostics(events)

    expect(diagnostics.eventCount).toBe(events.length)
    expect(diagnostics.nextRecognitionChains.length).toBeGreaterThan(0)
    expect(diagnostics.actionFailureChains.length).toBeGreaterThan(0)
    expect(diagnostics.onErrorChains.length).toBeGreaterThan(0)

    const nextChain = diagnostics.nextRecognitionChains[0]
    expect(nextChain.hasJumpBackCandidate).toBe(true)
    expect(nextChain.outcomeEvent).toBe('Node.PipelineNode.Succeeded')

    const actionChain = diagnostics.actionFailureChains[0]
    expect(actionChain.hasPipelineFailed).toBe(true)
    expect(actionChain.hasTaskFailed).toBe(true)
    expect(actionChain.riskLevel).toBe('high')

    const onError = diagnostics.onErrorChains[0]
    expect(onError.triggerType).toBe('action_failed')
    expect(onError.outcomeEvent).toBe('Tasker.Task.Failed')
  })

  it('classifies timeout/no-hit path as reco_timeout_or_nohit', () => {
    const events = [
      {
        timestamp: '2026-03-18 11:00:00.000',
        level: 'INF',
        message: 'Node.NextList.Starting',
        details: { task_id: 2, name: 'MainNode', list: [{ name: 'RecoA', jump_back: false, anchor: false }] },
        _lineNumber: 200,
      },
      {
        timestamp: '2026-03-18 11:00:00.050',
        level: 'INF',
        message: 'Node.Recognition.Failed',
        details: { task_id: 2, name: 'RecoA', reco_id: 501 },
        _lineNumber: 201,
      },
      {
        timestamp: '2026-03-18 11:00:00.060',
        level: 'INF',
        message: 'Node.NextList.Failed',
        details: { task_id: 2, name: 'MainNode', list: [{ name: 'RecoA', jump_back: false, anchor: false }] },
        _lineNumber: 202,
      },
      {
        timestamp: '2026-03-18 11:00:00.200',
        level: 'INF',
        message: 'Node.NextList.Failed',
        details: { task_id: 2, name: 'MainNode', list: [{ name: 'RecoA', jump_back: false, anchor: false }] },
        _lineNumber: 203,
      },
      {
        timestamp: '2026-03-18 11:00:00.400',
        level: 'ERR',
        message: 'Node.PipelineNode.Failed',
        details: { task_id: 2, name: 'MainNode', node_id: 601 },
        _lineNumber: 204,
      },
      {
        timestamp: '2026-03-18 11:00:00.500',
        level: 'INF',
        message: 'Node.NextList.Starting',
        details: { task_id: 2, name: 'MainNode', list: [{ name: 'FallbackNode', jump_back: false, anchor: false }] },
        _lineNumber: 205,
      },
    ]

    const diagnostics = buildEventChainDiagnostics(events)
    const timeoutChain = diagnostics.onErrorChains.find(item => item.triggerType === 'reco_timeout_or_nohit')

    expect(timeoutChain).toBeTruthy()
    expect(timeoutChain?.triggerEvent).toBe('Node.NextList.Failed')
    expect(timeoutChain?.timeoutLikeFailureCount).toBeGreaterThanOrEqual(2)
    expect(timeoutChain?.fallbackFirstNode).toBe('FallbackNode')
  })

  it('classifies repeated pipeline failure without fresh NextList failure as error_handling_loop', () => {
    const events: EventNotification[] = []
    events.push(makeEvent('Node.NextList.Failed', { task_id: 3, name: 'RetryNode', list: [{ name: 'A' }] }, 300))
    for (let i = 0; i < 9; i += 1) {
      events.push(makeEvent('Node.Recognition.Starting', { task_id: 3, name: `Filler${i}`, reco_id: 700 + i }, 301 + i))
    }
    events.push(makeEvent('Node.PipelineNode.Failed', { task_id: 3, name: 'RetryNode', node_id: 901 }, 310))
    for (let i = 0; i < 34; i += 1) {
      events.push(makeEvent('Node.Recognition.Starting', { task_id: 3, name: `Gap${i}`, reco_id: 800 + i }, 311 + i))
    }
    events.push(makeEvent('Node.PipelineNode.Failed', { task_id: 3, name: 'RetryNode', node_id: 901 }, 345))

    const diagnostics = buildEventChainDiagnostics(events)
    const loopChain = diagnostics.onErrorChains.find(item => item.triggerType === 'error_handling_loop')

    expect(loopChain).toBeTruthy()
    expect(loopChain?.triggerEvent).toBe('Node.PipelineNode.Failed')
    expect(loopChain?.triggerNode).toBe('RetryNode')
  })
})

describe('buildAiAnalysisContext', () => {
  it('includes onErrorChains in generated context payload', () => {
    const task: TaskInfo = {
      task_id: 42,
      entry: 'Start',
      hash: 'h1',
      uuid: 'u1',
      start_time: '2026-03-18 13:00:00.000',
      end_time: '2026-03-18 13:00:02.000',
      status: 'failed',
      nodes: [
        {
          node_id: 1001,
          name: 'MainNode',
          timestamp: '2026-03-18 13:00:01.200',
          status: 'failed',
          task_id: 42,
          next_list: [{ name: 'FallbackNode', anchor: false, jump_back: false }],
          recognition_attempts: [
            {
              reco_id: 5001,
              name: 'RecoA',
              timestamp: '2026-03-18 13:00:01.050',
              status: 'failed',
            },
          ],
        },
      ],
      events: [
        makeEvent('Node.NextList.Starting', { task_id: 42, name: 'MainNode', list: [{ name: 'RecoA', jump_back: false, anchor: false }] }, 400),
        makeEvent('Node.Recognition.Failed', { task_id: 42, name: 'RecoA', reco_id: 5001 }, 401),
        makeEvent('Node.NextList.Failed', { task_id: 42, name: 'MainNode', list: [{ name: 'RecoA', jump_back: false, anchor: false }] }, 402),
        makeEvent('Node.PipelineNode.Failed', { task_id: 42, name: 'MainNode', node_id: 1001 }, 403),
        makeEvent('Node.NextList.Starting', { task_id: 42, name: 'MainNode', list: [{ name: 'FallbackNode', jump_back: false, anchor: false }] }, 404),
        makeEvent('Tasker.Task.Failed', { task_id: 42, entry: 'Start' }, 405),
      ],
      duration: 2000,
      _startEventIndex: 0,
      _endEventIndex: 5,
    }

    const context = buildAiAnalysisContext({
      tasks: [task],
      selectedTask: task,
      question: '请分析 on_error 触发源',
      includeKnowledgePack: false,
      includeSignalLines: false,
    }) as any

    const chains = context.eventChainDiagnostics?.onErrorChains
    expect(Array.isArray(chains)).toBe(true)
    expect(chains.length).toBeGreaterThan(0)
    expect(chains[0].triggerType).toBe('reco_timeout_or_nohit')
    expect(chains[0].triggerEvent).toBe('Node.NextList.Failed')
  })
})
