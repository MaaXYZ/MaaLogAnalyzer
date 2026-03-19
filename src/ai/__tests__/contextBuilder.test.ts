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

  it('adds terminal jump_back bounce finding when hit node likely has no next-list', () => {
    const jumpBackDiagnostics = buildJumpBackFlowDiagnostics([
      makeEvent('Node.NextList.Starting', {
        task_id: 9,
        name: 'CCFlagInCombatMain',
        list: [{ name: 'CCCombatEnd', anchor: false, jump_back: true }],
      }, 900),
      makeEvent('Node.Recognition.Succeeded', { task_id: 9, name: 'CCCombatEnd', reco_id: 9901 }, 901),
      makeEvent('Node.PipelineNode.Succeeded', { task_id: 9, name: 'CCCombatEnd', node_id: 9902 }, 902),
      makeEvent('Node.NextList.Starting', {
        task_id: 9,
        name: 'CCFlagInCombatMain',
        list: [{ name: 'CCCombatEnd', anchor: false, jump_back: true }],
      }, 903),
    ])

    const findings = buildDeterministicFindings(
      {
        longStayNodes: [
          {
            node: 'CCFlagInCombatMain',
            occurrences: 120,
            spanMs: 450000,
            failedRecoCount: 600,
            successRecoCount: 120,
          },
        ],
        repeatedRuns: [],
        hotspotRecoPairs: [],
      },
      null,
      {
        taskStatus: 'succeeded',
        pipelineFailedCount: 1,
        jumpBackHotNodes: ['CCFlagInCombatMain'],
        jumpBackFlowDiagnostics: jumpBackDiagnostics,
      }
    )

    const bounceFinding = findings.findings.find(item => item.id === 'jumpback_terminal_bounce_loop')
    expect(bounceFinding).toBeTruthy()
    expect(bounceFinding?.summary).toContain('命中后回跳且命中节点疑似无后继')
  })

  it('adds nested action failure finding when nested diagnostics report failures', () => {
    const findings = buildDeterministicFindings(
      {
        longStayNodes: [],
        repeatedRuns: [],
        hotspotRecoPairs: [],
      },
      null,
      {
        taskStatus: 'succeeded',
        pipelineFailedCount: 1,
        jumpBackHotNodes: [],
        nestedActionDiagnostics: {
          parentNodeWithNestedCount: 2,
          parentNodeWithNestedFailureCount: 1,
          nestedGroupCount: 3,
          nestedGroupFailedCount: 1,
          nestedActionCount: 6,
          nestedActionFailedCount: 4,
          topParentNodes: [
            {
              node: 'CCBuyCard',
              nodeId: 33001,
              timestamp: '2026-03-18 10:00:00.000',
              nestedGroupCount: 2,
              nestedGroupFailedCount: 1,
              nestedActionCount: 5,
              nestedActionFailedCount: 4,
              upstreamJumpBackHitCount: 12,
              upstreamJumpBackTerminalBounceCount: 7,
              upstreamJumpBackSources: [
                {
                  fromNode: 'CCFlagInCombatMain',
                  hitCount: 12,
                  terminalBounceCount: 7,
                },
              ],
              topFailedNestedActionNames: [{ name: 'BuyCardAction', count: 3 }],
            },
          ],
          summary: 'mock',
        },
      }
    )

    const nestedFinding = findings.findings.find(item => item.id === 'nested_action_failure_hotspot')
    expect(nestedFinding).toBeTruthy()
    expect(nestedFinding?.summary).toContain('nested/custom action 失败 4 次')
    expect(nestedFinding?.summary).toContain('直接父节点热点为 CCBuyCard')
    expect(nestedFinding?.summary).toContain('CCFlagInCombatMain -> CCBuyCard')
    expect(nestedFinding?.confidence).toBeGreaterThanOrEqual(84)
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

  it('treats Node.ActionNode.Failed as action_failed trigger', () => {
    const events = [
      makeEvent('Node.NextList.Starting', { task_id: 21, name: 'CCBuyCard', list: [{ name: 'A', jump_back: false, anchor: false }] }, 2100),
      makeEvent('Node.ActionNode.Failed', { task_id: 21, name: 'CCBuyCard', action_id: 3101, node_id: 4101 }, 2101),
      makeEvent('Node.PipelineNode.Failed', { task_id: 21, name: 'CCBuyCard', node_id: 4101 }, 2102),
      makeEvent('Tasker.Task.Succeeded', { task_id: 21, entry: 'DemoCard' }, 2103),
    ]

    const diagnostics = buildEventChainDiagnostics(events)
    const actionChain = diagnostics.actionFailureChains[0]
    const onError = diagnostics.onErrorChains.find(item => item.triggerType === 'action_failed')

    expect(diagnostics.messageCounts.actionFailed).toBe(1)
    expect(actionChain).toBeTruthy()
    expect(actionChain.summary).toContain('Node.ActionNode.Failed')
    expect(onError).toBeTruthy()
    expect(onError?.triggerEvent).toBe('Node.ActionNode.Failed')
  })

  it('treats PipelineNode.Failed with action_details.success=false as implicit action_failed', () => {
    const events = [
      makeEvent('Node.NextList.Starting', { task_id: 22, name: 'CCBuyCard', list: [{ name: 'A', jump_back: false, anchor: false }] }, 2200),
      makeEvent('Node.PipelineNode.Failed', {
        task_id: 22,
        name: 'CCBuyCard',
        node_id: 4201,
        action_details: { action_id: 5201, action: 'Click', name: 'CCBuyCard', success: false },
      }, 2201),
      makeEvent('Tasker.Task.Succeeded', { task_id: 22, entry: 'DemoCard' }, 2202),
    ]

    const diagnostics = buildEventChainDiagnostics(events)
    const actionChain = diagnostics.actionFailureChains.find(item => item.actionId === 5201)
    const onError = diagnostics.onErrorChains.find(
      item => item.triggerType === 'action_failed' && item.triggerEvent === 'Node.PipelineNode.Failed'
    )

    expect(actionChain).toBeTruthy()
    expect(actionChain?.summary).toContain('implicit_action_failed')
    expect(onError).toBeTruthy()
    expect(onError?.triggerActionId).toBe(5201)
  })

  it('prefers nearby ActionNode.Failed over timeout/no-hit when names differ but task matches', () => {
    const events = [
      makeEvent('Node.NextList.Starting', { task_id: 23, name: 'CCBuyCard', list: [{ name: 'RecoA', jump_back: false, anchor: false }] }, 2300),
      makeEvent('Node.Recognition.Failed', { task_id: 23, name: 'RecoA', reco_id: 5301 }, 2301),
      makeEvent('Node.NextList.Failed', { task_id: 23, name: 'CCBuyCard', list: [{ name: 'RecoA', jump_back: false, anchor: false }] }, 2302),
      makeEvent('Node.ActionNode.Failed', { task_id: 23, name: 'CCBuyCard_ActionNodeX', action_id: 6301, node_id: 7301 }, 2303),
      makeEvent('Node.PipelineNode.Failed', { task_id: 23, name: 'CCBuyCard', node_id: 7302 }, 2304),
      makeEvent('Tasker.Task.Succeeded', { task_id: 23, entry: 'DemoCard' }, 2305),
    ]

    const diagnostics = buildEventChainDiagnostics(events)
    const actionChains = diagnostics.onErrorChains.filter(item => item.triggerType === 'action_failed')
    const timeoutChains = diagnostics.onErrorChains.filter(item => item.triggerType === 'reco_timeout_or_nohit')

    expect(actionChains.length).toBeGreaterThan(0)
    expect(timeoutChains.length).toBe(0)
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

  it('treats partial miss then success as recovered phenomenon (not hard failure)', () => {
    const events: EventNotification[] = [
      makeEvent('Node.NextList.Starting', {
        task_id: 61,
        name: 'RecoverStage',
        list: [{ name: 'RecoA', anchor: false, jump_back: false }, { name: 'RecoB', anchor: false, jump_back: false }],
      }, 610),
      makeEvent('Node.Recognition.Starting', { task_id: 61, name: 'RecoA', reco_id: 9610 }, 611),
      makeEvent('Node.Recognition.Failed', { task_id: 61, name: 'RecoA', reco_id: 9610 }, 612),
      makeEvent('Node.Recognition.Starting', { task_id: 61, name: 'RecoB', reco_id: 9611 }, 613),
      makeEvent('Node.Recognition.Succeeded', { task_id: 61, name: 'RecoB', reco_id: 9611 }, 614),
      makeEvent('Node.NextList.Succeeded', { task_id: 61, name: 'RecoverStage', list: [{ name: 'RecoA' }, { name: 'RecoB' }] }, 615),
    ]

    const diagnostics = buildNextCandidateAvailabilityDiagnostics(events)

    expect(diagnostics.failedTimeoutLikeCount).toBe(0)
    expect(diagnostics.recoveredAfterPartialMissCount).toBe(1)
    expect(diagnostics.partialMissRecoveredByNode[0]?.node).toBe('RecoverStage')
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

  it('marks terminal-like jump_back bounce when hit candidate returns without its own NextList', () => {
    const events: EventNotification[] = [
      makeEvent('Node.NextList.Starting', {
        task_id: 81,
        name: 'ParentTerminal',
        list: [{ name: 'JumpTerminal', anchor: false, jump_back: true }],
      }, 810),
      makeEvent('Node.Recognition.Succeeded', { task_id: 81, name: 'JumpTerminal', reco_id: 9810 }, 811),
      makeEvent('Node.PipelineNode.Succeeded', { task_id: 81, name: 'JumpTerminal', node_id: 9811 }, 812),
      makeEvent('Node.NextList.Starting', {
        task_id: 81,
        name: 'ParentTerminal',
        list: [{ name: 'JumpTerminal', anchor: false, jump_back: true }],
      }, 813),

      makeEvent('Node.NextList.Starting', {
        task_id: 81,
        name: 'ParentNormal',
        list: [{ name: 'JumpNormal', anchor: false, jump_back: true }],
      }, 814),
      makeEvent('Node.Recognition.Succeeded', { task_id: 81, name: 'JumpNormal', reco_id: 9812 }, 815),
      makeEvent('Node.NextList.Starting', {
        task_id: 81,
        name: 'JumpNormal',
        list: [{ name: 'AfterJump', anchor: false, jump_back: false }],
      }, 816),
      makeEvent('Node.NextList.Starting', {
        task_id: 81,
        name: 'ParentNormal',
        list: [{ name: 'JumpNormal', anchor: false, jump_back: true }],
      }, 817),
    ]

    const diagnostics = buildJumpBackFlowDiagnostics(events)

    expect(diagnostics.terminalBounceCount).toBe(1)
    expect(diagnostics.terminalBounceCases.length).toBeGreaterThan(0)
    expect(diagnostics.terminalBounceCases[0].startNode).toBe('ParentTerminal')
    expect(diagnostics.suspiciousCases.some(item => item.terminalBounceLikely)).toBe(true)
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

  it('includes questionNodeDiagnostics for explicitly asked node', () => {
    const task: TaskInfo = {
      task_id: 77,
      entry: 'DemoEntry',
      hash: 'h77',
      uuid: 'u77',
      start_time: '2026-03-18 14:00:00.000',
      end_time: '2026-03-18 14:00:03.000',
      status: 'succeeded',
      nodes: [
        {
          node_id: 7701,
          name: 'CCFlagInCombatMain',
          timestamp: '2026-03-18 14:00:00.100',
          status: 'success',
          task_id: 77,
          next_list: [{ name: 'CCBuyCard', anchor: false, jump_back: true }],
          recognition_attempts: [
            { reco_id: 8701, name: 'CCBuyCard', timestamp: '2026-03-18 14:00:00.120', status: 'success' },
          ],
        },
        {
          node_id: 7702,
          name: 'CCBuyCard',
          timestamp: '2026-03-18 14:00:00.300',
          status: 'success',
          task_id: 77,
          action_details: { action_id: 9701, action: 'Custom', box: [0, 0, 0, 0], detail: null, name: 'CCBuyCard', success: true },
          next_list: [],
          recognition_attempts: [
            { reco_id: 8702, name: 'CritterCrash', timestamp: '2026-03-18 14:00:00.310', status: 'failed' },
          ],
          nested_action_nodes: [
            {
              task_id: 177,
              name: 'SubTask',
              timestamp: '2026-03-18 14:00:00.320',
              status: 'success',
              nested_actions: [
                {
                  node_id: 17701,
                  name: 'SubActionNode',
                  timestamp: '2026-03-18 14:00:00.321',
                  status: 'success',
                  recognition_attempts: [
                    { reco_id: 18701, name: 'SubReco', timestamp: '2026-03-18 14:00:00.322', status: 'success' },
                  ],
                },
              ],
            },
          ],
        },
      ],
      events: [
        makeEvent('Node.NextList.Starting', { task_id: 77, name: 'CCFlagInCombatMain', list: [{ name: 'CCBuyCard', jump_back: true, anchor: false }] }, 770),
        makeEvent('Node.Recognition.Succeeded', { task_id: 77, name: 'CCBuyCard', reco_id: 8701 }, 771),
        makeEvent('Node.PipelineNode.Succeeded', { task_id: 77, name: 'CCBuyCard', node_id: 7702 }, 772),
        makeEvent('Node.NextList.Starting', { task_id: 77, name: 'CCFlagInCombatMain', list: [{ name: 'CCBuyCard', jump_back: true, anchor: false }] }, 773),
        makeEvent('Tasker.Task.Succeeded', { task_id: 77, entry: 'DemoEntry' }, 774),
      ],
      duration: 3000,
      _startEventIndex: 0,
      _endEventIndex: 4,
    }

    const context = buildAiAnalysisContext({
      tasks: [task],
      selectedTask: task,
      question: '给出你知道的 CCBuyCard 相关数据',
      includeKnowledgePack: false,
      includeSignalLines: false,
    }) as any

    const diagnostics = Array.isArray(context.questionNodeDiagnostics) ? context.questionNodeDiagnostics : []
    expect(diagnostics.length).toBeGreaterThan(0)
    const target = diagnostics.find((item: any) => item.node === 'CCBuyCard')
    expect(target).toBeTruthy()
    expect(target.occurrences).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(target.jumpBackCandidates)).toBe(true)
    expect(target.nestedActionGroupCount).toBeGreaterThanOrEqual(1)
  })

  it('includes nestedActionDiagnostics summary when nested failures exist', () => {
    const task: TaskInfo = {
      task_id: 88,
      entry: 'DemoNested',
      hash: 'h88',
      uuid: 'u88',
      start_time: '2026-03-18 15:00:00.000',
      end_time: '2026-03-18 15:00:03.000',
      status: 'succeeded',
      nodes: [
        {
          node_id: 8801,
          name: 'ParentNode',
          timestamp: '2026-03-18 15:00:01.000',
          status: 'success',
          task_id: 88,
          next_list: [],
          recognition_attempts: [],
          nested_action_nodes: [
            {
              task_id: 188,
              name: 'SubTaskA',
              timestamp: '2026-03-18 15:00:01.100',
              status: 'failed',
              nested_actions: [
                {
                  node_id: 18801,
                  name: 'SubActionA',
                  timestamp: '2026-03-18 15:00:01.110',
                  status: 'failed',
                },
              ],
            },
          ],
        },
      ],
      events: [
        makeEvent('Tasker.Task.Starting', { task_id: 88, entry: 'DemoNested' }, 880),
        makeEvent('Tasker.Task.Succeeded', { task_id: 88, entry: 'DemoNested' }, 881),
      ],
      duration: 3000,
      _startEventIndex: 0,
      _endEventIndex: 1,
    }

    const context = buildAiAnalysisContext({
      tasks: [task],
      selectedTask: task,
      question: '分析这个任务',
      includeKnowledgePack: false,
      includeSignalLines: false,
    }) as any

    const nested = context.nestedActionDiagnostics
    expect(nested).toBeTruthy()
    expect(nested.nestedActionFailedCount).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(nested.topParentNodes)).toBe(true)
    expect(nested.topParentNodes[0]?.node).toBe('ParentNode')
  })

  it('keeps nested action direct-parent and jump_back upstream chain distinct', () => {
    const task: TaskInfo = {
      task_id: 89,
      entry: 'DemoNestedJumpBack',
      hash: 'h89',
      uuid: 'u89',
      start_time: '2026-03-18 15:10:00.000',
      end_time: '2026-03-18 15:10:03.000',
      status: 'succeeded',
      nodes: [
        {
          node_id: 8901,
          name: 'CCBuyCard',
          timestamp: '2026-03-18 15:10:01.000',
          status: 'success',
          task_id: 89,
          next_list: [],
          recognition_attempts: [],
          nested_action_nodes: [
            {
              task_id: 189,
              name: 'CCUpdate',
              timestamp: '2026-03-18 15:10:01.100',
              status: 'failed',
              nested_actions: [
                {
                  node_id: 18901,
                  name: 'CCUpdateAction',
                  timestamp: '2026-03-18 15:10:01.110',
                  status: 'failed',
                },
              ],
            },
          ],
        },
      ],
      events: [
        makeEvent('Node.NextList.Starting', {
          task_id: 89,
          name: 'CCFlagInCombatMain',
          list: [{ name: 'CCBuyCard', anchor: false, jump_back: true }],
        }, 891),
        makeEvent('Node.Recognition.Succeeded', {
          task_id: 89,
          name: 'CCBuyCard',
          reco_id: 8911,
        }, 892),
        makeEvent('Node.PipelineNode.Succeeded', {
          task_id: 89,
          name: 'CCBuyCard',
          node_id: 8901,
        }, 893),
        makeEvent('Node.NextList.Starting', {
          task_id: 89,
          name: 'CCFlagInCombatMain',
          list: [{ name: 'CCBuyCard', anchor: false, jump_back: true }],
        }, 894),
        makeEvent('Tasker.Task.Succeeded', { task_id: 89, entry: 'DemoNestedJumpBack' }, 895),
      ],
      duration: 3000,
      _startEventIndex: 0,
      _endEventIndex: 4,
    }

    const context = buildAiAnalysisContext({
      tasks: [task],
      selectedTask: task,
      question: '分析 CCBuyCard',
      includeKnowledgePack: false,
      includeSignalLines: false,
    }) as any

    const nested = context.nestedActionDiagnostics
    expect(nested).toBeTruthy()
    expect(nested.topParentNodes[0]?.node).toBe('CCBuyCard')
    expect(nested.topParentNodes[0]?.upstreamJumpBackSources?.[0]?.fromNode).toBe('CCFlagInCombatMain')
    expect(nested.summary).toContain('CCFlagInCombatMain -> CCBuyCard')
  })

  it('uses action_details.name as nested direct parent when pipeline node name differs', () => {
    const task: TaskInfo = {
      task_id: 90,
      entry: 'DemoActionParent',
      hash: 'h90',
      uuid: 'u90',
      start_time: '2026-03-18 15:20:00.000',
      end_time: '2026-03-18 15:20:03.000',
      status: 'succeeded',
      nodes: [
        {
          node_id: 9001,
          name: 'CCFlagInCombatMain',
          timestamp: '2026-03-18 15:20:01.000',
          status: 'success',
          task_id: 90,
          action_details: {
            action_id: 90011,
            action: 'Click',
            box: [0, 0, 0, 0],
            detail: null,
            name: 'CCBuyCard',
            success: false,
          },
          next_list: [],
          recognition_attempts: [],
          nested_action_nodes: [
            {
              task_id: 190,
              name: 'CCUpdate',
              timestamp: '2026-03-18 15:20:01.100',
              status: 'failed',
              nested_actions: [
                {
                  node_id: 19001,
                  name: 'CCUpdateAction',
                  timestamp: '2026-03-18 15:20:01.110',
                  status: 'failed',
                },
              ],
            },
          ],
        },
      ],
      events: [
        makeEvent('Node.NextList.Starting', {
          task_id: 90,
          name: 'CCFlagInCombatMain',
          list: [{ name: 'CCBuyCard', anchor: false, jump_back: true }],
        }, 901),
        makeEvent('Node.Recognition.Succeeded', {
          task_id: 90,
          name: 'CCBuyCard',
          reco_id: 9011,
        }, 902),
        makeEvent('Node.PipelineNode.Succeeded', {
          task_id: 90,
          name: 'CCFlagInCombatMain',
          node_id: 9001,
        }, 903),
        makeEvent('Node.NextList.Starting', {
          task_id: 90,
          name: 'CCFlagInCombatMain',
          list: [{ name: 'CCBuyCard', anchor: false, jump_back: true }],
        }, 904),
        makeEvent('Tasker.Task.Succeeded', { task_id: 90, entry: 'DemoActionParent' }, 905),
      ],
      duration: 3000,
      _startEventIndex: 0,
      _endEventIndex: 4,
    }

    const context = buildAiAnalysisContext({
      tasks: [task],
      selectedTask: task,
      question: '分析 CCBuyCard',
      includeKnowledgePack: false,
      includeSignalLines: false,
    }) as any

    const nested = context.nestedActionDiagnostics
    expect(nested).toBeTruthy()
    expect(nested.topParentNodes[0]?.node).toBe('CCBuyCard')
    expect(nested.topParentNodes[0]?.upstreamJumpBackSources?.[0]?.fromNode).toBe('CCFlagInCombatMain')
    expect(nested.summary).toContain('CCFlagInCombatMain -> CCBuyCard')
  })
})
