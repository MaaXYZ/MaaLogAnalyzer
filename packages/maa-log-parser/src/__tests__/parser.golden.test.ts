import { describe, expect, it } from 'vitest'
import type { TaskInfo, UnifiedFlowItem } from '@windsland52/maa-log-parser/types'
import { LogParser } from '@windsland52/maa-log-parser'

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

const findTask = (
  tasks: TaskInfo[],
  taskId: number,
): TaskInfo => {
  const task = tasks.find((item) => item.task_id === taskId)
  expect(task).toBeTruthy()
  return task!
}

describe('LogParser strict public snapshots', () => {
  it('projects non-realtime image links for failed nodes, recognitions, and wait_freezes', async () => {
    const lines = [
      makeEventLine(1, 'Tasker.Task.Starting', { task_id: 81, entry: 'ImageTask', hash: 'h-image', uuid: 'u-image' }),
      makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 81, node_id: 8101, name: 'ImageNode' }),
      makeEventLine(3, 'Node.Recognition.Starting', { task_id: 81, reco_id: 81001, name: 'ImageReco' }),
      makeEventLine(4, 'Node.Recognition.Failed', {
        task_id: 81,
        reco_id: 81001,
        name: 'ImageReco',
        reco_details: { algorithm: 'Match', box: [0, 0, 1, 1], detail: null, name: 'ImageReco', reco_id: 81001 },
      }),
      makeEventLine(5, 'Node.WaitFreezes.Starting', { task_id: 81, wf_id: 81, phase: 'pre', name: 'ImageNode' }),
      makeEventLine(6, 'Node.WaitFreezes.Succeeded', { task_id: 81, wf_id: 81, phase: 'post', elapsed: 12, name: 'ImageNode' }),
      makeEventLine(7, 'Node.PipelineNode.Failed', {
        task_id: 81,
        node_id: 8101,
        name: 'ImageNode',
      }),
      makeEventLine(8, 'Tasker.Task.Failed', { task_id: 81, entry: 'ImageTask', hash: 'h-image', uuid: 'u-image' }),
    ]

    const parser = new LogParser()
    parser.setErrorImages(new Map([
      ['2026.04.07-10.00.00.004_ImageReco', '/fixtures/reco-error.png'],
      ['2026.04.07-10.00.00.007_ImageNode', '/fixtures/node-error.png'],
    ]))
    parser.setVisionImages(new Map([
      ['2026.04.07-10.00.00.004_ImageReco_81001', '/fixtures/reco-vision.png'],
    ]))
    parser.setWaitFreezesImages(new Map([
      ['2026.04.07-10.00.00.006_ImageNode_wait_freezes', '/fixtures/wait-freezes.png'],
    ]))

    await parser.parseFile(lines.join('\n'))

    const mainTask = findTask(parser.getTasksSnapshot(), 81)
    const mainNode = mainTask.nodes[0]
    expect(mainNode?.error_image).toBe('/fixtures/node-error.png')

    const imageRecognition = collectFlowItems(
      mainNode?.node_flow,
      (item) => item.type === 'recognition' && item.reco_id === 81001,
    )[0]?.item
    expect(imageRecognition).toBeTruthy()
    expect(imageRecognition?.vision_image).toBe('/fixtures/reco-vision.png')
    expect(imageRecognition?.error_image).toBe('/fixtures/reco-error.png')

    const imageWaitFreezes = collectFlowItems(
      mainNode?.node_flow,
      (item) => item.type === 'wait_freezes' && item.wait_freezes_details?.wf_id === 81,
    )[0]?.item
    expect(imageWaitFreezes).toBeTruthy()
    expect(imageWaitFreezes?.wait_freezes_details?.images).toEqual(['/fixtures/wait-freezes.png'])
  })

  it('keeps explicit scope structure for recognition, action node, task, and wait_freezes', async () => {
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
      makeEventLine(8, 'Node.WaitFreezes.Starting', { task_id: 72, wf_id: 72, phase: 'pre', name: 'SubNode' }),
      makeEventLine(9, 'Node.WaitFreezes.Succeeded', { task_id: 72, wf_id: 72, phase: 'post', elapsed: 10, name: 'SubNode' }),
      makeEventLine(10, 'Node.Action.Starting', { task_id: 72, action_id: 72001, name: 'SubAction' }),
      makeEventLine(11, 'Node.Action.Succeeded', { task_id: 72, action_id: 72001, name: 'SubAction' }),
      makeEventLine(12, 'Node.ActionNode.Starting', {
        task_id: 72,
        node_id: 7201,
        action_id: 72001,
        name: 'SubNode',
        action_details: makeActionDetails({ actionId: 72001, name: 'SubAction', success: true }),
      }),
      makeEventLine(13, 'Node.ActionNode.Succeeded', {
        task_id: 72,
        node_id: 7201,
        action_id: 72001,
        name: 'SubNode',
        action_details: makeActionDetails({ actionId: 72001, name: 'SubAction', success: true }),
      }),
      makeEventLine(14, 'Node.PipelineNode.Succeeded', {
        task_id: 72,
        node_id: 7201,
        name: 'SubNode',
        action_details: makeActionDetails({ actionId: 72001, name: 'SubAction', success: true }),
      }),
      makeEventLine(15, 'Tasker.Task.Succeeded', { task_id: 72, entry: 'SubTask', hash: 'h-sub-72', uuid: 'u-sub-72' }),
      makeEventLine(16, 'Node.WaitFreezes.Starting', { task_id: 71, wf_id: 71, phase: 'repeat', name: 'MainNode' }),
      makeEventLine(17, 'Node.WaitFreezes.Failed', { task_id: 71, wf_id: 71, phase: 'repeat', elapsed: 33, name: 'MainNode' }),
      makeEventLine(18, 'Node.Action.Starting', { task_id: 71, action_id: 71001, name: 'MainAction' }),
      makeEventLine(19, 'Node.Action.Failed', { task_id: 71, action_id: 71001, name: 'MainAction' }),
      makeEventLine(20, 'Node.ActionNode.Starting', {
        task_id: 71,
        node_id: 7101,
        action_id: 71001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 71001, name: 'MainAction', success: false }),
      }),
      makeEventLine(21, 'Node.ActionNode.Failed', {
        task_id: 71,
        node_id: 7101,
        action_id: 71001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 71001, name: 'MainAction', success: false }),
      }),
      makeEventLine(22, 'Node.PipelineNode.Failed', {
        task_id: 71,
        node_id: 7101,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 71001, name: 'MainAction', success: false }),
      }),
      makeEventLine(23, 'Tasker.Task.Failed', { task_id: 71, entry: 'MainTask', hash: 'h-main-71', uuid: 'u-main-71' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))

    const mainTask = findTask(parser.getTasksSnapshot(), 71)
    const mainNode = mainTask.nodes[0]

    expect(mainNode.next_list).toEqual([
      { name: 'MainCandidate', anchor: false, jump_back: false },
    ])

    const mainRecognition = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'recognition' && item.reco_id === 71001
    )
    expect(mainRecognition).toHaveLength(1)

    const mainWaitFreezes = (mainNode.node_flow ?? []).filter(
      (item) => item.type === 'wait_freezes' && item.task_id === 71
    )
    expect(mainWaitFreezes).toHaveLength(1)

    const subTask = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'task' && item.task_id === 72
    )
    expect(subTask).toHaveLength(1)

    const subActionNode = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'action_node' &&
        item.action_id === 72001 &&
        path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 72)
    )
    expect(subActionNode).toHaveLength(1)

    const subWaitFreezes = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'wait_freezes' &&
        item.task_id === 72 &&
        path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 72)
    )
    expect(subWaitFreezes).toHaveLength(1)
  })

  it('ignores unknown phases while keeping multi-level task nesting', async () => {
    const lines = [
      makeEventLine(101, 'Tasker.Task.Starting', { task_id: 21, entry: 'MainTask', hash: 'h-main-3', uuid: 'u-main-3' }),
      makeEventLine(102, 'Node.PipelineNode.Starting', { task_id: 21, node_id: 2101, name: 'MainNode' }),
      makeEventLine(103, 'Node.NextList.Custom', {
        task_id: 21,
        name: 'MainNode',
        list: [{ name: 'ShouldIgnore', anchor: false, jump_back: false }],
      }),
      makeEventLine(104, 'Tasker.Task.Starting', { task_id: 22, entry: 'SubTaskL1', hash: 'h-sub-l1', uuid: 'u-sub-l1' }),
      makeEventLine(105, 'Node.PipelineNode.Starting', { task_id: 22, node_id: 2201, name: 'SubNodeL1' }),
      makeEventLine(106, 'Tasker.Task.Starting', { task_id: 23, entry: 'SubTaskL2', hash: 'h-sub-l2', uuid: 'u-sub-l2' }),
      makeEventLine(107, 'Node.PipelineNode.Starting', { task_id: 23, node_id: 2301, name: 'SubNodeL2' }),
      makeEventLine(108, 'Node.PipelineNode.Succeeded', { task_id: 23, node_id: 2301, name: 'SubNodeL2' }),
      makeEventLine(109, 'Tasker.Task.Succeeded', { task_id: 23, entry: 'SubTaskL2', hash: 'h-sub-l2', uuid: 'u-sub-l2' }),
      makeEventLine(110, 'Tasker.Task.Custom', { task_id: 22, entry: 'SubTaskL1', hash: 'h-sub-l1', uuid: 'u-sub-l1' }),
      makeEventLine(111, 'Node.PipelineNode.Succeeded', { task_id: 22, node_id: 2201, name: 'SubNodeL1' }),
      makeEventLine(112, 'Tasker.Task.Succeeded', { task_id: 22, entry: 'SubTaskL1', hash: 'h-sub-l1', uuid: 'u-sub-l1' }),
      makeEventLine(113, 'Node.PipelineNode.Succeeded', { task_id: 21, node_id: 2101, name: 'MainNode' }),
      makeEventLine(114, 'Tasker.Task.Succeeded', { task_id: 21, entry: 'MainTask', hash: 'h-main-3', uuid: 'u-main-3' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))

    const mainTask = findTask(parser.getTasksSnapshot(), 21)
    expect(mainTask.nodes[0]?.next_list).toEqual([])

    const nestedTasks = collectFlowItems(
      mainTask.nodes[0]?.node_flow,
      (item) => item.type === 'task'
    )

    const task22 = nestedTasks.find(({ item }) => item.task_id === 22)
    const task23 = nestedTasks.find(({ item }) => item.task_id === 23)
    expect(task22).toBeTruthy()
    expect(task23).toBeTruthy()
    expect(task23?.path.some((pathNode) => pathNode.type === 'task' && pathNode.task_id === 22)).toBe(true)
  })
})
