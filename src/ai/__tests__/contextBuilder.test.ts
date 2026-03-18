import { describe, expect, it } from 'vitest'
import { buildDeterministicFindings, buildEventChainDiagnostics, buildSignalDiagnostics } from '../contextBuilder'

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
  it('extracts next/recognition chains and action failure escalation chains', () => {
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

    const nextChain = diagnostics.nextRecognitionChains[0]
    expect(nextChain.hasJumpBackCandidate).toBe(true)
    expect(nextChain.outcomeEvent).toBe('Node.PipelineNode.Succeeded')

    const actionChain = diagnostics.actionFailureChains[0]
    expect(actionChain.hasPipelineFailed).toBe(true)
    expect(actionChain.hasTaskFailed).toBe(true)
    expect(actionChain.riskLevel).toBe('high')
  })
})
