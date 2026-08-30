import { describe, expect, it } from 'vitest'
import type { TaskInfo } from '../shared/types'
import { NodeStatisticsAnalyzer, percentile, summarizeDurations } from '../node/statistics'

describe('NodeStatisticsAnalyzer', () => {
  it('includes a single recognition attempt in duration statistics', () => {
    const tasks: TaskInfo[] = [
      {
        task_id: 1,
        entry: 'Main',
        hash: '',
        uuid: '',
        start_time: '2026-01-01 00:00:00.000',
        end_time: '2026-01-01 00:00:00.300',
        status: 'succeeded',
        events: [],
        nodes: [
          {
            node_id: 1,
            task_id: 1,
            name: 'SingleReco',
            ts: '2026-01-01 00:00:00.000',
            end_ts: '2026-01-01 00:00:00.300',
            status: 'success',
            next_list: [],
            node_flow: [
              {
                id: 'reco-1',
                type: 'recognition',
                name: 'Reco',
                status: 'success',
                ts: '2026-01-01 00:00:00.050',
                end_ts: '2026-01-01 00:00:00.150',
                reco_id: 1,
              },
            ],
          },
        ],
      },
    ]

    const [statistics] = NodeStatisticsAnalyzer.analyzeRecognitionAction(tasks)
    expect(statistics.recognitionCount).toBe(1)
    expect(statistics.avgRecognitionDuration).toBe(100)
    expect(statistics.avgActionDuration).toBe(150)
  })

  it('aggregates wait freeze phases, elapsed, reco ids and images by node name', () => {
    const tasks: TaskInfo[] = [
      {
        task_id: 4,
        entry: 'WaitFreeze',
        hash: '',
        uuid: '',
        start_time: '2026-01-01 00:00:00.000',
        end_time: '2026-01-01 00:00:01.000',
        status: 'succeeded',
        events: [],
        nodes: [
          {
            node_id: 4,
            task_id: 4,
            name: 'Gate',
            ts: '2026-01-01 00:00:00.000',
            end_ts: '2026-01-01 00:00:01.000',
            status: 'success',
            next_list: [],
            node_flow: [
              {
                id: 'wf-1',
                type: 'wait_freezes',
                name: 'Gate',
                status: 'success',
                ts: '2026-01-01 00:00:00.100',
                end_ts: '2026-01-01 00:00:00.200',
                wait_freezes_details: {
                  wf_id: 1,
                  phase: 'pre',
                  elapsed: 100,
                  reco_ids: [1, 2],
                  images: ['wait-1.jpg'],
                },
              },
              {
                id: 'wf-2',
                type: 'wait_freezes',
                name: 'Gate',
                status: 'failed',
                ts: '2026-01-01 00:00:00.300',
                end_ts: '2026-01-01 00:00:00.600',
                wait_freezes_details: {
                  wf_id: 2,
                  phase: 'repeat',
                  elapsed: 300,
                  reco_ids: [3],
                },
              },
              {
                id: 'wf-3',
                type: 'wait_freezes',
                name: 'Gate',
                status: 'success',
                ts: '2026-01-01 00:00:00.700',
                end_ts: '2026-01-01 00:00:00.750',
                wait_freezes_details: {
                  wf_id: 3,
                  phase: 'post',
                  elapsed: 50,
                },
              },
            ],
          },
        ],
      },
    ]

    const [statistics] = NodeStatisticsAnalyzer.analyzeWaitFreezes(tasks)
    expect(statistics.name).toBe('Gate')
    expect(statistics.count).toBe(3)
    expect(statistics.preCount).toBe(1)
    expect(statistics.repeatCount).toBe(1)
    expect(statistics.postCount).toBe(1)
    expect(statistics.avgElapsed).toBe(150)
    expect(statistics.minElapsed).toBe(50)
    expect(statistics.maxElapsed).toBe(300)
    expect(statistics.successRate).toBeCloseTo(66.7, 1)
    expect(statistics.totalRecoIds).toBe(3)
    expect(statistics.imageCount).toBe(1)
  })

  it('computes duration percentiles', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(4.8)
    expect(percentile([], 95)).toBe(0)
  })

  it('summarizes arrays larger than the JavaScript argument limit', () => {
    expect(summarizeDurations(new Array(200_000).fill(5))).toEqual({
      total: 1_000_000,
      average: 5,
      min: 5,
      max: 5,
    })
  })

  it('ignores non-finite durations instead of emitting invalid statistics', () => {
    expect(summarizeDurations([Number.NaN, Number.POSITIVE_INFINITY, 5])).toEqual({
      total: 5,
      average: 5,
      min: 5,
      max: 5,
    })

    const tasks: TaskInfo[] = [
      {
        task_id: 2,
        entry: 'InvalidTime',
        hash: '',
        uuid: '',
        start_time: 'invalid',
        end_time: 'invalid',
        status: 'failed',
        events: [],
        nodes: [
          {
            node_id: 2,
            task_id: 2,
            name: 'InvalidNode',
            ts: 'invalid',
            end_ts: 'invalid',
            status: 'failed',
            next_list: [],
          },
        ],
      },
    ]

    expect(NodeStatisticsAnalyzer.analyze(tasks)).toEqual([])
  })

  it('uses a node end timestamp before the next node start', () => {
    const tasks: TaskInfo[] = [
      {
        task_id: 3,
        entry: 'NodeDuration',
        hash: '',
        uuid: '',
        start_time: '2026-01-01 00:00:00.000',
        end_time: '2026-01-01 00:00:00.700',
        status: 'succeeded',
        events: [],
        nodes: [
          {
            node_id: 31,
            task_id: 3,
            name: 'FirstNode',
            ts: '2026-01-01 00:00:00.000',
            end_ts: '2026-01-01 00:00:00.100',
            status: 'success',
            next_list: [],
          },
          {
            node_id: 32,
            task_id: 3,
            name: 'SecondNode',
            ts: '2026-01-01 00:00:00.500',
            end_ts: '2026-01-01 00:00:00.700',
            status: 'success',
            next_list: [],
          },
        ],
      },
    ]

    const statistics = NodeStatisticsAnalyzer.analyze(tasks)
    expect(statistics.find((item) => item.name === 'FirstNode')?.avgDuration).toBe(100)
    expect(statistics.find((item) => item.name === 'SecondNode')?.avgDuration).toBe(200)
  })
})
