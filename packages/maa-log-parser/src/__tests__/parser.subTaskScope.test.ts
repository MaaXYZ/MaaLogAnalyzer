import { describe, expect, it } from 'vitest'
import type { UnifiedFlowItem } from '../shared/types'
import { LogParser } from '../core/logParser'

const formatTimestamp = (eventIndex: number): string => {
  const second = Math.floor(eventIndex / 1000)
  const millisecond = eventIndex % 1000
  const secondPart = String(second).padStart(2, '0')
  const msPart = String(millisecond).padStart(3, '0')
  return `2026-04-06 10:00:${secondPart}.${msPart}`
}

const makeEventLine = (
  eventIndex: number,
  message: string,
  details: Record<string, unknown>,
  source?: {
    processId?: string
    threadId?: string
  },
): string => {
  const processId = source?.processId ?? 'Px1'
  const threadId = source?.threadId ?? 'Tx1'
  return `[${formatTimestamp(eventIndex)}][INF][${processId}][${threadId}][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const collectFlowItems = (
  items: UnifiedFlowItem[] | undefined,
  matcher: (item: UnifiedFlowItem, path: UnifiedFlowItem[]) => boolean,
): Array<{ item: UnifiedFlowItem; path: UnifiedFlowItem[] }> => {
  if (!items || items.length === 0) return []

  const result: Array<{ item: UnifiedFlowItem; path: UnifiedFlowItem[] }> = []
  const visit = (nodes: UnifiedFlowItem[], path: UnifiedFlowItem[]) => {
    for (const node of nodes) {
      const nextPath = [...path, node]
      if (matcher(node, nextPath)) {
        result.push({ item: node, path: nextPath })
      }
      if (node.children && node.children.length > 0) {
        visit(node.children, nextPath)
      }
    }
  }

  visit(items, [])
  return result
}

describe('LogParser sub task scoped node aggregation', () => {
  it('keeps main and sub task NextList/WaitFreezes isolated by task_id scope', async () => {
    const lines = [
      makeEventLine(1, 'Tasker.Task.Starting', {
        task_id: 1,
        entry: 'MainTask',
        hash: 'h-main',
        uuid: 'u-main',
      }),
      makeEventLine(2, 'Node.PipelineNode.Starting', {
        task_id: 1,
        node_id: 101,
        name: 'MainNode',
      }),
      makeEventLine(3, 'Node.NextList.Starting', {
        task_id: 1,
        name: 'MainNode',
        list: [{ name: 'MainNext', anchor: false, jump_back: false }],
      }),
      makeEventLine(4, 'Tasker.Task.Starting', {
        task_id: 2,
        entry: 'SubTask',
        hash: 'h-sub',
        uuid: 'u-sub',
      }),
      makeEventLine(5, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: 'SubNode' }),
      makeEventLine(6, 'Node.NextList.Starting', {
        task_id: 2,
        name: 'SubNode',
        list: [{ name: 'SubNext', anchor: true, jump_back: false }],
      }),
      makeEventLine(7, 'Node.WaitFreezes.Starting', {
        task_id: 2,
        wf_id: 1,
        phase: 'pre',
        name: 'SubNode',
      }),
      makeEventLine(8, 'Node.WaitFreezes.Succeeded', {
        task_id: 2,
        wf_id: 1,
        phase: 'post',
        name: 'SubNode',
        elapsed: 33,
      }),
      makeEventLine(9, 'Node.PipelineNode.Succeeded', {
        task_id: 2,
        node_id: 201,
        name: 'SubNode',
      }),
      makeEventLine(10, 'Tasker.Task.Succeeded', {
        task_id: 2,
        entry: 'SubTask',
        hash: 'h-sub',
        uuid: 'u-sub',
      }),
      makeEventLine(11, 'Node.WaitFreezes.Starting', {
        task_id: 1,
        wf_id: 1,
        phase: 'repeat',
        name: 'MainNode',
      }),
      makeEventLine(12, 'Node.WaitFreezes.Failed', {
        task_id: 1,
        wf_id: 1,
        phase: 'repeat',
        name: 'MainNode',
        elapsed: 66,
      }),
      makeEventLine(13, 'Node.PipelineNode.Succeeded', {
        task_id: 1,
        node_id: 101,
        name: 'MainNode',
      }),
      makeEventLine(14, 'Tasker.Task.Succeeded', {
        task_id: 1,
        entry: 'MainTask',
        hash: 'h-main',
        uuid: 'u-main',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 1)

    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)

    const mainNode = mainTask!.nodes[0]
    expect(mainNode.next_list).toEqual([{ name: 'MainNext', anchor: false, jump_back: false }])

    const allWaitFreezes = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'wait_freezes',
    )
    expect(allWaitFreezes.length).toBeGreaterThanOrEqual(2)

    const mainWaitFreezes = allWaitFreezes.find(
      ({ item }) =>
        item.wait_freezes_details?.wf_id === 1 &&
        item.wait_freezes_details?.phase === 'repeat' &&
        item.status === 'failed',
    )
    expect(mainWaitFreezes).toBeTruthy()
    expect(mainWaitFreezes?.item.task_id).toBe(1)
    expect(mainWaitFreezes?.item.node_id).toBe(101)

    const subWaitFreezes = allWaitFreezes.find(
      ({ item }) =>
        item.wait_freezes_details?.wf_id === 1 &&
        item.wait_freezes_details?.phase === 'post' &&
        item.status === 'success',
    )
    expect(subWaitFreezes).toBeTruthy()
    expect(subWaitFreezes?.item.task_id).toBe(2)
    expect(subWaitFreezes?.item.node_id).toBe(201)
    expect(subWaitFreezes?.item.id).not.toBe(mainWaitFreezes?.item.id)
    expect(
      subWaitFreezes?.path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 2),
    ).toBe(true)
  })

  it('keeps sub task ActionNode timeline after helper extraction', async () => {
    const lines = [
      makeEventLine(101, 'Tasker.Task.Starting', {
        task_id: 11,
        entry: 'MainTask',
        hash: 'h-main-2',
        uuid: 'u-main-2',
      }),
      makeEventLine(102, 'Node.PipelineNode.Starting', {
        task_id: 11,
        node_id: 1101,
        name: 'MainNode',
      }),

      makeEventLine(103, 'Tasker.Task.Starting', {
        task_id: 12,
        entry: 'SubTask',
        hash: 'h-sub-2',
        uuid: 'u-sub-2',
      }),
      makeEventLine(104, 'Node.PipelineNode.Starting', {
        task_id: 12,
        node_id: 1201,
        name: 'SubNode',
      }),
      makeEventLine(105, 'Node.Action.Starting', {
        task_id: 12,
        action_id: 5001,
        name: 'SubAction',
      }),
      makeEventLine(106, 'Node.Action.Succeeded', {
        task_id: 12,
        action_id: 5001,
        name: 'SubAction',
      }),
      makeEventLine(107, 'Node.ActionNode.Starting', {
        task_id: 12,
        action_id: 5001,
        node_id: 1201,
        name: 'SubNode',
        action_details: {
          action_id: 5001,
          action: 'Click',
          box: [0, 0, 0, 0],
          detail: {},
          name: 'SubAction',
          success: false,
        },
      }),
      makeEventLine(108, 'Node.ActionNode.Failed', {
        task_id: 12,
        action_id: 5001,
        node_id: 1201,
        name: 'SubNode',
        action_details: {
          action_id: 5001,
          action: 'Click',
          box: [0, 0, 0, 0],
          detail: {},
          name: 'SubAction',
          success: false,
        },
      }),
      makeEventLine(109, 'Node.PipelineNode.Failed', {
        task_id: 12,
        node_id: 1201,
        name: 'SubNode',
        action_details: {
          action_id: 5001,
          action: 'Click',
          box: [0, 0, 0, 0],
          detail: {},
          name: 'SubAction',
          success: false,
        },
      }),
      makeEventLine(110, 'Tasker.Task.Failed', {
        task_id: 12,
        entry: 'SubTask',
        hash: 'h-sub-2',
        uuid: 'u-sub-2',
      }),

      makeEventLine(111, 'Node.PipelineNode.Succeeded', {
        task_id: 11,
        node_id: 1101,
        name: 'MainNode',
      }),
      makeEventLine(112, 'Tasker.Task.Succeeded', {
        task_id: 11,
        entry: 'MainTask',
        hash: 'h-main-2',
        uuid: 'u-main-2',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 11)
    expect(mainTask).toBeTruthy()

    const mainNode = mainTask!.nodes[0]
    const subTaskActionItems = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'action' &&
        item.action_id === 5001 &&
        path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 12),
    )
    const subTaskActionNodeItems = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'action_node' &&
        item.action_id === 5001 &&
        path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 12),
    )

    expect(subTaskActionItems.length).toBeGreaterThan(0)
    expect(subTaskActionItems[0].item.status).toBe('success')
    expect(subTaskActionNodeItems.length).toBeGreaterThan(0)
    expect(subTaskActionNodeItems[0].item.status).toBe('failed')
  })

  it('keeps realtime sub task flow under the explicit running action node', () => {
    const lines = [
      makeEventLine(121, 'Tasker.Task.Starting', {
        task_id: 1,
        entry: 'MainTask',
        hash: 'h-main-rt',
        uuid: 'u-main-rt',
      }),
      makeEventLine(122, 'Node.PipelineNode.Starting', {
        task_id: 1,
        node_id: 101,
        name: 'MainNode',
      }),
      makeEventLine(123, 'Node.Action.Starting', {
        task_id: 1,
        action_id: 1001,
        name: 'MainAction',
      }),
      makeEventLine(124, 'Node.ActionNode.Starting', {
        task_id: 1,
        node_id: 101,
        action_id: 1001,
        name: 'MainNode',
        action_details: {
          action_id: 1001,
          action: 'Click',
          box: [0, 0, 0, 0],
          detail: {},
          name: 'MainAction',
          success: true,
        },
      }),
      makeEventLine(125, 'Tasker.Task.Starting', {
        task_id: 2,
        entry: 'SubTask',
        hash: 'h-sub-rt',
        uuid: 'u-sub-rt',
      }),
      makeEventLine(126, 'Node.PipelineNode.Starting', {
        task_id: 2,
        node_id: 201,
        name: 'SubNode',
      }),
      makeEventLine(127, 'Node.PipelineNode.Succeeded', {
        task_id: 2,
        node_id: 201,
        name: 'SubNode',
      }),
      makeEventLine(128, 'Tasker.Task.Succeeded', {
        task_id: 2,
        entry: 'SubTask',
        hash: 'h-sub-rt',
        uuid: 'u-sub-rt',
      }),
    ]

    const parser = new LogParser()
    for (const eventLine of lines) {
      parser.appendRealtimeLines([eventLine])
    }

    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 1)

    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)

    const mainNode = mainTask!.nodes[0]
    const runningMainActionNode = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'action_node' && item.action_id === 1001 && item.status === 'running',
    )
    expect(runningMainActionNode.length).toBeGreaterThan(0)

    const nestedSubTask = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'task' &&
        item.task_id === 2 &&
        path.some((pathNode) => pathNode.type === 'action_node' && pathNode.action_id === 1001),
    )
    expect(nestedSubTask.length).toBeGreaterThan(0)

    const nestedSubPipeline = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'pipeline_node' &&
        item.task_id === 2 &&
        path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 2),
    )
    expect(nestedSubPipeline.length).toBeGreaterThan(0)
    expect(nestedSubPipeline[0].item.status).toBe('success')
  })

  it('nests outer-task wait_freezes into the active foreign pipeline flow', async () => {
    const lines = [
      makeEventLine(201, 'Tasker.Task.Starting', {
        task_id: 1,
        entry: 'MainTask',
        hash: 'h-main-3',
        uuid: 'u-main-3',
      }),
      makeEventLine(202, 'Node.PipelineNode.Starting', {
        task_id: 1,
        node_id: 101,
        name: 'MainNode',
      }),
      makeEventLine(203, 'Node.Action.Starting', {
        task_id: 1,
        action_id: 1001,
        name: 'SOSSelectNode',
      }),

      makeEventLine(204, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: 'Click' }),
      makeEventLine(205, 'Node.NextList.Starting', {
        task_id: 2,
        name: 'Click',
        list: [{ name: 'Click', anchor: false, jump_back: false }],
      }),
      makeEventLine(206, 'Node.Recognition.Starting', { task_id: 2, reco_id: 3001, name: 'Click' }),
      makeEventLine(207, 'Node.Recognition.Succeeded', {
        task_id: 2,
        reco_id: 3001,
        name: 'Click',
        reco_details: {
          reco_id: 3001,
          algorithm: 'DirectHit',
          box: [0, 0, 1280, 720],
          detail: null,
          name: 'Click',
        },
      }),
      makeEventLine(208, 'Node.NextList.Succeeded', {
        task_id: 2,
        name: 'Click',
        list: [{ name: 'Click', anchor: false, jump_back: false }],
      }),
      makeEventLine(209, 'Node.Action.Starting', { task_id: 2, action_id: 3002, name: 'Click' }),
      makeEventLine(210, 'Node.Action.Succeeded', {
        task_id: 2,
        action_id: 3002,
        name: 'Click',
        action_details: {
          action_id: 3002,
          action: 'Click',
          box: [0, 0, 1280, 720],
          detail: {},
          name: 'Click',
          success: true,
        },
      }),
      makeEventLine(211, 'Node.WaitFreezes.Starting', {
        task_id: 1,
        wf_id: 4001,
        phase: 'post',
        name: 'Click',
      }),
      makeEventLine(212, 'Node.WaitFreezes.Succeeded', {
        task_id: 1,
        wf_id: 4001,
        phase: 'post',
        name: 'Click',
        elapsed: 33,
      }),
      makeEventLine(213, 'Node.PipelineNode.Succeeded', {
        task_id: 2,
        node_id: 201,
        name: 'Click',
      }),

      makeEventLine(214, 'Node.Action.Succeeded', {
        task_id: 1,
        action_id: 1001,
        name: 'SOSSelectNode',
      }),
      makeEventLine(215, 'Node.PipelineNode.Succeeded', {
        task_id: 1,
        node_id: 101,
        name: 'MainNode',
      }),
      makeEventLine(216, 'Tasker.Task.Succeeded', {
        task_id: 1,
        entry: 'MainTask',
        hash: 'h-main-3',
        uuid: 'u-main-3',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 1)

    expect(mainTask).toBeTruthy()
    const mainNode = mainTask!.nodes[0]

    const actionRoot = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'action' && item.action_id === 1001,
    )[0]?.item
    expect(actionRoot).toBeTruthy()

    const nestedTask = collectFlowItems(
      actionRoot?.children,
      (item) => item.type === 'task' && item.task_id === 2,
    )[0]?.item
    expect(nestedTask).toBeTruthy()
    expect(nestedTask?.children?.map((item) => item.type)).toEqual(['pipeline_node'])

    const nestedPipeline = nestedTask?.children?.[0]
    expect(nestedPipeline?.type).toBe('pipeline_node')
    expect(nestedPipeline?.children?.map((item) => item.type)).toEqual([
      'recognition',
      'action',
      'wait_freezes',
    ])

    const nestedWaitFreezes = nestedPipeline?.children?.[2]
    expect(nestedWaitFreezes?.type).toBe('wait_freezes')
    expect(nestedWaitFreezes?.task_id).toBe(1)
    expect(nestedWaitFreezes?.node_id).toBe(201)
    expect(nestedWaitFreezes?.wait_freezes_details?.wf_id).toBe(4001)
  })

  it('tolerates malformed NextList payloads', async () => {
    const lines = [
      makeEventLine(151, 'Tasker.Task.Starting', {
        task_id: 31,
        entry: 'MainTask',
        hash: 'h-main-4',
        uuid: 'u-main-4',
      }),
      makeEventLine(152, 'Node.PipelineNode.Starting', {
        task_id: 31,
        node_id: 3101,
        name: 'MainNode',
      }),
      makeEventLine(153, 'Node.NextList.Succeeded', {
        task_id: 31,
        name: 'MainNode',
        list: { invalid: true },
      }),
      makeEventLine(154, 'Node.PipelineNode.Succeeded', {
        task_id: 31,
        node_id: 3101,
        name: 'MainNode',
      }),
      makeEventLine(155, 'Tasker.Task.Succeeded', {
        task_id: 31,
        entry: 'MainTask',
        hash: 'h-main-4',
        uuid: 'u-main-4',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 31)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([])
  })

  it('keeps next_list when Node.NextList.Failed carries list payload', async () => {
    const lines = [
      makeEventLine(161, 'Tasker.Task.Starting', {
        task_id: 41,
        entry: 'MainTask',
        hash: 'h-main-5',
        uuid: 'u-main-5',
      }),
      makeEventLine(162, 'Node.PipelineNode.Starting', {
        task_id: 41,
        node_id: 4101,
        name: 'MainNode',
      }),
      makeEventLine(163, 'Node.NextList.Succeeded', {
        task_id: 41,
        name: 'MainNode',
        list: [{ name: 'CandidateA', anchor: true, jump_back: false }],
      }),
      makeEventLine(164, 'Node.NextList.Failed', {
        task_id: 41,
        name: 'MainNode',
        list: [{ name: 'CandidateA', anchor: true, jump_back: false }],
      }),
      makeEventLine(165, 'Node.PipelineNode.Succeeded', {
        task_id: 41,
        node_id: 4101,
        name: 'MainNode',
      }),
      makeEventLine(166, 'Tasker.Task.Succeeded', {
        task_id: 41,
        entry: 'MainTask',
        hash: 'h-main-5',
        uuid: 'u-main-5',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 41)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([
      { name: 'CandidateA', anchor: true, jump_back: false },
    ])
  })

  it('clears next_list when Node.NextList.Failed has no list payload', async () => {
    const lines = [
      makeEventLine(167, 'Tasker.Task.Starting', {
        task_id: 42,
        entry: 'MainTask',
        hash: 'h-main-5b',
        uuid: 'u-main-5b',
      }),
      makeEventLine(168, 'Node.PipelineNode.Starting', {
        task_id: 42,
        node_id: 4201,
        name: 'MainNode',
      }),
      makeEventLine(169, 'Node.NextList.Succeeded', {
        task_id: 42,
        name: 'MainNode',
        list: [{ name: 'CandidateA', anchor: true, jump_back: false }],
      }),
      makeEventLine(170, 'Node.NextList.Failed', {
        task_id: 42,
        name: 'MainNode',
      }),
      makeEventLine(171, 'Node.PipelineNode.Succeeded', {
        task_id: 42,
        node_id: 4201,
        name: 'MainNode',
      }),
      makeEventLine(172, 'Tasker.Task.Succeeded', {
        task_id: 42,
        entry: 'MainTask',
        hash: 'h-main-5b',
        uuid: 'u-main-5b',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 42)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([])
  })

  it('ignores Node events with unknown phase', async () => {
    const lines = [
      makeEventLine(171, 'Tasker.Task.Starting', {
        task_id: 51,
        entry: 'MainTask',
        hash: 'h-main-6',
        uuid: 'u-main-6',
      }),
      makeEventLine(172, 'Node.PipelineNode.Starting', {
        task_id: 51,
        node_id: 5101,
        name: 'MainNode',
      }),
      makeEventLine(173, 'Node.NextList.Custom', {
        task_id: 51,
        name: 'MainNode',
        list: [{ name: 'ShouldIgnore', anchor: false, jump_back: false }],
      }),
      makeEventLine(174, 'Node.PipelineNode.Succeeded', {
        task_id: 51,
        node_id: 5101,
        name: 'MainNode',
      }),
      makeEventLine(175, 'Tasker.Task.Succeeded', {
        task_id: 51,
        entry: 'MainTask',
        hash: 'h-main-6',
        uuid: 'u-main-6',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 51)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([])
  })

  it('ignores Tasker.Task events with unknown phase', async () => {
    const lines = [
      makeEventLine(181, 'Tasker.Task.Starting', {
        task_id: 61,
        entry: 'MainTask',
        hash: 'h-main-7',
        uuid: 'u-main-7',
      }),
      makeEventLine(182, 'Node.PipelineNode.Starting', {
        task_id: 61,
        node_id: 6101,
        name: 'MainNode',
      }),
      makeEventLine(183, 'Tasker.Task.Custom', {
        task_id: 61,
        entry: 'MainTask',
        hash: 'h-main-7',
        uuid: 'u-main-7',
      }),
      makeEventLine(184, 'Node.PipelineNode.Succeeded', {
        task_id: 61,
        node_id: 6101,
        name: 'MainNode',
      }),
      makeEventLine(185, 'Tasker.Task.Succeeded', {
        task_id: 61,
        entry: 'MainTask',
        hash: 'h-main-7',
        uuid: 'u-main-7',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 61)
    expect(mainTask).toBeTruthy()
    expect(tasks.filter((item) => item.task_id === 61)).toHaveLength(1)
    expect(mainTask?.status).toBe('succeeded')
    expect(mainTask?.nodes.length).toBe(1)
  })

  it('binds reused task IDs to their own sequential executions', async () => {
    const lines = [
      makeEventLine(100, 'Tasker.Task.Starting', {
        task_id: 90,
        entry: 'First',
        hash: 'h-first',
        uuid: 'u-first',
      }),
      makeEventLine(200, 'Tasker.Task.Succeeded', {
        task_id: 90,
        entry: 'First',
        hash: 'h-first',
        uuid: 'u-first',
      }),
      makeEventLine(201, 'Tasker.Task.Starting', {
        task_id: 90,
        entry: 'Second',
        hash: 'h-second',
        uuid: 'u-second',
      }),
      makeEventLine(300, 'Tasker.Task.Succeeded', {
        task_id: 90,
        entry: 'Second',
        hash: 'h-second',
        uuid: 'u-second',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot().filter((item) => item.task_id === 90)

    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.events.map((event) => event._lineNumber)).toEqual([1, 2])
    expect(tasks[1]?.events.map((event) => event._lineNumber)).toEqual([3, 4])
  })

  it('binds reused task IDs to the source that produced each trace occurrence', async () => {
    const parser = new LogParser()
    await parser.parseInputs(
      [
        {
          sourceKey: 'source-a.log',
          content: makeEventLine(100, 'Tasker.Task.Starting', {
            task_id: 90,
            entry: 'SourceA',
            hash: 'h-a',
            uuid: 'u-a',
          }),
        },
        {
          sourceKey: 'source-b.log',
          content: [
            makeEventLine(100, 'Tasker.Task.Starting', {
              task_id: 90,
              entry: 'SourceB',
              hash: 'h-b',
              uuid: 'u-b',
            }),
            makeEventLine(200, 'Tasker.Task.Succeeded', {
              task_id: 90,
              entry: 'SourceB',
              hash: 'h-b',
              uuid: 'u-b',
            }),
          ].join('\n'),
        },
      ],
      undefined,
      { yieldControl: null },
    )

    const tasks = parser.getTasksSnapshot().filter((item) => item.task_id === 90)
    const sourceATask = tasks.find((item) => item.entry === 'SourceA')
    const sourceBTask = tasks.find((item) => item.entry === 'SourceB')

    expect(sourceATask?.events.map((event) => event.details.entry)).toEqual(['SourceA'])
    expect(sourceBTask?.events.map((event) => event.details.entry)).toEqual(['SourceB', 'SourceB'])
  })

  it('deduplicates mirrored cross-source Tasker.Task.Starting for same task_id and uuid', async () => {
    const lines = [
      makeEventLine(
        191,
        'Tasker.Task.Starting',
        { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' },
        {
          processId: 'Px1',
          threadId: 'Tx1',
        },
      ),
      makeEventLine(
        192,
        'Tasker.Task.Starting',
        { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' },
        {
          processId: 'Px2',
          threadId: 'Tx2',
        },
      ),
      makeEventLine(193, 'Node.PipelineNode.Starting', {
        task_id: 91,
        node_id: 9101,
        name: 'MainNode',
      }),
      makeEventLine(194, 'Node.PipelineNode.Succeeded', {
        task_id: 91,
        node_id: 9101,
        name: 'MainNode',
      }),
      makeEventLine(195, 'Tasker.Task.Succeeded', {
        task_id: 91,
        entry: 'MainTask',
        hash: 'h-main-91',
        uuid: 'u-main-91',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const matchedTasks = tasks.filter((item) => item.task_id === 91)
    expect(matchedTasks).toHaveLength(1)
    expect(matchedTasks[0].status).toBe('succeeded')
    expect(matchedTasks[0].nodes.length).toBe(1)
  })

  it('deduplicates delayed mirrored cross-source Tasker.Task.Succeeded without creating an empty terminal task', async () => {
    const lines = [
      makeEventLine(
        200,
        'Tasker.Task.Starting',
        { task_id: 92, entry: 'MainTask', hash: 'h-main-92', uuid: 'u-main-92' },
        {
          processId: 'Px1',
          threadId: 'Tx1',
        },
      ),
      makeEventLine(201, 'Node.PipelineNode.Starting', {
        task_id: 92,
        node_id: 9201,
        name: 'MainNode',
      }),
      makeEventLine(202, 'Node.PipelineNode.Succeeded', {
        task_id: 92,
        node_id: 9201,
        name: 'MainNode',
      }),
      makeEventLine(
        203,
        'Tasker.Task.Succeeded',
        { task_id: 92, entry: 'MainTask', hash: 'h-main-92', uuid: 'u-main-92' },
        {
          processId: 'Px1',
          threadId: 'Tx1',
        },
      ),
      makeEventLine(
        230,
        'Tasker.Task.Succeeded',
        { task_id: 92, entry: 'MainTask', hash: 'h-main-92', uuid: 'u-main-92' },
        {
          processId: 'Px2',
          threadId: 'Tx2',
        },
      ),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const matchedTasks = tasks.filter((item) => item.task_id === 92)

    expect(matchedTasks).toHaveLength(1)
    expect(matchedTasks[0]?.status).toBe('succeeded')
    expect(matchedTasks[0]?.nodes).toHaveLength(1)
    expect(matchedTasks[0]?.start_time).toBe('2026-04-06 10:00:00.200')
    expect(matchedTasks[0]?.end_time).toBe('2026-04-06 10:00:00.203')
  })

  it('keeps same-source duplicate Tasker.Task.Starting as separate task scopes', async () => {
    const lines = [
      makeEventLine(191, 'Tasker.Task.Starting', {
        task_id: 91,
        entry: 'MainTask',
        hash: 'h-main-91',
        uuid: 'u-main-91',
      }),
      makeEventLine(192, 'Tasker.Task.Starting', {
        task_id: 91,
        entry: 'MainTask',
        hash: 'h-main-91',
        uuid: 'u-main-91',
      }),
      makeEventLine(193, 'Node.PipelineNode.Starting', {
        task_id: 91,
        node_id: 9101,
        name: 'MainNode',
      }),
      makeEventLine(194, 'Node.PipelineNode.Succeeded', {
        task_id: 91,
        node_id: 9101,
        name: 'MainNode',
      }),
      makeEventLine(195, 'Tasker.Task.Succeeded', {
        task_id: 91,
        entry: 'MainTask',
        hash: 'h-main-91',
        uuid: 'u-main-91',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const matchedTasks = tasks.filter((item) => item.task_id === 91)
    expect(matchedTasks).toHaveLength(2)
    expect(matchedTasks.map((item) => item.status)).toEqual(['running', 'succeeded'])
    expect(matchedTasks[0]?.nodes).toEqual([])
    expect(matchedTasks[0]?.events.map((event) => event._lineNumber)).toEqual([1])
    expect(matchedTasks[1]?.nodes).toHaveLength(1)
    expect(matchedTasks[1]?.events.map((event) => event._lineNumber)).toEqual([2, 3, 4, 5])
  })

  it('keeps a cross-source repeat Tasker.Task.Starting apart when the previous run never closed', async () => {
    // 一份 maafw.log 会被多次启动的进程追加写入（未到 16MiB 不轮转），进程重启后
    // task_id / node_id 都从固定基数重新分配，且上一轮被杀掉时没有 Tasker.Task.Succeeded。
    // 这类同 key 的二次 Starting 属于业务语义重复（架构文档 §5.4），不能被当成跨源镜像合并。
    const lines = [
      makeEventLine(
        300,
        'Tasker.Task.Starting',
        { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' },
        { processId: 'Px1', threadId: 'Tx1' },
      ),
      makeEventLine(
        301,
        'Node.PipelineNode.Starting',
        { task_id: 91, node_id: 9101, name: 'MainNode' },
        { processId: 'Px1', threadId: 'Tx1' },
      ),
      makeEventLine(
        302,
        'Node.PipelineNode.Succeeded',
        { task_id: 91, node_id: 9101, name: 'MainNode' },
        { processId: 'Px1', threadId: 'Tx1' },
      ),
      // 进程重启：新 Px/Tx、同样的 task_id / node_id，且上一轮没有终止事件
      makeEventLine(
        5300,
        'Tasker.Task.Starting',
        { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' },
        { processId: 'Px2', threadId: 'Tx2' },
      ),
      makeEventLine(
        5301,
        'Node.PipelineNode.Starting',
        { task_id: 91, node_id: 9101, name: 'MainNode' },
        { processId: 'Px2', threadId: 'Tx2' },
      ),
      makeEventLine(
        5302,
        'Node.PipelineNode.Succeeded',
        { task_id: 91, node_id: 9101, name: 'MainNode' },
        { processId: 'Px2', threadId: 'Tx2' },
      ),
      makeEventLine(
        5303,
        'Tasker.Task.Succeeded',
        { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' },
        { processId: 'Px2', threadId: 'Tx2' },
      ),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const matchedTasks = parser.getTasksSnapshot().filter((item) => item.task_id === 91)

    expect(matchedTasks).toHaveLength(2)
    expect(matchedTasks.map((item) => item.status)).toEqual(['running', 'succeeded'])
    expect(matchedTasks.map((item) => item.nodes.length)).toEqual([1, 1])
    expect(matchedTasks[0]?.start_time).toBe('2026-04-06 10:00:00.300')
    expect(matchedTasks[1]?.start_time).toBe('2026-04-06 10:00:05.300')
  })

  it('keeps two concurrent runs sharing a task_id from stealing each other scopes', async () => {
    // 两个实例同时往同一份日志里写时，MaaFramework 的进程级计数器会让它们拿到同一个
    // task_id / node_id。作用域身份必须带上 processId，否则两个会话共用一条 scope 栈：
    // 后开的任务顶掉先开的，先开的终止事件又会去关掉后开的 scope，节点与状态互相错挂。
    const start = { task_id: 91, entry: 'unattendedMode', hash: 'h-91', uuid: 'u-91' }
    const lines = [
      makeEventLine(6000, 'Tasker.Task.Starting', start, { processId: 'Px1', threadId: 'Tx1' }),
      makeEventLine(
        6100,
        'Node.PipelineNode.Starting',
        { task_id: 91, node_id: 9101, name: 'A1' },
        { processId: 'Px1', threadId: 'Tx1' },
      ),
      makeEventLine(8100, 'Tasker.Task.Starting', start, { processId: 'Px2', threadId: 'Tx2' }),
      makeEventLine(
        8200,
        'Node.PipelineNode.Starting',
        { task_id: 91, node_id: 9101, name: 'B1' },
        { processId: 'Px2', threadId: 'Tx2' },
      ),
      makeEventLine(
        9900,
        'Node.PipelineNode.Succeeded',
        { task_id: 91, node_id: 9101, name: 'A1' },
        {
          processId: 'Px1',
          threadId: 'Tx1',
        },
      ),
      makeEventLine(10000, 'Tasker.Task.Succeeded', start, { processId: 'Px1', threadId: 'Tx1' }),
      makeEventLine(
        14000,
        'Node.PipelineNode.Succeeded',
        { task_id: 91, node_id: 9101, name: 'B1' },
        { processId: 'Px2', threadId: 'Tx2' },
      ),
      makeEventLine(14200, 'Tasker.Task.Succeeded', start, { processId: 'Px2', threadId: 'Tx2' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const matchedTasks = parser.getTasksSnapshot().filter((item) => item.task_id === 91)

    expect(matchedTasks).toHaveLength(2)
    expect(matchedTasks.map((item) => item.status)).toEqual(['succeeded', 'succeeded'])
    expect(matchedTasks.map((item) => item.start_time)).toEqual([
      '2026-04-06 10:00:06.000',
      '2026-04-06 10:00:08.100',
    ])
    // 关键断言：每个任务只应持有自己那个进程的节点
    expect(matchedTasks.map((item) => item.nodes.map((node) => node.name))).toEqual([
      ['A1'],
      ['B1'],
    ])
    // 事件同样不能串：两个任务共用同一份 sequencedEventsByTaskId，必须按进程切开，
    // 否则每个任务的事件列表都会吃到对方的（污染证据的 timestamp→行号 索引）。
    const nodeNamesOf = (task: (typeof matchedTasks)[number]) => [
      ...new Set(
        task.events
          .map((event) => (event.details as Record<string, unknown> | undefined)?.name)
          .filter((name): name is string => typeof name === 'string' && /^[AB]1$/.test(name)),
      ),
    ]
    expect(nodeNamesOf(matchedTasks[0]!)).toEqual(['A1'])
    expect(nodeNamesOf(matchedTasks[1]!)).toEqual(['B1'])
    expect(matchedTasks[0]?.events.map((event) => event._lineNumber)).toEqual([1, 2, 5, 6])
    expect(matchedTasks[1]?.events.map((event) => event._lineNumber)).toEqual([3, 4, 7, 8])
  })

  it('keeps the owning process events when the task is closed by an adopted foreign terminal', async () => {
    // finalizeScope 会用关闭事件重写 payload.processId。若关闭事件来自被认领的另一进程
    // （adoptOpenTaskScope），payload 记的是「谁把它关掉的」，而不是「谁拥有它的节点」。
    // 事件归属必须按**子树进程集合**取，否则会把创建者的节点事件全部滤掉。
    const start = { task_id: 91, entry: 'MainTask', hash: 'h-91', uuid: 'u-91' }
    const parser = new LogParser()
    await parser.parseFile(
      [
        makeEventLine(1000, 'Tasker.Task.Starting', start, { processId: 'Px1', threadId: 'Tx1' }),
        makeEventLine(
          1100,
          'Node.PipelineNode.Starting',
          { task_id: 91, node_id: 9101, name: 'OwnedNode' },
          { processId: 'Px1', threadId: 'Tx1' },
        ),
        // 另一进程的终止事件：没有自己的 scope，会认领 Px1 那个
        makeEventLine(2000, 'Tasker.Task.Failed', start, { processId: 'Px2', threadId: 'Tx2' }),
      ].join('\n'),
    )

    const matchedTasks = parser.getTasksSnapshot().filter((item) => item.task_id === 91)
    expect(matchedTasks).toHaveLength(1)
    expect(matchedTasks[0]?.status).toBe('failed')
    expect(matchedTasks[0]?.nodes.map((node) => node.name)).toEqual(['OwnedNode'])
    // 关键：拥有节点的 Px1 的事件不能被滤掉
    expect(matchedTasks[0]?.events.map((event) => event._lineNumber)).toEqual([1, 2, 3])
  })

  it('deduplicates a repeated cross-source notification that only matches in a later input', async () => {
    // 同一签名会反复出现（Node.NextList.* 在循环里尤其明显）。多个输入是逐个文件串行解析的，
    // 若只保留"最后一次出现"去比对，先解析那份文件里与镜像成对的那一次早被后续覆盖，去重会整体漏掉。
    const list = [
      { name: 'Loop', anchor: false, jump_back: false },
      { name: 'Done', anchor: false, jump_back: false },
    ]
    const local = [1000, 2000, 3000, 4000].map((index) =>
      makeEventLine(
        index,
        'Node.NextList.Starting',
        { task_id: 91, name: 'Loop', list },
        {
          processId: 'Px1',
          threadId: 'Tx1',
        },
      ),
    )
    const mirrored = [2100, 3100, 4100].map((index) =>
      makeEventLine(
        index,
        'Node.NextList.Starting',
        { task_id: 91, name: 'Loop', list },
        {
          processId: 'Px2',
          threadId: 'Tx2',
        },
      ),
    )

    const parser = new LogParser()
    await parser.parseInputs([
      { content: local.join('\n'), sourceKey: 'agent', inputIndex: 0 },
      { content: mirrored.join('\n'), sourceKey: 'client', inputIndex: 1 },
    ])

    const nextLists = parser
      .getProtocolEventsSnapshot()
      .filter((event) => event.rawMessage === 'Node.NextList.Starting')
    expect(nextLists).toHaveLength(4)
    expect(nextLists.every((event) => event.processId === 'Px1')).toBe(true)
  })

  it('adopts the still-open task scope when a mirrored run leaves an orphan terminal event', async () => {
    // 客户端 + agent 两份日志一起加载时，先到那份文件的 Tasker.Task.Starting 会被当成镜像去掉，
    // 于是这一侧的终止事件找不到自己的 scope。若不管，就会多出一个 0 节点的空任务。
    const start = { task_id: 91, entry: 'Awards', hash: 'h-91', uuid: 'u-91' }
    const parser = new LogParser()
    await parser.parseInputs([
      {
        content: [
          makeEventLine(1000, 'Tasker.Task.Starting', start, { processId: 'Px1', threadId: 'Tx1' }),
          makeEventLine(
            1100,
            'Node.PipelineNode.Starting',
            { task_id: 91, node_id: 9101, name: 'OnlyNode' },
            { processId: 'Px1', threadId: 'Tx1' },
          ),
        ].join('\n'),
        sourceKey: 'agent',
        inputIndex: 0,
      },
      {
        content: [
          makeEventLine(1010, 'Tasker.Task.Starting', start, { processId: 'Px2', threadId: 'Tx2' }),
          makeEventLine(
            1110,
            'Node.PipelineNode.Starting',
            { task_id: 91, node_id: 9101, name: 'OnlyNode' },
            { processId: 'Px2', threadId: 'Tx2' },
          ),
          makeEventLine(5000, 'Tasker.Task.Failed', start, { processId: 'Px2', threadId: 'Tx2' }),
        ].join('\n'),
        sourceKey: 'client',
        inputIndex: 1,
      },
    ])

    const matchedTasks = parser.getTasksSnapshot().filter((item) => item.task_id === 91)
    expect(matchedTasks).toHaveLength(1)
    expect(matchedTasks[0]?.status).toBe('failed')
    expect(matchedTasks[0]?.nodes.map((node) => node.name)).toEqual(['OnlyNode'])
  })

  it('rebuilds the task scope for a rotated fragment that starts mid-task', async () => {
    // MaaFramework 在跑任务途中日志超 16MiB 就轮转，主日志因此可能没有 Tasker.Task.Starting。
    // 修复前这些 pipeline_node 会全部掉到 trace 根上，界面只剩一个 0 节点的空任务。
    const parser = new LogParser()
    await parser.parseFile(
      [
        makeEventLine(1000, 'Node.PipelineNode.Starting', {
          task_id: 91,
          node_id: 9101,
          name: 'NodeA',
        }),
        makeEventLine(1100, 'Node.PipelineNode.Succeeded', {
          task_id: 91,
          node_id: 9101,
          name: 'NodeA',
        }),
        makeEventLine(1200, 'Node.PipelineNode.Starting', {
          task_id: 91,
          node_id: 9102,
          name: 'NodeB',
        }),
        makeEventLine(1300, 'Node.PipelineNode.Succeeded', {
          task_id: 91,
          node_id: 9102,
          name: 'NodeB',
        }),
        makeEventLine(2000, 'Tasker.Task.Succeeded', {
          task_id: 91,
          entry: 'Fragment',
          hash: 'h-frag',
          uuid: 'u-frag',
        }),
      ].join('\n'),
    )

    const tasks = parser.getTasksSnapshot()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.task_id).toBe(91)
    expect(tasks[0]?.entry).toBe('Fragment')
    expect(tasks[0]?.status).toBe('succeeded')
    expect(tasks[0]?.nodes.map((node) => node.name)).toEqual(['NodeA', 'NodeB'])
  })

  it('does not invent a task from leading non-node events in a fragment', async () => {
    // recognition / action 之类在完整日志里都挂在某个 pipeline_node 之下；片段开头先出现它们时
    // 无从判断归属，保持原样挂到根上，好过凭空造出一个 0 节点的任务。
    const parser = new LogParser()
    await parser.parseFile(
      [
        makeEventLine(1000, 'Node.Recognition.Starting', { task_id: 91, reco_id: 5101, name: 'R' }),
        makeEventLine(1010, 'Node.Recognition.Failed', { task_id: 91, reco_id: 5101, name: 'R' }),
        makeEventLine(1200, 'Node.PipelineNode.Starting', {
          task_id: 91,
          node_id: 9101,
          name: 'NodeA',
        }),
        makeEventLine(1300, 'Node.PipelineNode.Succeeded', {
          task_id: 91,
          node_id: 9101,
          name: 'NodeA',
        }),
      ].join('\n'),
    )

    const tasks = parser.getTasksSnapshot()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.nodes.map((node) => node.name)).toEqual(['NodeA'])
  })

  it('promotes an implicitly created task scope when the real Tasker.Task.Starting arrives', async () => {
    // 轮转片段里 pipeline_node 先到、真身 Starting 后到：必须**就地转正**，
    // 不能叠出第二个任务（隐式那个会永远收不到终止事件，一直是 running）。
    const parser = new LogParser()
    await parser.parseFile(
      [
        makeEventLine(1000, 'Node.PipelineNode.Starting', {
          task_id: 91,
          node_id: 9101,
          name: 'NodeA',
        }),
        makeEventLine(1100, 'Node.PipelineNode.Succeeded', {
          task_id: 91,
          node_id: 9101,
          name: 'NodeA',
        }),
        makeEventLine(1200, 'Tasker.Task.Starting', {
          task_id: 91,
          entry: 'RealTask',
          hash: 'h-real',
          uuid: 'u-real',
        }),
        makeEventLine(1300, 'Node.PipelineNode.Starting', {
          task_id: 91,
          node_id: 9102,
          name: 'NodeB',
        }),
        makeEventLine(1400, 'Node.PipelineNode.Succeeded', {
          task_id: 91,
          node_id: 9102,
          name: 'NodeB',
        }),
        makeEventLine(2000, 'Tasker.Task.Succeeded', {
          task_id: 91,
          entry: 'RealTask',
          hash: 'h-real',
          uuid: 'u-real',
        }),
      ].join('\n'),
    )

    const tasks = parser.getTasksSnapshot()
    expect(tasks).toHaveLength(1)
    // 名字来自真身 Starting，而不是补建时借来的节点名
    expect(tasks[0]?.entry).toBe('RealTask')
    expect(tasks[0]?.status).toBe('succeeded')
    expect(tasks[0]?.nodes.map((node) => node.name)).toEqual(['NodeA', 'NodeB'])
    // 起始时间保留更早的那个（补建的作用域先看到节点）
    expect(tasks[0]?.start_time).toBe('2026-04-06 10:00:01.000')
  })

  it('keeps two tasks when a mirrored start falls outside the dedup window', async () => {
    // 钉住现状：跨源去重是镜像合并的**唯一**机制（§5.3），超出 ±1s 窗口就不再合并。
    // 这条用例不是"期望行为"，而是把当前取舍写成可执行的记录 ——
    // 将来若要放宽窗口、或折叠这种重复任务，改动会让它失败，从而是一次有意识的决策。
    const start = { task_id: 91, entry: 'Mirror', hash: 'h-mirror', uuid: 'u-mirror' }
    const px1 = { processId: 'Px1', threadId: 'Tx1' }
    const px2 = { processId: 'Px2', threadId: 'Tx2' }
    const parser = new LogParser()
    await parser.parseFile(
      [
        makeEventLine(1000, 'Tasker.Task.Starting', start, px1),
        makeEventLine(
          1100,
          'Node.PipelineNode.Starting',
          { task_id: 91, node_id: 9101, name: 'NodeA' },
          px1,
        ),
        // 2s 之后才出现的"镜像"，已经在 ±1s 窗口之外
        makeEventLine(3000, 'Tasker.Task.Starting', start, px2),
        makeEventLine(
          3100,
          'Node.PipelineNode.Starting',
          { task_id: 91, node_id: 9101, name: 'NodeA' },
          px2,
        ),
        makeEventLine(4000, 'Tasker.Task.Succeeded', start, px1),
        makeEventLine(6000, 'Tasker.Task.Succeeded', start, px2),
      ].join('\n'),
    )

    const matchedTasks = parser.getTasksSnapshot().filter((item) => item.task_id === 91)
    expect(matchedTasks).toHaveLength(2)
    expect(matchedTasks.map((item) => item.status)).toEqual(['succeeded', 'succeeded'])
    expect(matchedTasks.map((item) => item.nodes.length)).toEqual([1, 1])
  })

  it('attaches nodes to the existing task when a mirrored source kept them instead of the start', async () => {
    // 跨源去重是「谁先出现谁留下」，于是可能出现「一侧的 Tasker.Task.Starting 留下、
    // 另一侧的节点事件留下」的混搭。后者按 (processId, taskId) 找不到自己的作用域，
    // 修复前会全部掉到 trace 根节点上。
    const start = { task_id: 91, entry: 'MainTask', hash: 'h-91', uuid: 'u-91' }
    const remote = { processId: 'Px2', threadId: 'Tx2' }
    const parser = new LogParser()
    await parser.parseFile(
      [
        makeEventLine(1000, 'Tasker.Task.Starting', start, { processId: 'Px1', threadId: 'Tx1' }),
        makeEventLine(
          1010,
          'Node.PipelineNode.Starting',
          { task_id: 91, node_id: 9101, name: 'NodeA' },
          remote,
        ),
        makeEventLine(
          1020,
          'Node.PipelineNode.Succeeded',
          { task_id: 91, node_id: 9101, name: 'NodeA' },
          remote,
        ),
        makeEventLine(
          1030,
          'Node.PipelineNode.Starting',
          { task_id: 91, node_id: 9102, name: 'NodeB' },
          remote,
        ),
        makeEventLine(
          1040,
          'Node.PipelineNode.Succeeded',
          { task_id: 91, node_id: 9102, name: 'NodeB' },
          remote,
        ),
        makeEventLine(2000, 'Tasker.Task.Succeeded', start, { processId: 'Px1', threadId: 'Tx1' }),
      ].join('\n'),
    )

    const matchedTasks = parser.getTasksSnapshot().filter((item) => item.task_id === 91)
    expect(matchedTasks).toHaveLength(1)
    expect(matchedTasks[0]?.status).toBe('succeeded')
    expect(matchedTasks[0]?.nodes.map((node) => node.name)).toEqual(['NodeA', 'NodeB'])
  })

  it('ignores non-numeric task_id in Tasker.Task lifecycle events', async () => {
    const lines = [
      makeEventLine(196, 'Tasker.Task.Starting', {
        task_id: '92',
        entry: 'InvalidTask',
        hash: 'h-invalid',
        uuid: 'u-invalid',
      }),
      makeEventLine(197, 'Tasker.Task.Succeeded', {
        task_id: '92',
        entry: 'InvalidTask',
        hash: 'h-invalid',
        uuid: 'u-invalid',
      }),
      makeEventLine(198, 'Tasker.Task.Starting', {
        task_id: 93,
        entry: 'MainTask',
        hash: 'h-main-93',
        uuid: 'u-main-93',
      }),
      makeEventLine(199, 'Node.PipelineNode.Starting', {
        task_id: 93,
        node_id: 9301,
        name: 'MainNode',
      }),
      makeEventLine(200, 'Node.PipelineNode.Succeeded', {
        task_id: 93,
        node_id: 9301,
        name: 'MainNode',
      }),
      makeEventLine(201, 'Tasker.Task.Succeeded', {
        task_id: 93,
        entry: 'MainTask',
        hash: 'h-main-93',
        uuid: 'u-main-93',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()

    expect(tasks.find((item) => item.uuid === 'u-invalid')).toBeUndefined()

    const validTask = tasks.find((item) => item.task_id === 93)
    expect(validTask).toBeTruthy()
    expect(validTask?.status).toBe('succeeded')
    expect(validTask?.nodes.length).toBe(1)
  })

  it('builds multi-level nested sub tasks by parent task relation', async () => {
    const lines = [
      makeEventLine(211, 'Tasker.Task.Starting', {
        task_id: 21,
        entry: 'MainTask',
        hash: 'h-main-3',
        uuid: 'u-main-3',
      }),
      makeEventLine(212, 'Node.PipelineNode.Starting', {
        task_id: 21,
        node_id: 2101,
        name: 'MainNode',
      }),

      makeEventLine(213, 'Tasker.Task.Starting', {
        task_id: 22,
        entry: 'SubTaskL1',
        hash: 'h-sub-l1',
        uuid: 'u-sub-l1',
      }),
      makeEventLine(214, 'Node.PipelineNode.Starting', {
        task_id: 22,
        node_id: 2201,
        name: 'SubNodeL1',
      }),

      makeEventLine(215, 'Tasker.Task.Starting', {
        task_id: 23,
        entry: 'SubTaskL2',
        hash: 'h-sub-l2',
        uuid: 'u-sub-l2',
      }),
      makeEventLine(216, 'Node.PipelineNode.Starting', {
        task_id: 23,
        node_id: 2301,
        name: 'SubNodeL2',
      }),
      makeEventLine(217, 'Node.PipelineNode.Succeeded', {
        task_id: 23,
        node_id: 2301,
        name: 'SubNodeL2',
      }),
      makeEventLine(218, 'Tasker.Task.Succeeded', {
        task_id: 23,
        entry: 'SubTaskL2',
        hash: 'h-sub-l2',
        uuid: 'u-sub-l2',
      }),

      makeEventLine(219, 'Node.PipelineNode.Succeeded', {
        task_id: 22,
        node_id: 2201,
        name: 'SubNodeL1',
      }),
      makeEventLine(220, 'Tasker.Task.Succeeded', {
        task_id: 22,
        entry: 'SubTaskL1',
        hash: 'h-sub-l1',
        uuid: 'u-sub-l1',
      }),

      makeEventLine(221, 'Node.PipelineNode.Succeeded', {
        task_id: 21,
        node_id: 2101,
        name: 'MainNode',
      }),
      makeEventLine(222, 'Tasker.Task.Succeeded', {
        task_id: 21,
        entry: 'MainTask',
        hash: 'h-main-3',
        uuid: 'u-main-3',
      }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find((item) => item.task_id === 21)

    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)

    const mainNode = mainTask!.nodes[0]
    const taskFlowItems = collectFlowItems(mainNode.node_flow, (item) => item.type === 'task')

    const task22 = taskFlowItems.find(({ item }) => item.task_id === 22)
    const task23 = taskFlowItems.find(({ item }) => item.task_id === 23)
    expect(task22).toBeTruthy()
    expect(task23).toBeTruthy()
    expect(
      task23?.path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 22),
    ).toBe(true)

    const rootTaskIds = taskFlowItems
      .filter(({ path }) => path.filter((pathNode) => pathNode.type === 'task').length === 1)
      .map(({ item }) => item.task_id)
    expect(rootTaskIds).toContain(22)
    expect(rootTaskIds).not.toContain(23)
  })
})
