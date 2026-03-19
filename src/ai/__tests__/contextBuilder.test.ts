import { describe, expect, it } from 'vitest'
import type { EventNotification, TaskInfo } from '../../types'
import {
  buildAnchorResolutionDiagnostics,
  buildAiAnalysisContext,
  buildDeterministicFindings,
  buildEventChainDiagnostics,
  buildJumpBackFlowDiagnostics,
  buildNextCandidateAvailabilityDiagnostics,
  buildSignalDiagnostics,
  buildStopTerminationDiagnostics,
} from '../contextBuilder'

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

describe('buildStopTerminationDiagnostics', () => {
  it('identifies likely active-stop termination when task succeeds after stop-like tail events', () => {
    const events: EventNotification[] = [
      makeEvent('Node.NextList.Starting', { task_id: 5, name: 'InMainWindow', list: [{ name: 'StopNode' }] }, 500),
      makeEvent('Node.Action.Starting', { task_id: 5, name: 'StopTask', action_id: 9001 }, 501),
      makeEvent('Node.PipelineNode.Failed', {
        task_id: 5,
        name: 'InMainWindow',
        node_id: 7001,
        action_details: { action: '', name: '', success: false },
      }, 502),
      makeEvent('Tasker.Task.Succeeded', { task_id: 5, entry: 'DemoEntry' }, 503),
    ]

    const diagnostics = buildStopTerminationDiagnostics(events, 'succeeded')

    expect(diagnostics.likelyActiveStop).toBe(true)
    expect(diagnostics.taskSucceededAfterPipelineFailed).toBe(true)
    expect(diagnostics.taskTerminalEvent).toBe('Tasker.Task.Succeeded')
    expect(diagnostics.pipelineFailedNearTerminal).toBeGreaterThanOrEqual(1)
  })

  it('detects StopNode camel-case chain as active-stop with implicit pattern', () => {
    const events: EventNotification[] = [
      makeEvent('Node.NextList.Starting', { task_id: 51, name: 'InMainWindow', list: [{ name: 'StopNode' }] }, 510),
      makeEvent('Node.Recognition.Succeeded', { task_id: 51, name: 'StopNode', reco_id: 9510 }, 511),
      makeEvent('Node.NextList.Succeeded', { task_id: 51, name: 'InMainWindow', list: [{ name: 'StopNode' }] }, 512),
      makeEvent('Node.Action.Starting', { task_id: 51, name: 'StopNode', action_id: 9511 }, 513),
      makeEvent('Node.PipelineNode.Failed', { task_id: 51, name: 'InMainWindow', node_id: 9512 }, 514),
      makeEvent('Tasker.Task.Succeeded', { task_id: 51, entry: 'DemoStop' }, 515),
    ]

    const diagnostics = buildStopTerminationDiagnostics(events, 'succeeded')

    expect(diagnostics.stopSignalCount).toBe(0)
    expect(diagnostics.implicitStopPatternDetected).toBe(true)
    expect(diagnostics.likelyActiveStop).toBe(true)
    expect(diagnostics.taskTerminalEvent).toBe('Tasker.Task.Succeeded')
  })
})

describe('buildNextCandidateAvailabilityDiagnostics', () => {
  it('separates no-executable-candidate failures from timeout/no-hit failures', () => {
    const events: EventNotification[] = [
      makeEvent('Node.NextList.Starting', {
        task_id: 6,
        name: 'AnchorStage',
        list: [{ name: 'AnchorRef', anchor: true, jump_back: false }],
      }, 600),
      makeEvent('Node.NextList.Failed', {
        task_id: 6,
        name: 'AnchorStage',
        list: [{ name: 'AnchorRef', anchor: true, jump_back: false }],
      }, 601),
      makeEvent('Node.NextList.Starting', {
        task_id: 6,
        name: 'RetryStage',
        list: [{ name: 'RecoA', anchor: false, jump_back: false }],
      }, 602),
      makeEvent('Node.Recognition.Starting', { task_id: 6, name: 'RecoA', reco_id: 9101 }, 603),
      makeEvent('Node.Recognition.Failed', { task_id: 6, name: 'RecoA', reco_id: 9101 }, 604),
      makeEvent('Node.NextList.Failed', {
        task_id: 6,
        name: 'RetryStage',
        list: [{ name: 'RecoA', anchor: false, jump_back: false }],
      }, 605),
    ]

    const diagnostics = buildNextCandidateAvailabilityDiagnostics(events)

    expect(diagnostics.failedNoExecutableCount).toBe(1)
    expect(diagnostics.failedNoExecutableWithAnchorCount).toBe(1)
    expect(diagnostics.failedTimeoutLikeCount).toBe(1)
    expect(diagnostics.suspiciousCases.length).toBeGreaterThan(0)
    expect(diagnostics.suspiciousCases[0].classification).toBe('likely_no_executable_candidate')
  })
})

describe('buildAnchorResolutionDiagnostics', () => {
  it('marks unresolved anchor candidates when NextList fails without recognition attempts', () => {
    const events: EventNotification[] = [
      makeEvent('Node.NextList.Starting', {
        task_id: 7,
        name: 'AnchorStageA',
        list: [{ name: 'AnchorRefA', anchor: true, jump_back: false }],
      }, 700),
      makeEvent('Node.NextList.Failed', {
        task_id: 7,
        name: 'AnchorStageA',
        list: [{ name: 'AnchorRefA', anchor: true, jump_back: false }],
      }, 701),
      makeEvent('Node.NextList.Starting', {
        task_id: 7,
        name: 'AnchorStageB',
        list: [{ name: 'AnchorRefB', anchor: true, jump_back: false }],
      }, 702),
      makeEvent('Node.Recognition.Starting', { task_id: 7, name: 'AnchorRefB', reco_id: 9201 }, 703),
      makeEvent('Node.NextList.Failed', {
        task_id: 7,
        name: 'AnchorStageB',
        list: [{ name: 'AnchorRefB', anchor: true, jump_back: false }],
      }, 704),
    ]

    const diagnostics = buildAnchorResolutionDiagnostics(events)

    expect(diagnostics.unresolvedAnchorLikelyCount).toBe(1)
    expect(diagnostics.failedAfterAnchorResolvedCount).toBe(1)
    expect(diagnostics.suspiciousCases.length).toBeGreaterThan(0)
    expect(diagnostics.suspiciousCases[0].classification).toBe('unresolved_anchor_candidate_likely')
  })
})

describe('buildJumpBackFlowDiagnostics', () => {
  it('captures jump_back hit-then-failed-no-return and hit-then-returned patterns', () => {
    const events: EventNotification[] = [
      makeEvent('Node.NextList.Starting', {
        task_id: 8,
        name: 'ParentA',
        list: [{ name: 'JumpA', anchor: false, jump_back: true }],
      }, 800),
      makeEvent('Node.Recognition.Succeeded', { task_id: 8, name: 'JumpA', reco_id: 9301 }, 801),
      makeEvent('Node.PipelineNode.Failed', { task_id: 8, name: 'ParentA', node_id: 9302 }, 802),
      makeEvent('Tasker.Task.Failed', { task_id: 8, entry: 'DemoA' }, 803),

      makeEvent('Node.NextList.Starting', {
        task_id: 8,
        name: 'ParentB',
        list: [{ name: 'JumpB', anchor: false, jump_back: true }],
      }, 804),
      makeEvent('Node.Recognition.Succeeded', { task_id: 8, name: 'JumpB', reco_id: 9303 }, 805),
      makeEvent('Node.NextList.Starting', {
        task_id: 8,
        name: 'ParentB',
        list: [{ name: 'NormalB', anchor: false, jump_back: false }],
      }, 806),
    ]

    const diagnostics = buildJumpBackFlowDiagnostics(events)

    expect(diagnostics.hitThenFailedNoReturnCount).toBe(1)
    expect(diagnostics.hitThenReturnedCount).toBe(1)
    expect(diagnostics.suspiciousCases.length).toBeGreaterThan(0)
    expect(diagnostics.suspiciousCases[0].classification).toBe('hit_then_failed_no_return')
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
    expect(context.stopTerminationDiagnostics?.likelyActiveStop).toBe(false)
    expect(context.nextCandidateAvailabilityDiagnostics?.failedNoExecutableCount).toBe(0)
    expect(context.nextCandidateAvailabilityDiagnostics?.failedTimeoutLikeCount).toBeGreaterThanOrEqual(1)
    expect(context.anchorResolutionDiagnostics?.unresolvedAnchorLikelyCount).toBe(0)
    expect(context.jumpBackFlowDiagnostics?.hitThenFailedNoReturnCount).toBe(0)
  })
})
