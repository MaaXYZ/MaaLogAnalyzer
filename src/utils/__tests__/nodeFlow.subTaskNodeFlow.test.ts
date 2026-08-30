import { describe, expect, it } from 'vitest'
import type { NestedActionGroup } from '../../types'
import { buildActionFlowItems } from '@windsland52/maa-log-parser/node-flow'

describe('nodeFlow nested task node_flow mapping', () => {
  it('prefers nested node_flow and keeps child tasks attached under action root', () => {
    const nestedGroups: NestedActionGroup[] = [
      {
        task_id: 2,
        name: 'SubTask',
        ts: '2026-04-06 10:00:00.010',
        end_ts: '2026-04-06 10:00:00.090',
        status: 'success',
        nested_actions: [
          {
            node_id: 201,
            name: 'SubNode',
            ts: '2026-04-06 10:00:00.020',
            end_ts: '2026-04-06 10:00:00.080',
            status: 'success',
            node_flow: [
              {
                id: 'sub.wait_freezes',
                type: 'wait_freezes',
                name: 'SubWF',
                status: 'success',
                ts: '2026-04-06 10:00:00.030',
                end_ts: '2026-04-06 10:00:00.040',
                wait_freezes_details: {
                  wf_id: 11,
                  phase: 'repeat',
                },
              },
              {
                id: 'sub.action',
                type: 'action',
                name: 'SubAction',
                status: 'success',
                ts: '2026-04-06 10:00:00.050',
                end_ts: '2026-04-06 10:00:00.060',
                action_id: 301,
                action_details: {
                  action_id: 301,
                  action: 'Click',
                  box: [0, 0, 0, 0],
                  detail: {},
                  name: 'SubAction',
                  success: true,
                  ts: '2026-04-06 10:00:00.050',
                  end_ts: '2026-04-06 10:00:00.060',
                },
              },
            ],
            child_tasks: [
              {
                task_id: 3,
                name: 'ChildTask',
                ts: '2026-04-06 10:00:00.055',
                end_ts: '2026-04-06 10:00:00.070',
                status: 'success',
                nested_actions: [
                  {
                    node_id: 301,
                    name: 'ChildNode',
                    ts: '2026-04-06 10:00:00.056',
                    end_ts: '2026-04-06 10:00:00.069',
                    status: 'success',
                  },
                ],
              },
            ],
          },
        ],
      },
    ]

    const actionFlow = buildActionFlowItems([], nestedGroups)
    const subTaskRoot = actionFlow.find((item) => item.type === 'task' && item.task_id === 2)
    expect(subTaskRoot).toBeTruthy()

    const subPipelineNode = subTaskRoot?.children?.find(
      (item) => item.type === 'pipeline_node' && item.node_id === 201,
    )
    expect(subPipelineNode).toBeTruthy()

    const mappedWaitFreezes = subPipelineNode?.children?.find(
      (item) => item.type === 'wait_freezes' && item.wait_freezes_details?.wf_id === 11,
    )
    expect(mappedWaitFreezes).toBeTruthy()

    const mappedAction = subPipelineNode?.children?.find(
      (item) => item.type === 'action' && item.action_id === 301,
    )
    expect(mappedAction).toBeTruthy()

    const nestedChildTask = mappedAction?.children?.find(
      (item) => item.type === 'task' && item.task_id === 3,
    )
    expect(nestedChildTask).toBeTruthy()
  })
})
