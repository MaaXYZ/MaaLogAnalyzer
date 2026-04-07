import { describe, expect, it } from 'vitest'
import type { TaskInfo, UnifiedFlowItem } from '../../types'
import { LogParser } from '../logParser'

const formatTimestamp = (eventIndex: number): string => {
  const second = Math.floor(eventIndex / 1000)
  const millisecond = eventIndex % 1000
  const secondPart = String(second).padStart(2, '0')
  const msPart = String(millisecond).padStart(3, '0')
  return `2026-04-07 10:00:${secondPart}.${msPart}`
}

const makeEventLine = (
  eventIndex: number,
  message: string,
  details: Record<string, unknown>
): string => {
  return `[${formatTimestamp(eventIndex)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const makeActionDetails = (params: {
  actionId: number
  name: string
  success: boolean
}) => ({
  action_id: params.actionId,
  action: 'Click',
  box: [0, 0, 0, 0],
  detail: {},
  name: params.name,
  success: params.success,
})

const normalizeFlowItem = (item: UnifiedFlowItem): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {
    type: item.type,
    name: item.name,
    status: item.status,
  }

  if (item.task_id != null) normalized.task_id = item.task_id
  if (item.node_id != null) normalized.node_id = item.node_id
  if (item.reco_id != null) normalized.reco_id = item.reco_id
  if (item.action_id != null) normalized.action_id = item.action_id
  if (item.anchor_name) normalized.anchor_name = item.anchor_name

  if (item.task_details) {
    const taskDetails: Record<string, unknown> = {
      task_id: item.task_details.task_id,
      status: item.task_details.status,
    }
    if (item.task_details.entry) taskDetails.entry = item.task_details.entry
    normalized.task_details = taskDetails
  }

  if (item.wait_freezes_details) {
    const waitFreezes: Record<string, unknown> = {
      wf_id: item.wait_freezes_details.wf_id,
    }
    if (item.wait_freezes_details.phase) waitFreezes.phase = item.wait_freezes_details.phase
    if (item.wait_freezes_details.elapsed != null) waitFreezes.elapsed = item.wait_freezes_details.elapsed
    if (item.wait_freezes_details.reco_ids && item.wait_freezes_details.reco_ids.length > 0) {
      waitFreezes.reco_ids = item.wait_freezes_details.reco_ids
    }
    normalized.wait_freezes = waitFreezes
  }

  if (item.action_details) {
    normalized.action_details = {
      action_id: item.action_details.action_id,
      name: item.action_details.name,
      success: item.action_details.success,
    }
  }

  if (item.children && item.children.length > 0) {
    normalized.children = item.children.map(normalizeFlowItem)
  }

  return normalized
}

const normalizeTask = (task: TaskInfo): Record<string, unknown> => {
  return {
    task_id: task.task_id,
    entry: task.entry,
    status: task.status,
    nodes: task.nodes.map((node) => ({
      node_id: node.node_id,
      name: node.name,
      status: node.status,
      next_list: node.next_list.map((item) => ({
        name: item.name,
        anchor: item.anchor,
        jump_back: item.jump_back,
      })),
      flow: (node.node_flow ?? []).map(normalizeFlowItem),
    })),
  }
}

const parseAndNormalizeTasks = async (lines: string[]): Promise<Record<string, unknown>[]> => {
  const parser = new LogParser()
  await parser.parseFile(lines.join('\n'))
  return parser.getTasksSnapshot().map(normalizeTask)
}

describe('LogParser golden snapshots', () => {
  it('captures main/sub task flow composition with recognition/action/wait_freezes', async () => {
    const lines = [
      makeEventLine(1, 'Tasker.Task.Starting', { task_id: 71, entry: 'MainTask', hash: 'h-main-71', uuid: 'u-main-71' }),
      makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 71, node_id: 7101, name: 'MainNode' }),
      makeEventLine(3, 'Node.Recognition.Starting', { task_id: 71, reco_id: 71001, name: 'MainReco' }),
      makeEventLine(4, 'Node.Recognition.Failed', { task_id: 71, reco_id: 71001, name: 'MainReco' }),
      makeEventLine(5, 'Node.NextList.Succeeded', {
        task_id: 71,
        name: 'MainNode',
        list: [{ name: 'MainCandidate', anchor: false, jump_back: false }],
      }),

      makeEventLine(6, 'Tasker.Task.Starting', { task_id: 72, entry: 'SubTask', hash: 'h-sub-72', uuid: 'u-sub-72' }),
      makeEventLine(7, 'Node.PipelineNode.Starting', { task_id: 72, node_id: 7201, name: 'SubNode' }),
      makeEventLine(8, 'Node.NextList.Succeeded', {
        task_id: 72,
        name: 'SubNode',
        list: [{ name: 'SubCandidate', anchor: true, jump_back: false }],
      }),
      makeEventLine(9, 'Node.WaitFreezes.Starting', { task_id: 72, wf_id: 72, phase: 'pre', name: 'SubNode' }),
      makeEventLine(10, 'Node.WaitFreezes.Succeeded', { task_id: 72, wf_id: 72, phase: 'post', elapsed: 10, name: 'SubNode' }),
      makeEventLine(11, 'Node.Action.Starting', { task_id: 72, action_id: 72001, name: 'SubAction' }),
      makeEventLine(12, 'Node.Action.Succeeded', { task_id: 72, action_id: 72001, name: 'SubAction' }),
      makeEventLine(13, 'Node.ActionNode.Starting', {
        task_id: 72,
        node_id: 7201,
        action_id: 72001,
        name: 'SubNode',
        action_details: makeActionDetails({ actionId: 72001, name: 'SubAction', success: true }),
      }),
      makeEventLine(14, 'Node.ActionNode.Succeeded', {
        task_id: 72,
        node_id: 7201,
        action_id: 72001,
        name: 'SubNode',
        action_details: makeActionDetails({ actionId: 72001, name: 'SubAction', success: true }),
      }),
      makeEventLine(15, 'Node.PipelineNode.Succeeded', {
        task_id: 72,
        node_id: 7201,
        name: 'SubNode',
        action_details: makeActionDetails({ actionId: 72001, name: 'SubAction', success: true }),
      }),
      makeEventLine(16, 'Tasker.Task.Succeeded', { task_id: 72, entry: 'SubTask', hash: 'h-sub-72', uuid: 'u-sub-72' }),

      makeEventLine(17, 'Node.Action.Starting', { task_id: 71, action_id: 71001, name: 'MainAction' }),
      makeEventLine(18, 'Node.Action.Failed', { task_id: 71, action_id: 71001, name: 'MainAction' }),
      makeEventLine(19, 'Node.ActionNode.Starting', {
        task_id: 71,
        node_id: 7101,
        action_id: 71001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 71001, name: 'MainAction', success: false }),
      }),
      makeEventLine(20, 'Node.ActionNode.Failed', {
        task_id: 71,
        node_id: 7101,
        action_id: 71001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 71001, name: 'MainAction', success: false }),
      }),
      makeEventLine(21, 'Node.PipelineNode.Failed', {
        task_id: 71,
        node_id: 7101,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 71001, name: 'MainAction', success: false }),
      }),
      makeEventLine(22, 'Tasker.Task.Failed', { task_id: 71, entry: 'MainTask', hash: 'h-main-71', uuid: 'u-main-71' }),
    ]

    const normalizedTasks = await parseAndNormalizeTasks(lines)
    expect(normalizedTasks).toMatchInlineSnapshot(`
      [
        {
          "entry": "MainTask",
          "nodes": [
            {
              "flow": [
                {
                  "name": "MainReco",
                  "reco_id": 71001,
                  "status": "failed",
                  "type": "recognition",
                },
                {
                  "action_details": {
                    "action_id": 71001,
                    "name": "MainAction",
                    "success": false,
                  },
                  "action_id": 71001,
                  "children": [
                    {
                      "children": [
                        {
                          "action_details": {
                            "action_id": 72001,
                            "name": "SubAction",
                            "success": true,
                          },
                          "children": [
                            {
                              "name": "SubNode",
                              "status": "success",
                              "type": "wait_freezes",
                              "wait_freezes": {
                                "elapsed": 10,
                                "phase": "post",
                                "wf_id": 72,
                              },
                            },
                            {
                              "action_details": {
                                "action_id": 72001,
                                "name": "SubAction",
                                "success": true,
                              },
                              "action_id": 72001,
                              "name": "SubAction",
                              "status": "success",
                              "type": "action",
                            },
                          ],
                          "name": "SubAction",
                          "node_id": 7201,
                          "status": "success",
                          "task_id": 72,
                          "type": "pipeline_node",
                        },
                      ],
                      "name": "SubTask",
                      "status": "success",
                      "task_details": {
                        "entry": "SubTask",
                        "status": "succeeded",
                        "task_id": 72,
                      },
                      "task_id": 72,
                      "type": "task",
                    },
                  ],
                  "name": "MainAction",
                  "status": "failed",
                  "type": "action",
                },
              ],
              "name": "MainNode",
              "next_list": [
                {
                  "anchor": false,
                  "jump_back": false,
                  "name": "MainCandidate",
                },
              ],
              "node_id": 7101,
              "status": "failed",
            },
          ],
          "status": "failed",
          "task_id": 71,
        },
        {
          "entry": "SubTask",
          "nodes": [
            {
              "flow": [
                {
                  "name": "SubNode",
                  "status": "success",
                  "type": "wait_freezes",
                  "wait_freezes": {
                    "elapsed": 10,
                    "phase": "post",
                    "wf_id": 72,
                  },
                },
                {
                  "action_details": {
                    "action_id": 72001,
                    "name": "SubAction",
                    "success": true,
                  },
                  "action_id": 72001,
                  "name": "SubAction",
                  "status": "success",
                  "type": "action",
                },
              ],
              "name": "SubNode",
              "next_list": [
                {
                  "anchor": true,
                  "jump_back": false,
                  "name": "SubCandidate",
                },
              ],
              "node_id": 7201,
              "status": "success",
            },
          ],
          "status": "succeeded",
          "task_id": 72,
        },
      ]
    `)
  })

  it('captures nested task tree and unknown phase guard behavior', async () => {
    const lines = [
      makeEventLine(101, 'Tasker.Task.Starting', { task_id: 81, entry: 'RootTask', hash: 'h-root', uuid: 'u-root' }),
      makeEventLine(102, 'Node.PipelineNode.Starting', { task_id: 81, node_id: 8101, name: 'RootNode' }),
      makeEventLine(103, 'Node.NextList.Succeeded', {
        task_id: 81,
        name: 'RootNode',
        list: [{ name: 'KeepThenClear', anchor: false, jump_back: false }],
      }),
      makeEventLine(104, 'Node.NextList.Custom', {
        task_id: 81,
        name: 'RootNode',
        list: [{ name: 'ShouldIgnore', anchor: false, jump_back: false }],
      }),
      makeEventLine(105, 'Tasker.Task.Starting', { task_id: 82, entry: 'Level1', hash: 'h-l1', uuid: 'u-l1' }),
      makeEventLine(106, 'Node.PipelineNode.Starting', { task_id: 82, node_id: 8201, name: 'Level1Node' }),
      makeEventLine(107, 'Tasker.Task.Starting', { task_id: 83, entry: 'Level2', hash: 'h-l2', uuid: 'u-l2' }),
      makeEventLine(108, 'Node.PipelineNode.Starting', { task_id: 83, node_id: 8301, name: 'Level2Node' }),
      makeEventLine(109, 'Node.PipelineNode.Succeeded', { task_id: 83, node_id: 8301, name: 'Level2Node' }),
      makeEventLine(110, 'Tasker.Task.Succeeded', { task_id: 83, entry: 'Level2', hash: 'h-l2', uuid: 'u-l2' }),
      makeEventLine(111, 'Node.PipelineNode.Succeeded', { task_id: 82, node_id: 8201, name: 'Level1Node' }),
      makeEventLine(112, 'Tasker.Task.Succeeded', { task_id: 82, entry: 'Level1', hash: 'h-l1', uuid: 'u-l1' }),
      makeEventLine(113, 'Node.NextList.Failed', {
        task_id: 81,
        name: 'RootNode',
        list: [{ name: 'KeepThenClear', anchor: false, jump_back: false }],
      }),
      makeEventLine(114, 'Tasker.Task.Custom', { task_id: 81, entry: 'RootTask', hash: 'h-root', uuid: 'u-root' }),
      makeEventLine(115, 'Node.PipelineNode.Succeeded', { task_id: 81, node_id: 8101, name: 'RootNode' }),
      makeEventLine(116, 'Tasker.Task.Succeeded', { task_id: 81, entry: 'RootTask', hash: 'h-root', uuid: 'u-root' }),
    ]

    const normalizedTasks = await parseAndNormalizeTasks(lines)
    expect(normalizedTasks).toMatchInlineSnapshot(`
      [
        {
          "entry": "RootTask",
          "nodes": [
            {
              "flow": [
                {
                  "action_id": 8101,
                  "children": [
                    {
                      "children": [
                        {
                          "children": [
                            {
                              "children": [
                                {
                                  "name": "Level2Node",
                                  "node_id": 8301,
                                  "status": "success",
                                  "task_id": 83,
                                  "type": "pipeline_node",
                                },
                              ],
                              "name": "Level2",
                              "status": "success",
                              "task_details": {
                                "entry": "Level2",
                                "status": "succeeded",
                                "task_id": 83,
                              },
                              "task_id": 83,
                              "type": "task",
                            },
                          ],
                          "name": "Level1Node",
                          "node_id": 8201,
                          "status": "success",
                          "task_id": 82,
                          "type": "pipeline_node",
                        },
                      ],
                      "name": "Level1",
                      "status": "success",
                      "task_details": {
                        "entry": "Level1",
                        "status": "succeeded",
                        "task_id": 82,
                      },
                      "task_id": 82,
                      "type": "task",
                    },
                  ],
                  "name": "RootNode",
                  "status": "success",
                  "type": "action",
                },
              ],
              "name": "RootNode",
              "next_list": [],
              "node_id": 8101,
              "status": "success",
            },
          ],
          "status": "succeeded",
          "task_id": 81,
        },
        {
          "entry": "Level1",
          "nodes": [
            {
              "flow": [
                {
                  "action_id": 8201,
                  "children": [
                    {
                      "children": [
                        {
                          "name": "Level2Node",
                          "node_id": 8301,
                          "status": "success",
                          "task_id": 83,
                          "type": "pipeline_node",
                        },
                      ],
                      "name": "Level2",
                      "status": "success",
                      "task_details": {
                        "entry": "Level2",
                        "status": "succeeded",
                        "task_id": 83,
                      },
                      "task_id": 83,
                      "type": "task",
                    },
                  ],
                  "name": "Level1Node",
                  "status": "success",
                  "type": "action",
                },
              ],
              "name": "Level1Node",
              "next_list": [],
              "node_id": 8201,
              "status": "success",
            },
          ],
          "status": "succeeded",
          "task_id": 82,
        },
        {
          "entry": "Level2",
          "nodes": [
            {
              "flow": [],
              "name": "Level2Node",
              "next_list": [],
              "node_id": 8301,
              "status": "success",
            },
          ],
          "status": "succeeded",
          "task_id": 83,
        },
      ]
    `)
  })
})
