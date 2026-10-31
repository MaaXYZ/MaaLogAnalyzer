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

  it('keeps running nodes out of the metrics but discloses them as unsettled', () => {
    // 复刻 small.log 的形状：任务 #2 里同名节点成功一次、运行中一次（末尾无 end_ts、无下一个节点），
    // 旧实现会静默把运行中实例丢掉，导致「任务卡 2 个节点 / 统计 1 次」对不上账且无任何说明。
    const tasks: TaskInfo[] = [
      {
        task_id: 5,
        entry: 'RunningTask',
        hash: '',
        uuid: '',
        start_time: '2026-01-01 00:00:00.000',
        status: 'running',
        events: [],
        nodes: [
          {
            node_id: 51,
            task_id: 5,
            name: 'SettledNode',
            ts: '2026-01-01 00:00:00.000',
            end_ts: '2026-01-01 00:00:00.400',
            status: 'success',
            next_list: [],
          },
          {
            node_id: 52,
            task_id: 5,
            name: 'SettledNode',
            ts: '2026-01-01 00:00:00.500',
            status: 'running',
            next_list: [],
          },
        ],
      },
    ]

    const statistics = NodeStatisticsAnalyzer.analyze(tasks)
    const row = statistics.find((item) => item.name === 'SettledNode')
    // 运行中实例的耗时只是下界，不能混进平均值：count 仍只算已结算的 1 次
    expect(row?.count).toBe(1)
    expect(row?.avgDuration).toBe(400)
    expect(row?.unsettledCount).toBe(1)
  })

  it('reports unsettled nodes that have no settled row at all', () => {
    // 只在日志末尾出现的运行中节点在 analyze() 里连行都没有，光靠行上的 unsettledCount
    // 凑不出「14 个实例 vs 13 次」的差额，所以必须能从汇总入口拿到总数与名字。
    const tasks: TaskInfo[] = [
      {
        task_id: 6,
        entry: 'OnlyRunning',
        hash: '',
        uuid: '',
        start_time: '2026-01-01 00:00:00.000',
        status: 'running',
        events: [],
        nodes: [
          {
            node_id: 61,
            task_id: 6,
            name: 'DoneNode',
            ts: '2026-01-01 00:00:00.000',
            end_ts: '2026-01-01 00:00:00.200',
            status: 'success',
            next_list: [],
          },
          {
            node_id: 62,
            task_id: 6,
            name: 'StillRunningMoney',
            ts: '2026-01-01 00:00:00.300',
            status: 'running',
            next_list: [],
          },
        ],
      },
    ]

    const statistics = NodeStatisticsAnalyzer.analyze(tasks)
    expect(statistics.map((item) => item.name)).toEqual(['DoneNode'])
    expect(statistics[0]?.unsettledCount).toBe(0)

    const coverage = NodeStatisticsAnalyzer.summarizeCoverage(tasks)
    expect(coverage.nodeInstances).toBe(2)
    expect(coverage.settledExecutions).toBe(1)
    expect(coverage.unsettledExecutions).toBe(1)
    expect(coverage.unsettledNames).toEqual(['StillRunningMoney'])
  })

  it('reconciles settled executions plus unsettled nodes with the task node count', () => {
    // 口径自检：已结算次数 + 未结算次数 == 节点实例总数（small.log: 13 + 1 == 14），
    // 识别/动作表的差额也能被同一份覆盖信息解释（focus 日志: 138 - 137 = 1 个无识别记录）。
    const node = (params: {
      nodeId: number
      name: string
      status: 'success' | 'failed' | 'running'
      ts: string
      attempts: number
    }): TaskInfo['nodes'][number] => ({
      node_id: params.nodeId,
      task_id: 7,
      name: params.name,
      ts: params.ts,
      end_ts: params.status === 'running' ? undefined : params.ts,
      status: params.status,
      next_list: [],
      node_flow: Array.from({ length: params.attempts }, (_, index) => ({
        id: `recognition:7:${params.nodeId}:${index}`,
        type: 'recognition' as const,
        name: params.name,
        status: params.status === 'failed' ? ('failed' as const) : ('success' as const),
        ts: params.ts,
      })),
    })

    const tasks: TaskInfo[] = [
      {
        task_id: 7,
        entry: 'Ledger',
        hash: '',
        uuid: '',
        start_time: '2026-01-01 00:00:00.000',
        status: 'running',
        events: [],
        nodes: [
          node({
            nodeId: 71,
            name: 'A',
            status: 'success',
            ts: '2026-01-01 00:00:00.000',
            attempts: 1,
          }),
          node({
            nodeId: 72,
            name: 'B',
            status: 'failed',
            ts: '2026-01-01 00:00:00.200',
            attempts: 2,
          }),
          node({
            nodeId: 73,
            name: 'C',
            status: 'running',
            ts: '2026-01-01 00:00:00.400',
            attempts: 2,
          }),
          node({
            nodeId: 74,
            name: 'D',
            status: 'success',
            ts: '2026-01-01 00:00:00.600',
            attempts: 0,
          }),
        ],
      },
    ]

    const statistics = NodeStatisticsAnalyzer.analyze(tasks)
    const coverage = NodeStatisticsAnalyzer.summarizeCoverage(tasks)

    expect(coverage.nodeInstances).toBe(4)
    expect(coverage.settledExecutions).toBe(3)
    expect(coverage.unsettledExecutions).toBe(1)
    expect(coverage.unsettledNames).toEqual(['C'])
    // 有效应的是 D：已结算但没有识别尝试记录，所以进不了识别/动作表
    expect(coverage.recognitionActionExecutions).toBe(2)
    expect(coverage.recognitionActionExcluded).toBe(2)
    expect(coverage.recognitionActionExcludedNames).toEqual(['C', 'D'])

    const settledFromRows = statistics.reduce((sum, item) => sum + item.count, 0)
    expect(settledFromRows).toBe(coverage.settledExecutions)
    expect(coverage.settledExecutions + coverage.unsettledExecutions).toBe(coverage.nodeInstances)
  })
})
