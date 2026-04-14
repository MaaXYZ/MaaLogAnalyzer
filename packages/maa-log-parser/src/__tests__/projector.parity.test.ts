import { describe, expect, it } from 'vitest'
import type { TaskInfo, UnifiedFlowItem } from '@windsland52/maa-log-parser/types'
import { LogParser } from '@windsland52/maa-log-parser'

const formatTimestamp = (
  eventIndex: number,
  baseDate = '2026-04-07',
): string => {
  const second = Math.floor(eventIndex / 1000)
  const millisecond = eventIndex % 1000
  const secondPart = String(second).padStart(2, '0')
  const msPart = String(millisecond).padStart(3, '0')
  return `${baseDate} 10:00:${secondPart}.${msPart}`
}

const makeEventLine = (
  eventIndex: number,
  message: string,
  details: Record<string, unknown>,
  baseDate = '2026-04-07',
): string => {
  return `[${formatTimestamp(eventIndex, baseDate)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const makeActionDetails = (params: {
  actionId: number
  name: string
  success: boolean
  action?: string
}) => ({
  action_id: params.actionId,
  action: params.action ?? 'Click',
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

const parseAndCompare = async (
  lines: string[],
): Promise<void> => {
  const parser = new LogParser()
  await parser.parseFile(lines.join('\n'))

  const legacy = parser.getTasksSnapshot().map(normalizeTask)
  const projected = parser.getProjectedTasksSnapshot().map(normalizeTask)

  expect(projected).toEqual(legacy)
}

describe('Task projector parity', () => {
  it('matches legacy flow for main/sub task action nesting', async () => {
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

    await parseAndCompare(lines)
  })

  it('matches legacy synthetic action root fallback for nested task trees', async () => {
    const lines = [
      makeEventLine(101, 'Tasker.Task.Starting', { task_id: 81, entry: 'RootTask', hash: 'h-root', uuid: 'u-root' }),
      makeEventLine(102, 'Node.PipelineNode.Starting', { task_id: 81, node_id: 8101, name: 'RootNode' }),
      makeEventLine(103, 'Node.NextList.Succeeded', {
        task_id: 81,
        name: 'RootNode',
        list: [{ name: 'KeepThenClear', anchor: false, jump_back: false }],
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
      makeEventLine(115, 'Node.PipelineNode.Succeeded', { task_id: 81, node_id: 8101, name: 'RootNode' }),
      makeEventLine(116, 'Tasker.Task.Succeeded', { task_id: 81, entry: 'RootTask', hash: 'h-root', uuid: 'u-root' }),
    ]

    await parseAndCompare(lines)
  })

  it('matches legacy custom action recognition-node reassignment', async () => {
    const lines = [
      makeEventLine(501, 'Tasker.Task.Starting', { task_id: 90, entry: 'MainTask', hash: 'h-main-custom', uuid: 'u-main-custom' }, '2026-04-06'),
      makeEventLine(502, 'Node.PipelineNode.Starting', { task_id: 90, node_id: 9001, name: 'MainNode' }, '2026-04-06'),
      makeEventLine(503, 'Node.Action.Starting', { task_id: 90, action_id: 9001, name: 'CustomReco' }, '2026-04-06'),
      makeEventLine(504, 'Node.ActionNode.Starting', {
        task_id: 90,
        node_id: 9001,
        action_id: 9001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 9001, name: 'CustomReco', success: true, action: 'Custom' }),
      }, '2026-04-06'),
      makeEventLine(505, 'Node.Recognition.Starting', { task_id: 90, reco_id: 90001, name: 'RecoA' }, '2026-04-06'),
      makeEventLine(506, 'Node.Recognition.Succeeded', { task_id: 90, reco_id: 90001, name: 'RecoA' }, '2026-04-06'),
      makeEventLine(507, 'Tasker.Task.Starting', { task_id: 91, entry: 'SubTask', hash: 'h-sub-custom', uuid: 'u-sub-custom' }, '2026-04-06'),
      makeEventLine(508, 'Node.PipelineNode.Starting', { task_id: 91, node_id: 9101, name: 'SubNode' }, '2026-04-06'),
      makeEventLine(509, 'Node.PipelineNode.Succeeded', { task_id: 91, node_id: 9101, name: 'SubNode' }, '2026-04-06'),
      makeEventLine(510, 'Tasker.Task.Succeeded', { task_id: 91, entry: 'SubTask', hash: 'h-sub-custom', uuid: 'u-sub-custom' }, '2026-04-06'),
      makeEventLine(511, 'Node.Action.Succeeded', { task_id: 90, action_id: 9001, name: 'CustomReco' }, '2026-04-06'),
      makeEventLine(512, 'Node.ActionNode.Succeeded', {
        task_id: 90,
        node_id: 9001,
        action_id: 9001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 9001, name: 'CustomReco', success: true, action: 'Custom' }),
      }, '2026-04-06'),
      makeEventLine(513, 'Node.PipelineNode.Succeeded', {
        task_id: 90,
        node_id: 9001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 9001, name: 'CustomReco', success: true, action: 'Custom' }),
      }, '2026-04-06'),
      makeEventLine(514, 'Tasker.Task.Succeeded', { task_id: 90, entry: 'MainTask', hash: 'h-main-custom', uuid: 'u-main-custom' }, '2026-04-06'),
    ]

    await parseAndCompare(lines)
  })
})
