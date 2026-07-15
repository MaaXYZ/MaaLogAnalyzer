import { describe, expect, it } from 'vitest'
import type { TaskInfo } from '../shared/types'
import { NodeStatisticsAnalyzer, summarizeDurations } from '../node/statistics'

describe('NodeStatisticsAnalyzer', () => {
  it('includes a single recognition attempt in duration statistics', () => {
    const tasks: TaskInfo[] = [{
      task_id: 1,
      entry: 'Main',
      hash: '',
      uuid: '',
      start_time: '2026-01-01 00:00:00.000',
      end_time: '2026-01-01 00:00:00.300',
      status: 'succeeded',
      events: [],
      nodes: [{
        node_id: 1,
        task_id: 1,
        name: 'SingleReco',
        ts: '2026-01-01 00:00:00.000',
        end_ts: '2026-01-01 00:00:00.300',
        status: 'success',
        next_list: [],
        node_flow: [{
          id: 'reco-1',
          type: 'recognition',
          name: 'Reco',
          status: 'success',
          ts: '2026-01-01 00:00:00.050',
          end_ts: '2026-01-01 00:00:00.150',
          reco_id: 1,
        }],
      }],
    }]

    const [statistics] = NodeStatisticsAnalyzer.analyzeRecognitionAction(tasks)
    expect(statistics.recognitionCount).toBe(1)
    expect(statistics.avgRecognitionDuration).toBe(100)
    expect(statistics.avgActionDuration).toBe(150)
  })

  it('summarizes arrays larger than the JavaScript argument limit', () => {
    expect(summarizeDurations(new Array(200_000).fill(5))).toEqual({
      total: 1_000_000,
      average: 5,
      min: 5,
      max: 5,
    })
  })
})
