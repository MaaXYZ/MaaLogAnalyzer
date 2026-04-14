import { describe, expect, it } from 'vitest'
import type { UnifiedFlowItem } from '@windsland52/maa-log-parser/types'
import { LogParser } from '@windsland52/maa-log-parser'

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
  }
): string => {
  const processId = source?.processId ?? 'Px1'
  const threadId = source?.threadId ?? 'Tx1'
  return `[${formatTimestamp(eventIndex)}][INF][${processId}][${threadId}][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const collectFlowItems = (
  items: UnifiedFlowItem[] | undefined,
  matcher: (item: UnifiedFlowItem, path: UnifiedFlowItem[]) => boolean
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
      makeEventLine(1, 'Tasker.Task.Starting', { task_id: 1, entry: 'MainTask', hash: 'h-main', uuid: 'u-main' }),
      makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: 'MainNode' }),
      makeEventLine(3, 'Node.NextList.Starting', {
        task_id: 1,
        name: 'MainNode',
        list: [{ name: 'MainNext', anchor: false, jump_back: false }],
      }),
      makeEventLine(4, 'Tasker.Task.Starting', { task_id: 2, entry: 'SubTask', hash: 'h-sub', uuid: 'u-sub' }),
      makeEventLine(5, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: 'SubNode' }),
      makeEventLine(6, 'Node.NextList.Starting', {
        task_id: 2,
        name: 'SubNode',
        list: [{ name: 'SubNext', anchor: true, jump_back: false }],
      }),
      makeEventLine(7, 'Node.WaitFreezes.Starting', { task_id: 2, wf_id: 1, phase: 'pre', name: 'SubNode' }),
      makeEventLine(8, 'Node.WaitFreezes.Succeeded', {
        task_id: 2,
        wf_id: 1,
        phase: 'post',
        name: 'SubNode',
        elapsed: 33,
      }),
      makeEventLine(9, 'Node.PipelineNode.Succeeded', { task_id: 2, node_id: 201, name: 'SubNode' }),
      makeEventLine(10, 'Tasker.Task.Succeeded', { task_id: 2, entry: 'SubTask', hash: 'h-sub', uuid: 'u-sub' }),
      makeEventLine(11, 'Node.WaitFreezes.Starting', { task_id: 1, wf_id: 1, phase: 'repeat', name: 'MainNode' }),
      makeEventLine(12, 'Node.WaitFreezes.Failed', {
        task_id: 1,
        wf_id: 1,
        phase: 'repeat',
        name: 'MainNode',
        elapsed: 66,
      }),
      makeEventLine(13, 'Node.PipelineNode.Succeeded', { task_id: 1, node_id: 101, name: 'MainNode' }),
      makeEventLine(14, 'Tasker.Task.Succeeded', { task_id: 1, entry: 'MainTask', hash: 'h-main', uuid: 'u-main' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 1)

    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)

    const mainNode = mainTask!.nodes[0]
    expect(mainNode.next_list).toEqual([
      { name: 'MainNext', anchor: false, jump_back: false },
    ])

    const allWaitFreezes = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'wait_freezes'
    )
    expect(allWaitFreezes.length).toBeGreaterThanOrEqual(2)

    const mainWaitFreezes = allWaitFreezes.find(
      ({ item }) =>
        item.wait_freezes_details?.wf_id === 1 &&
        item.wait_freezes_details?.phase === 'repeat' &&
        item.status === 'failed'
    )
    expect(mainWaitFreezes).toBeTruthy()
    expect(mainWaitFreezes?.item.task_id).toBe(1)
    expect(mainWaitFreezes?.item.node_id).toBe(101)

    const subWaitFreezes = allWaitFreezes.find(
      ({ item }) =>
        item.wait_freezes_details?.wf_id === 1 &&
        item.wait_freezes_details?.phase === 'post' &&
        item.status === 'success'
    )
    expect(subWaitFreezes).toBeTruthy()
    expect(subWaitFreezes?.item.task_id).toBe(2)
    expect(subWaitFreezes?.item.node_id).toBe(201)
    expect(subWaitFreezes?.item.id).not.toBe(mainWaitFreezes?.item.id)
    expect(subWaitFreezes?.path.some(pathNode => pathNode.type === 'task' && pathNode.task_id === 2)).toBe(true)
  })

  it('keeps sub task ActionNode timeline after helper extraction', async () => {
    const lines = [
      makeEventLine(101, 'Tasker.Task.Starting', { task_id: 11, entry: 'MainTask', hash: 'h-main-2', uuid: 'u-main-2' }),
      makeEventLine(102, 'Node.PipelineNode.Starting', { task_id: 11, node_id: 1101, name: 'MainNode' }),

      makeEventLine(103, 'Tasker.Task.Starting', { task_id: 12, entry: 'SubTask', hash: 'h-sub-2', uuid: 'u-sub-2' }),
      makeEventLine(104, 'Node.PipelineNode.Starting', { task_id: 12, node_id: 1201, name: 'SubNode' }),
      makeEventLine(105, 'Node.Action.Starting', { task_id: 12, action_id: 5001, name: 'SubAction' }),
      makeEventLine(106, 'Node.Action.Succeeded', { task_id: 12, action_id: 5001, name: 'SubAction' }),
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
      makeEventLine(110, 'Tasker.Task.Failed', { task_id: 12, entry: 'SubTask', hash: 'h-sub-2', uuid: 'u-sub-2' }),

      makeEventLine(111, 'Node.PipelineNode.Succeeded', { task_id: 11, node_id: 1101, name: 'MainNode' }),
      makeEventLine(112, 'Tasker.Task.Succeeded', { task_id: 11, entry: 'MainTask', hash: 'h-main-2', uuid: 'u-main-2' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 11)
    expect(mainTask).toBeTruthy()

    const mainNode = mainTask!.nodes[0]
    const subTaskActionItems = collectFlowItems(
      mainNode.node_flow,
      (item, path) => item.type === 'action' && item.action_id === 5001 && path.some(pathNode => pathNode.type === 'task' && pathNode.task_id === 12)
    )
    const subTaskActionNodeItems = collectFlowItems(
      mainNode.node_flow,
      (item, path) => item.type === 'action_node' && item.action_id === 5001 && path.some(pathNode => pathNode.type === 'task' && pathNode.task_id === 12)
    )

    expect(subTaskActionItems.length).toBeGreaterThan(0)
    expect(subTaskActionItems[0].item.status).toBe('success')
    expect(subTaskActionNodeItems.length).toBeGreaterThan(0)
    expect(subTaskActionNodeItems[0].item.status).toBe('failed')
  })

  it('keeps realtime sub task flow under the explicit running action node', () => {
    const lines = [
      makeEventLine(121, 'Tasker.Task.Starting', { task_id: 1, entry: 'MainTask', hash: 'h-main-rt', uuid: 'u-main-rt' }),
      makeEventLine(122, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: 'MainNode' }),
      makeEventLine(123, 'Node.Action.Starting', { task_id: 1, action_id: 1001, name: 'MainAction' }),
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
      makeEventLine(125, 'Tasker.Task.Starting', { task_id: 2, entry: 'SubTask', hash: 'h-sub-rt', uuid: 'u-sub-rt' }),
      makeEventLine(126, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: 'SubNode' }),
      makeEventLine(127, 'Node.PipelineNode.Succeeded', { task_id: 2, node_id: 201, name: 'SubNode' }),
      makeEventLine(128, 'Tasker.Task.Succeeded', { task_id: 2, entry: 'SubTask', hash: 'h-sub-rt', uuid: 'u-sub-rt' }),
    ]

    const parser = new LogParser()
    for (const eventLine of lines) {
      parser.appendRealtimeLines([eventLine])
    }

    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 1)

    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)

    const mainNode = mainTask!.nodes[0]
    const runningMainActionNode = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'action_node' && item.action_id === 1001 && item.status === 'running'
    )
    expect(runningMainActionNode.length).toBeGreaterThan(0)

    const nestedSubTask = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'task' &&
        item.task_id === 2 &&
        path.some(pathNode => pathNode.type === 'action_node' && pathNode.action_id === 1001)
    )
    expect(nestedSubTask.length).toBeGreaterThan(0)

    const nestedSubPipeline = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'pipeline_node' &&
        item.task_id === 2 &&
        path.some(pathNode => pathNode.type === 'task' && pathNode.task_id === 2)
    )
    expect(nestedSubPipeline.length).toBeGreaterThan(0)
    expect(nestedSubPipeline[0].item.status).toBe('success')
  })

  it('tolerates malformed NextList payloads', async () => {
    const lines = [
      makeEventLine(151, 'Tasker.Task.Starting', { task_id: 31, entry: 'MainTask', hash: 'h-main-4', uuid: 'u-main-4' }),
      makeEventLine(152, 'Node.PipelineNode.Starting', { task_id: 31, node_id: 3101, name: 'MainNode' }),
      makeEventLine(153, 'Node.NextList.Succeeded', {
        task_id: 31,
        name: 'MainNode',
        list: { invalid: true },
      }),
      makeEventLine(154, 'Node.PipelineNode.Succeeded', { task_id: 31, node_id: 3101, name: 'MainNode' }),
      makeEventLine(155, 'Tasker.Task.Succeeded', { task_id: 31, entry: 'MainTask', hash: 'h-main-4', uuid: 'u-main-4' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 31)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([])
  })

  it('keeps next_list when Node.NextList.Failed carries list payload', async () => {
    const lines = [
      makeEventLine(161, 'Tasker.Task.Starting', { task_id: 41, entry: 'MainTask', hash: 'h-main-5', uuid: 'u-main-5' }),
      makeEventLine(162, 'Node.PipelineNode.Starting', { task_id: 41, node_id: 4101, name: 'MainNode' }),
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
      makeEventLine(165, 'Node.PipelineNode.Succeeded', { task_id: 41, node_id: 4101, name: 'MainNode' }),
      makeEventLine(166, 'Tasker.Task.Succeeded', { task_id: 41, entry: 'MainTask', hash: 'h-main-5', uuid: 'u-main-5' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 41)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([
      { name: 'CandidateA', anchor: true, jump_back: false },
    ])
  })

  it('clears next_list when Node.NextList.Failed has no list payload', async () => {
    const lines = [
      makeEventLine(167, 'Tasker.Task.Starting', { task_id: 42, entry: 'MainTask', hash: 'h-main-5b', uuid: 'u-main-5b' }),
      makeEventLine(168, 'Node.PipelineNode.Starting', { task_id: 42, node_id: 4201, name: 'MainNode' }),
      makeEventLine(169, 'Node.NextList.Succeeded', {
        task_id: 42,
        name: 'MainNode',
        list: [{ name: 'CandidateA', anchor: true, jump_back: false }],
      }),
      makeEventLine(170, 'Node.NextList.Failed', {
        task_id: 42,
        name: 'MainNode',
      }),
      makeEventLine(171, 'Node.PipelineNode.Succeeded', { task_id: 42, node_id: 4201, name: 'MainNode' }),
      makeEventLine(172, 'Tasker.Task.Succeeded', { task_id: 42, entry: 'MainTask', hash: 'h-main-5b', uuid: 'u-main-5b' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 42)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([])
  })

  it('ignores Node events with unknown phase', async () => {
    const lines = [
      makeEventLine(171, 'Tasker.Task.Starting', { task_id: 51, entry: 'MainTask', hash: 'h-main-6', uuid: 'u-main-6' }),
      makeEventLine(172, 'Node.PipelineNode.Starting', { task_id: 51, node_id: 5101, name: 'MainNode' }),
      makeEventLine(173, 'Node.NextList.Custom', {
        task_id: 51,
        name: 'MainNode',
        list: [{ name: 'ShouldIgnore', anchor: false, jump_back: false }],
      }),
      makeEventLine(174, 'Node.PipelineNode.Succeeded', { task_id: 51, node_id: 5101, name: 'MainNode' }),
      makeEventLine(175, 'Tasker.Task.Succeeded', { task_id: 51, entry: 'MainTask', hash: 'h-main-6', uuid: 'u-main-6' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 51)
    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)
    expect(mainTask?.nodes[0].next_list).toEqual([])
  })

  it('ignores Tasker.Task events with unknown phase', async () => {
    const lines = [
      makeEventLine(181, 'Tasker.Task.Starting', { task_id: 61, entry: 'MainTask', hash: 'h-main-7', uuid: 'u-main-7' }),
      makeEventLine(182, 'Node.PipelineNode.Starting', { task_id: 61, node_id: 6101, name: 'MainNode' }),
      makeEventLine(183, 'Tasker.Task.Custom', { task_id: 61, entry: 'MainTask', hash: 'h-main-7', uuid: 'u-main-7' }),
      makeEventLine(184, 'Node.PipelineNode.Succeeded', { task_id: 61, node_id: 6101, name: 'MainNode' }),
      makeEventLine(185, 'Tasker.Task.Succeeded', { task_id: 61, entry: 'MainTask', hash: 'h-main-7', uuid: 'u-main-7' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 61)
    expect(mainTask).toBeTruthy()
    expect(tasks.filter(item => item.task_id === 61)).toHaveLength(1)
    expect(mainTask?.status).toBe('succeeded')
    expect(mainTask?.nodes.length).toBe(1)
  })

  it('deduplicates mirrored cross-source Tasker.Task.Starting for same task_id and uuid', async () => {
    const lines = [
      makeEventLine(191, 'Tasker.Task.Starting', { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' }, {
        processId: 'Px1',
        threadId: 'Tx1',
      }),
      makeEventLine(192, 'Tasker.Task.Starting', { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' }, {
        processId: 'Px2',
        threadId: 'Tx2',
      }),
      makeEventLine(193, 'Node.PipelineNode.Starting', { task_id: 91, node_id: 9101, name: 'MainNode' }),
      makeEventLine(194, 'Node.PipelineNode.Succeeded', { task_id: 91, node_id: 9101, name: 'MainNode' }),
      makeEventLine(195, 'Tasker.Task.Succeeded', { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const matchedTasks = tasks.filter(item => item.task_id === 91)
    expect(matchedTasks).toHaveLength(1)
    expect(matchedTasks[0].status).toBe('succeeded')
    expect(matchedTasks[0].nodes.length).toBe(1)
  })

  it('keeps same-source duplicate Tasker.Task.Starting as separate task scopes', async () => {
    const lines = [
      makeEventLine(191, 'Tasker.Task.Starting', { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' }),
      makeEventLine(192, 'Tasker.Task.Starting', { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' }),
      makeEventLine(193, 'Node.PipelineNode.Starting', { task_id: 91, node_id: 9101, name: 'MainNode' }),
      makeEventLine(194, 'Node.PipelineNode.Succeeded', { task_id: 91, node_id: 9101, name: 'MainNode' }),
      makeEventLine(195, 'Tasker.Task.Succeeded', { task_id: 91, entry: 'MainTask', hash: 'h-main-91', uuid: 'u-main-91' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const matchedTasks = tasks.filter(item => item.task_id === 91)
    expect(matchedTasks).toHaveLength(2)
    expect(matchedTasks.map(item => item.status)).toEqual(['running', 'succeeded'])
    expect(matchedTasks[0]?.nodes).toEqual([])
    expect(matchedTasks[1]?.nodes).toHaveLength(1)
  })

  it('ignores non-numeric task_id in Tasker.Task lifecycle events', async () => {
    const lines = [
      makeEventLine(196, 'Tasker.Task.Starting', { task_id: '92', entry: 'InvalidTask', hash: 'h-invalid', uuid: 'u-invalid' }),
      makeEventLine(197, 'Tasker.Task.Succeeded', { task_id: '92', entry: 'InvalidTask', hash: 'h-invalid', uuid: 'u-invalid' }),
      makeEventLine(198, 'Tasker.Task.Starting', { task_id: 93, entry: 'MainTask', hash: 'h-main-93', uuid: 'u-main-93' }),
      makeEventLine(199, 'Node.PipelineNode.Starting', { task_id: 93, node_id: 9301, name: 'MainNode' }),
      makeEventLine(200, 'Node.PipelineNode.Succeeded', { task_id: 93, node_id: 9301, name: 'MainNode' }),
      makeEventLine(201, 'Tasker.Task.Succeeded', { task_id: 93, entry: 'MainTask', hash: 'h-main-93', uuid: 'u-main-93' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()

    expect(tasks.find(item => item.uuid === 'u-invalid')).toBeUndefined()

    const validTask = tasks.find(item => item.task_id === 93)
    expect(validTask).toBeTruthy()
    expect(validTask?.status).toBe('succeeded')
    expect(validTask?.nodes.length).toBe(1)
  })

  it('builds multi-level nested sub tasks by parent task relation', async () => {
    const lines = [
      makeEventLine(211, 'Tasker.Task.Starting', { task_id: 21, entry: 'MainTask', hash: 'h-main-3', uuid: 'u-main-3' }),
      makeEventLine(212, 'Node.PipelineNode.Starting', { task_id: 21, node_id: 2101, name: 'MainNode' }),

      makeEventLine(213, 'Tasker.Task.Starting', { task_id: 22, entry: 'SubTaskL1', hash: 'h-sub-l1', uuid: 'u-sub-l1' }),
      makeEventLine(214, 'Node.PipelineNode.Starting', { task_id: 22, node_id: 2201, name: 'SubNodeL1' }),

      makeEventLine(215, 'Tasker.Task.Starting', { task_id: 23, entry: 'SubTaskL2', hash: 'h-sub-l2', uuid: 'u-sub-l2' }),
      makeEventLine(216, 'Node.PipelineNode.Starting', { task_id: 23, node_id: 2301, name: 'SubNodeL2' }),
      makeEventLine(217, 'Node.PipelineNode.Succeeded', { task_id: 23, node_id: 2301, name: 'SubNodeL2' }),
      makeEventLine(218, 'Tasker.Task.Succeeded', { task_id: 23, entry: 'SubTaskL2', hash: 'h-sub-l2', uuid: 'u-sub-l2' }),

      makeEventLine(219, 'Node.PipelineNode.Succeeded', { task_id: 22, node_id: 2201, name: 'SubNodeL1' }),
      makeEventLine(220, 'Tasker.Task.Succeeded', { task_id: 22, entry: 'SubTaskL1', hash: 'h-sub-l1', uuid: 'u-sub-l1' }),

      makeEventLine(221, 'Node.PipelineNode.Succeeded', { task_id: 21, node_id: 2101, name: 'MainNode' }),
      makeEventLine(222, 'Tasker.Task.Succeeded', { task_id: 21, entry: 'MainTask', hash: 'h-main-3', uuid: 'u-main-3' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))
    const tasks = parser.getTasksSnapshot()
    const mainTask = tasks.find(item => item.task_id === 21)

    expect(mainTask).toBeTruthy()
    expect(mainTask?.nodes.length).toBe(1)

    const mainNode = mainTask!.nodes[0]
    const taskFlowItems = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'task'
    )

    const task22 = taskFlowItems.find(({ item }) => item.task_id === 22)
    const task23 = taskFlowItems.find(({ item }) => item.task_id === 23)
    expect(task22).toBeTruthy()
    expect(task23).toBeTruthy()
    expect(task23?.path.some(pathNode => pathNode.type === 'task' && pathNode.task_id === 22)).toBe(true)

    const rootTaskIds = taskFlowItems
      .filter(({ path }) => path.filter(pathNode => pathNode.type === 'task').length === 1)
      .map(({ item }) => item.task_id)
    expect(rootTaskIds).toContain(22)
    expect(rootTaskIds).not.toContain(23)
  })
})
