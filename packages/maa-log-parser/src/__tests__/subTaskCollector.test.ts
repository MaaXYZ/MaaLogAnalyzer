import { describe, expect, it } from 'vitest'
import type { RecognitionAttempt } from '@windsland52/maa-log-parser/types'
import { StringPool } from '../shared/stringPool'
import { SubTaskCollector, summarizeRuntimeStatus } from '../subtask/collector'

describe('SubTaskCollector', () => {
  it('summarizes runtime status by failed > running > success priority', () => {
    expect(summarizeRuntimeStatus([{ status: 'success' }, { status: 'success' }])).toBe('success')
    expect(summarizeRuntimeStatus([{ status: 'running' }, { status: 'success' }])).toBe('running')
    expect(summarizeRuntimeStatus([{ status: 'failed' }, { status: 'running' }])).toBe('failed')
  })

  it('collects and consumes actions/recognitions by task scope', () => {
    const collector = new SubTaskCollector()
    const recognition: RecognitionAttempt = {
      name: 'Reco',
      reco_id: 1001,
      ts: '2026-04-08 00:00:00.001',
      status: 'success',
    }

    collector.addRecognition(10, recognition)
    collector.addRecognitionNode(10, recognition)
    collector.addAction(10, {
      action_id: 2001,
      name: 'ActionA',
      ts: '2026-04-08 00:00:00.002',
      status: 'running',
    })

    expect(collector.peekActions(10)).toHaveLength(1)
    expect(collector.consumeRecognitions(10)).toHaveLength(1)
    expect(collector.consumeRecognitionNodes(10)).toHaveLength(1)
    expect(collector.consumeActions(10)).toHaveLength(1)
    expect(collector.peekActions(10)).toHaveLength(0)
  })

  it('converts collected pipeline nodes to nested action groups and clears pipeline cache', () => {
    const collector = new SubTaskCollector()
    const stringPool = new StringPool()

    collector.addPipelineNode(11, {
      node_id: 3001,
      name: 'SubNode',
      ts: '2026-04-08 00:00:00.100',
      status: 'running',
    })
    collector.addPipelineNode(11, {
      node_id: 3002,
      name: 'SubNode',
      ts: '2026-04-08 00:00:00.200',
      status: 'failed',
    })

    const groups = collector.consumeAsNestedActionGroups(stringPool)
    expect(groups).toHaveLength(1)
    expect(groups[0].task_id).toBe(11)
    expect(groups[0].status).toBe('failed')
    expect(groups[0].nested_actions).toHaveLength(2)

    const groupsAfterConsume = collector.consumeAsNestedActionGroups(stringPool)
    expect(groupsAfterConsume).toHaveLength(0)
  })
})
