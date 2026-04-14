import { describe, expect, it } from 'vitest'
import type { UnifiedFlowItem } from '@windsland52/maa-log-parser/types'
import {
  partitionActionScopeWaitFreezes,
  sortFlowItemsByTimestamp,
  splitAndAttachWaitFreezesFlowItems,
} from '../pipeline/flowAssemblyHelpers'

const toTimestampMs = (value?: string): number => {
  if (!value) return Number.POSITIVE_INFINITY
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

const wf = (
  id: number,
  ts: string,
  phase?: string
): UnifiedFlowItem => ({
  id: `wf-${id}`,
  type: 'wait_freezes',
  name: `WF-${id}`,
  status: 'success',
  ts,
  wait_freezes_details: {
    wf_id: id,
    phase,
  },
})

describe('FlowAssemblyHelpers', () => {
  it('sorts flow items by timestamp and keeps stable order for ties', () => {
    const items: UnifiedFlowItem[] = [
      wf(2, '2026-04-08 00:00:01.000'),
      wf(1, '2026-04-08 00:00:00.000'),
      wf(3, '2026-04-08 00:00:01.000'),
    ]

    const sorted = sortFlowItemsByTimestamp(items, toTimestampMs)
    expect(sorted.map((item) => item.id)).toEqual(['wf-1', 'wf-2', 'wf-3'])
  })

  it('attaches context wait_freezes to best recognition parent and keeps unassigned items', () => {
    const childRecognition: UnifiedFlowItem = {
      id: 'reco-child',
      type: 'recognition',
      name: 'ChildReco',
      status: 'success',
      ts: '2026-04-08 00:00:02.000',
      end_ts: '2026-04-08 00:00:04.000',
    }
    const recognitionFlow: UnifiedFlowItem[] = [{
      id: 'reco-root',
      type: 'recognition',
      name: 'RootReco',
      status: 'success',
      ts: '2026-04-08 00:00:01.000',
      end_ts: '2026-04-08 00:00:05.000',
      children: [childRecognition],
    }]

    const actionFlow: UnifiedFlowItem[] = []
    const contextInRange = wf(1, '2026-04-08 00:00:03.000', 'context')
    const contextOutOfRange = wf(2, '2026-04-08 00:00:10.000', 'context')
    const nonContext = wf(3, '2026-04-08 00:00:00.500')

    const result = splitAndAttachWaitFreezesFlowItems({
      recognitionFlow,
      actionFlow,
      waitFreezesFlow: [contextOutOfRange, nonContext, contextInRange],
      toTimestampMs,
    })

    expect(childRecognition.children?.map((item) => item.id)).toEqual(['wf-1'])
    expect(result.actionScopeWaitFreezes.map((item) => item.id)).toEqual(['wf-3'])
    expect(result.unassignedContextWaitFreezes.map((item) => item.id)).toEqual(['wf-2'])
  })

  it('attaches non-context wait_freezes to best nested action-flow parent', () => {
    const pipelineA: UnifiedFlowItem = {
      id: 'pipeline-a',
      type: 'pipeline_node',
      name: 'NodeA',
      status: 'success',
      ts: '2026-04-08 00:00:03.000',
      end_ts: '2026-04-08 00:00:08.000',
    }
    const pipelineB: UnifiedFlowItem = {
      id: 'pipeline-b',
      type: 'pipeline_node',
      name: 'NodeB',
      status: 'success',
      ts: '2026-04-08 00:00:09.000',
      end_ts: '2026-04-08 00:00:15.000',
    }
    const actionFlow: UnifiedFlowItem[] = [
      {
        id: 'action-root',
        type: 'action',
        name: 'RootAction',
        status: 'success',
        ts: '2026-04-08 00:00:01.000',
        end_ts: '2026-04-08 00:00:20.000',
        children: [
          {
            id: 'task-1',
            type: 'task',
            name: 'TaskOne',
            status: 'success',
            ts: '2026-04-08 00:00:02.000',
            end_ts: '2026-04-08 00:00:19.000',
            children: [pipelineA, pipelineB],
          },
        ],
      },
    ]

    const matchByNameAndTime = {
      ...wf(10, '2026-04-08 00:00:10.000'),
      name: 'NodeB',
    }
    const noParent = wf(11, '2026-04-08 00:00:25.000')

    const result = splitAndAttachWaitFreezesFlowItems({
      recognitionFlow: [],
      actionFlow,
      waitFreezesFlow: [matchByNameAndTime, noParent],
      toTimestampMs,
    })

    expect(pipelineB.children?.map((item) => item.id)).toEqual(['wf-10'])
    expect(result.actionScopeWaitFreezes.map((item) => item.id)).toEqual(['wf-11'])
  })

  it('partitions wait_freezes by action window', () => {
    const items = [
      wf(1, '2026-04-08 00:00:01.000'),
      wf(2, '2026-04-08 00:00:03.000'),
      wf(3, '2026-04-08 00:00:06.000'),
    ]

    const partitioned = partitionActionScopeWaitFreezes(
      items,
      toTimestampMs,
      '2026-04-08 00:00:02.000',
      '2026-04-08 00:00:04.000',
      'success'
    )
    expect(partitioned.before.map((item) => item.id)).toEqual(['wf-1'])
    expect(partitioned.inside.map((item) => item.id)).toEqual(['wf-2'])
    expect(partitioned.after.map((item) => item.id)).toEqual(['wf-3'])
  })
})
