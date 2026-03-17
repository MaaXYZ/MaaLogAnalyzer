import { describe, expect, it } from 'vitest'
import { buildDeterministicFindings, buildSignalDiagnostics } from '../contextBuilder'

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
})

