import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { TaskInfo, UnifiedFlowItem } from '@windsland52/maa-log-parser/types'
import { LogParser } from '@windsland52/maa-log-parser'

const formatTimestamp = (
  eventIndex: number,
  baseDate = '2026-04-06',
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
  baseDate = '2026-04-06',
  source?: {
    processId?: string
    threadId?: string
  },
): string => {
  const processId = source?.processId ?? 'Px1'
  const threadId = source?.threadId ?? 'Tx1'
  return `[${formatTimestamp(eventIndex, baseDate)}][INF][${processId}][${threadId}][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
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

const findTask = (
  tasks: TaskInfo[],
  taskId: number,
): TaskInfo => {
  const task = tasks.find((item) => item.task_id === taskId)
  expect(task).toBeTruthy()
  return task!
}

describe('Strict task projector semantics', () => {
  it('does not synthesize fallback action from pipeline terminal action_details', async () => {
    const lines = [
      makeEventLine(1, 'Tasker.Task.Starting', { task_id: 81, entry: 'MainTask', hash: 'h-81', uuid: 'u-81' }, '2026-04-11'),
      makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 81, node_id: 8101, name: 'MainNode' }, '2026-04-11'),
      makeEventLine(3, 'Node.PipelineNode.Failed', {
        task_id: 81,
        node_id: 8101,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 9001, name: 'FallbackAction', success: false }),
      }, '2026-04-11'),
      makeEventLine(4, 'Tasker.Task.Failed', { task_id: 81, entry: 'MainTask', hash: 'h-81', uuid: 'u-81' }, '2026-04-11'),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))

    const task = findTask(parser.getTasksSnapshot(), 81)
    expect(task.nodes[0]?.node_flow ?? []).toEqual([])
  })

  it('does not synthesize fallback action when pipeline terminal action_details is absent', async () => {
    const lines = [
      makeEventLine(11, 'Tasker.Task.Starting', { task_id: 82, entry: 'MainTask', hash: 'h-82', uuid: 'u-82' }, '2026-04-11'),
      makeEventLine(12, 'Node.PipelineNode.Starting', { task_id: 82, node_id: 8201, name: 'MainNode' }, '2026-04-11'),
      makeEventLine(13, 'Node.PipelineNode.Failed', {
        task_id: 82,
        node_id: 8201,
        name: 'MainNode',
      }, '2026-04-11'),
      makeEventLine(14, 'Tasker.Task.Failed', { task_id: 82, entry: 'MainTask', hash: 'h-82', uuid: 'u-82' }, '2026-04-11'),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))

    const task = findTask(parser.getTasksSnapshot(), 82)
    expect(task.nodes[0]?.node_flow ?? []).toEqual([])
  })

  it('keeps main wait_freezes as a top-level sibling instead of nesting it into subtask flow', async () => {
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

    const mainTask = findTask(parser.getTasksSnapshot(), 1)
    const mainNode = mainTask.nodes[0]

    const topLevelMainWaitFreezes = (mainNode.node_flow ?? []).filter((item) =>
      item.type === 'wait_freezes' && item.task_id === 1,
    )
    expect(topLevelMainWaitFreezes).toHaveLength(1)

    const nestedMainWaitFreezes = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'wait_freezes'
        && item.task_id === 1
        && path.length > 1,
    )
    expect(nestedMainWaitFreezes).toHaveLength(0)
  })

  it('preserves actual child task completion status during running parent action preview', () => {
    const lines = [
      makeEventLine(121, 'Tasker.Task.Starting', { task_id: 1, entry: 'MainTask', hash: 'h-main-rt', uuid: 'u-main-rt' }),
      makeEventLine(122, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: 'MainNode' }),
      makeEventLine(123, 'Node.Action.Starting', { task_id: 1, action_id: 1001, name: 'MainAction' }),
      makeEventLine(124, 'Node.ActionNode.Starting', {
        task_id: 1,
        node_id: 101,
        action_id: 1001,
        name: 'MainNode',
        action_details: makeActionDetails({ actionId: 1001, name: 'MainAction', success: true }),
      }),
      makeEventLine(125, 'Tasker.Task.Starting', { task_id: 2, entry: 'SubTask', hash: 'h-sub-rt', uuid: 'u-sub-rt' }),
      makeEventLine(126, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: 'SubNode' }),
      makeEventLine(127, 'Node.PipelineNode.Succeeded', { task_id: 2, node_id: 201, name: 'SubNode' }),
      makeEventLine(128, 'Tasker.Task.Succeeded', { task_id: 2, entry: 'SubTask', hash: 'h-sub-rt', uuid: 'u-sub-rt' }),
    ]

    const parser = new LogParser()
    for (const line of lines) {
      parser.appendRealtimeLines([line])
    }

    const mainTask = findTask(parser.getTasksSnapshot(), 1)
    const mainNode = mainTask.nodes[0]

    const strictChildTask = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'task' && item.task_id === 2,
    )
    expect(strictChildTask).toHaveLength(1)
    expect(strictChildTask[0]?.item.status).toBe('success')
    expect(strictChildTask[0]?.item.task_details?.status).toBe('succeeded')

    const explicitActionNode = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'action_node' && item.action_id === 1001,
    )
    expect(explicitActionNode).toHaveLength(1)
  })

  it('does not synthesize running action placeholder before explicit action scope exists', () => {
    const parser = new LogParser()
    const lines = [
      makeEventLine(100, 'Tasker.Task.Starting', { task_id: 200000021, entry: 'test', hash: 'h-main', uuid: 'u-main' }),
      makeEventLine(101, 'Node.PipelineNode.Starting', { task_id: 200000021, node_id: 300000021, name: 'test' }),
      makeEventLine(102, 'Node.Recognition.Starting', { task_id: 200000021, reco_id: 400000021, name: 'test' }),
      makeEventLine(103, 'Tasker.Task.Starting', { task_id: 200000022, entry: 'Stop', hash: 'h-sub-a', uuid: 'u-sub-a' }),
      makeEventLine(104, 'Node.PipelineNode.Starting', { task_id: 200000022, node_id: 300000022, name: 'Stop' }),
      makeEventLine(105, 'Node.Recognition.Starting', { task_id: 200000022, reco_id: 400000022, name: 'Stop' }),
      makeEventLine(106, 'Node.Recognition.Succeeded', { task_id: 200000022, reco_id: 400000022, name: 'Stop' }),
      makeEventLine(107, 'Node.Action.Starting', { task_id: 200000022, action_id: 500000021, name: 'Stop' }),
      makeEventLine(108, 'Node.Action.Succeeded', {
        task_id: 200000022,
        action_id: 500000021,
        name: 'Stop',
        action_details: makeActionDetails({ actionId: 500000021, name: 'Stop', success: true, action: 'DoNothing' }),
      }),
      makeEventLine(109, 'Node.PipelineNode.Succeeded', {
        task_id: 200000022,
        node_id: 300000022,
        name: 'Stop',
        reco_details: { algorithm: 'DirectHit', box: [0, 0, 1280, 720], detail: null, name: 'Stop', reco_id: 400000022 },
        action_details: makeActionDetails({ actionId: 500000021, name: 'Stop', success: true, action: 'DoNothing' }),
      }),
      makeEventLine(110, 'Tasker.Task.Succeeded', { task_id: 200000022, entry: 'Stop', hash: 'h-sub-a', uuid: 'u-sub-a' }),
    ]

    for (const line of lines) {
      parser.appendRealtimeLines([line])
    }

    const mainTask = findTask(parser.getTasksSnapshot(), 200000021)
    const mainNode = mainTask.nodes[0]
    const topLevelActionItems = (mainNode.node_flow ?? []).filter((item) => item.type === 'action')
    expect(topLevelActionItems).toHaveLength(0)

    const nestedTaskUnderRecognition = collectFlowItems(
      mainNode.node_flow,
      (item, path) =>
        item.type === 'task'
        && item.task_id === 200000022
        && path.some((pathNode) => pathNode.type === 'recognition'),
    )
    expect(nestedTaskUnderRecognition).toHaveLength(1)
  })

  it('projects taskless context child scopes under recognition and action windows', async () => {
    const lines = [
      makeEventLine(1, 'Tasker.Task.Starting', { task_id: 1, entry: 'MainTask', hash: 'h-main', uuid: 'u-main' }),
      makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: 'MainNode' }),
      makeEventLine(3, 'Node.NextList.Starting', {
        task_id: 1,
        name: 'MainNode',
        list: [{ name: 'CCBuyCard', anchor: false, jump_back: false }],
      }),
      makeEventLine(4, 'Node.Recognition.Starting', { task_id: 1, reco_id: 501, name: 'CCBuyCard' }),
      makeEventLine(5, 'Node.RecognitionNode.Starting', { task_id: 2, node_id: 201, name: 'CCBuyCardAwardEmptyRec' }),
      makeEventLine(6, 'Node.Recognition.Starting', { task_id: 2, reco_id: 601, name: 'CCBuyCardAwardEmptyRec' }),
      makeEventLine(7, 'Node.RecognitionNode.Starting', { task_id: 3, node_id: 301, name: 'CCBuyCardAwardEmptyRec_Template' }),
      makeEventLine(8, 'Node.Recognition.Starting', { task_id: 3, reco_id: 701, name: 'CCBuyCardAwardEmptyRec_Template' }),
      makeEventLine(9, 'Node.Recognition.Succeeded', {
        task_id: 3,
        reco_id: 701,
        name: 'CCBuyCardAwardEmptyRec_Template',
        reco_details: { algorithm: 'TemplateMatch', box: [1, 2, 3, 4], detail: {}, name: 'CCBuyCardAwardEmptyRec_Template', reco_id: 701 },
      }),
      makeEventLine(10, 'Node.RecognitionNode.Succeeded', {
        task_id: 3,
        node_id: 301,
        name: 'CCBuyCardAwardEmptyRec_Template',
        reco_details: { algorithm: 'TemplateMatch', box: [1, 2, 3, 4], detail: {}, name: 'CCBuyCardAwardEmptyRec_Template', reco_id: 701 },
      }),
      makeEventLine(11, 'Node.Recognition.Succeeded', {
        task_id: 2,
        reco_id: 601,
        name: 'CCBuyCardAwardEmptyRec',
        reco_details: { algorithm: 'Custom', box: [5, 6, 7, 8], detail: {}, name: 'CCBuyCardAwardEmptyRec', reco_id: 601 },
      }),
      makeEventLine(12, 'Node.RecognitionNode.Succeeded', {
        task_id: 2,
        node_id: 201,
        name: 'CCBuyCardAwardEmptyRec',
        reco_details: { algorithm: 'Custom', box: [5, 6, 7, 8], detail: {}, name: 'CCBuyCardAwardEmptyRec', reco_id: 601 },
      }),
      makeEventLine(13, 'Node.Recognition.Succeeded', {
        task_id: 1,
        reco_id: 501,
        name: 'CCBuyCard',
        reco_details: { algorithm: 'Custom', box: [9, 10, 11, 12], detail: {}, name: 'CCBuyCard', reco_id: 501 },
      }),
      makeEventLine(14, 'Node.NextList.Succeeded', {
        task_id: 1,
        name: 'MainNode',
        list: [{ name: 'CCBuyCard', anchor: false, jump_back: false }],
      }),
      makeEventLine(15, 'Node.Action.Starting', { task_id: 1, action_id: 801, name: 'CCBuyCard' }),
      makeEventLine(16, 'Node.PipelineNode.Starting', { task_id: 10, node_id: 1001, name: 'CCUpdate' }),
      makeEventLine(17, 'Node.NextList.Starting', {
        task_id: 10,
        name: 'CCUpdate',
        list: [{ name: 'CCUpdate', anchor: false, jump_back: false }],
      }),
      makeEventLine(18, 'Node.Recognition.Starting', { task_id: 10, reco_id: 1101, name: 'CCUpdate' }),
      makeEventLine(19, 'Node.Recognition.Succeeded', {
        task_id: 10,
        reco_id: 1101,
        name: 'CCUpdate',
        reco_details: { algorithm: 'DirectHit', box: [0, 0, 0, 0], detail: null, name: 'CCUpdate', reco_id: 1101 },
      }),
      makeEventLine(20, 'Node.NextList.Succeeded', {
        task_id: 10,
        name: 'CCUpdate',
        list: [{ name: 'CCUpdate', anchor: false, jump_back: false }],
      }),
      makeEventLine(21, 'Node.Action.Starting', { task_id: 10, action_id: 1201, name: 'CCUpdate' }),
      makeEventLine(22, 'Node.Action.Succeeded', {
        task_id: 10,
        action_id: 1201,
        name: 'CCUpdate',
        action_details: makeActionDetails({ actionId: 1201, name: 'CCUpdate', success: true, action: 'Swipe' }),
      }),
      makeEventLine(23, 'Node.PipelineNode.Failed', {
        task_id: 10,
        node_id: 1001,
        name: 'CCUpdate',
        reco_details: { algorithm: 'DirectHit', box: [0, 0, 0, 0], detail: null, name: 'CCUpdate', reco_id: 1101 },
        action_details: makeActionDetails({ actionId: 1201, name: 'CCUpdate', success: true, action: 'Swipe' }),
      }),
      makeEventLine(24, 'Node.Action.Succeeded', {
        task_id: 1,
        action_id: 801,
        name: 'CCBuyCard',
        action_details: makeActionDetails({ actionId: 801, name: 'CCBuyCard', success: true, action: 'Custom' }),
      }),
      makeEventLine(25, 'Node.PipelineNode.Succeeded', {
        task_id: 1,
        node_id: 101,
        name: 'MainNode',
        reco_details: { algorithm: 'Custom', box: [9, 10, 11, 12], detail: {}, name: 'CCBuyCard', reco_id: 501 },
        action_details: makeActionDetails({ actionId: 801, name: 'CCBuyCard', success: true, action: 'Custom' }),
      }),
      makeEventLine(26, 'Tasker.Task.Succeeded', { task_id: 1, entry: 'MainTask', hash: 'h-main', uuid: 'u-main' }),
    ]

    const parser = new LogParser()
    await parser.parseFile(lines.join('\n'))

    const mainTask = findTask(parser.getTasksSnapshot(), 1)
    const mainNode = mainTask.nodes[0]

    const mainRecognition = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'recognition' && item.reco_id === 501,
    )[0]?.item
    expect(mainRecognition).toBeTruthy()
    expect(mainRecognition?.children?.map((item) => item.type)).toEqual(['recognition_node'])

    const nestedRecognitionNode = mainRecognition?.children?.[0]
    expect(nestedRecognitionNode?.task_id).toBe(2)
    expect(nestedRecognitionNode?.children?.map((item) => item.type)).toEqual(['recognition'])
    expect(nestedRecognitionNode?.children?.[0]?.children?.map((item) => item.type)).toEqual(['recognition_node'])

    const actionRoot = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'action' && item.action_id === 801,
    )[0]?.item
    expect(actionRoot).toBeTruthy()

    const nestedTask = collectFlowItems(
      actionRoot?.children,
      (item) => item.type === 'task' && item.task_id === 10,
    )[0]?.item
    expect(nestedTask).toBeTruthy()
    expect(nestedTask?.status).toBe('failed')
    expect(nestedTask?.children?.map((item) => item.type)).toEqual(['pipeline_node'])
  })

  it('keeps CCBuyCard nested recognition/action structure from the CCFlagInCombatMain fixture', async () => {
    const parser = new LogParser()
    const fixture = readFileSync(
      new URL('./fixtures/cc-flag-in-combat-main.log', import.meta.url),
      'utf8',
    )

    await parser.parseFile(fixture)

    const mainTask = findTask(parser.getTasksSnapshot(), 200000001)
    const mainNode = mainTask.nodes.find((node) => node.node_id === 300001880)
    expect(mainNode).toBeTruthy()

    const mainRecognition = collectFlowItems(
      mainNode?.node_flow,
      (item) => item.type === 'recognition' && item.reco_id === 400003684,
    )[0]?.item
    expect(mainRecognition).toBeTruthy()
    expect(mainRecognition?.children?.map((item) => item.type)).toEqual(['recognition_node'])
    expect(mainRecognition?.children?.[0]?.task_id).toBe(200001552)
    expect(mainRecognition?.children?.[0]?.children?.[0]?.type).toBe('recognition')
    expect(
      mainRecognition?.children?.[0]?.children?.[0]?.children?.map((item) => item.type),
    ).toEqual(['recognition_node'])
    expect(
      mainRecognition?.children?.[0]?.children?.[0]?.children?.[0]?.task_id,
    ).toBe(200001554)

    const actionRoot = collectFlowItems(
      mainNode?.node_flow,
      (item) => item.type === 'action' && item.action_id === 500000368,
    )[0]?.item
    expect(actionRoot).toBeTruthy()

    const nestedTask = collectFlowItems(
      actionRoot?.children,
      (item) => item.type === 'task' && item.task_id === 200001564,
    )[0]?.item
    expect(nestedTask).toBeTruthy()
    expect(nestedTask?.status).toBe('failed')
    expect(nestedTask?.children?.map((item) => item.type)).toEqual(['pipeline_node'])
  })

  it('deduplicates mirrored cross-source recognition starts before they can capture later flow', async () => {
    const parser = new LogParser()
    const lines = [
      makeEventLine(100, 'Tasker.Task.Starting', { task_id: 401, entry: 'StartUp', hash: 'h-main', uuid: 'u-main' }, '2026-04-12'),
      makeEventLine(101, 'Node.PipelineNode.Starting', { task_id: 401, node_id: 4101, name: 'StartUp' }, '2026-04-12'),
      makeEventLine(102, 'Node.NextList.Starting', {
        task_id: 401,
        name: 'StartUp',
        list: [{ name: 'StartUp', anchor: false, jump_back: false }],
      }, '2026-04-12'),
      makeEventLine(103, 'Node.Recognition.Starting', { task_id: 401, reco_id: 5101, name: 'StartUp' }, '2026-04-12', {
        processId: 'Px1',
        threadId: 'Tx1',
      }),
      makeEventLine(115, 'Node.Recognition.Starting', { task_id: 401, reco_id: 5101, name: 'StartUp' }, '2026-04-12', {
        processId: 'Px2',
        threadId: 'Tx2',
      }),
      makeEventLine(116, 'Node.Recognition.Succeeded', {
        task_id: 401,
        reco_id: 5101,
        name: 'StartUp',
        reco_details: { algorithm: 'DirectHit', box: [0, 0, 0, 0], detail: null, name: 'StartUp', reco_id: 5101 },
      }, '2026-04-12', {
        processId: 'Px1',
        threadId: 'Tx1',
      }),
      makeEventLine(117, 'Node.NextList.Succeeded', {
        task_id: 401,
        name: 'StartUp',
        list: [{ name: 'StartUp', anchor: false, jump_back: false }],
      }, '2026-04-12'),
      makeEventLine(118, 'Node.Action.Starting', { task_id: 401, action_id: 6101, name: 'StartUp' }, '2026-04-12'),
      makeEventLine(119, 'Node.Action.Succeeded', {
        task_id: 401,
        action_id: 6101,
        name: 'StartUp',
        action_details: makeActionDetails({ actionId: 6101, name: 'StartUp', success: true, action: 'DoNothing' }),
      }, '2026-04-12'),
      makeEventLine(120, 'Node.PipelineNode.Succeeded', { task_id: 401, node_id: 4101, name: 'StartUp' }, '2026-04-12'),
      makeEventLine(121, 'Tasker.Task.Succeeded', { task_id: 401, entry: 'StartUp', hash: 'h-main', uuid: 'u-main' }, '2026-04-12'),
    ]

    await parser.parseFile(lines.join('\n'))

    const mainTask = findTask(parser.getTasksSnapshot(), 401)
    const mainNode = mainTask.nodes[0]

    const startUpRecognitions = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'recognition' && item.reco_id === 5101,
    )
    expect(startUpRecognitions).toHaveLength(1)
    expect(startUpRecognitions[0]?.item.status).toBe('success')

    const startUpAction = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'action' && item.action_id === 6101,
    )
    expect(startUpAction).toHaveLength(1)
    expect(startUpAction[0]?.path.some((pathNode) =>
      pathNode.type === 'recognition' && pathNode.reco_id === 5101,
    )).toBe(false)
  })

  it('does not keep a duplicate recognition start running after parser dedup keeps only one terminal', async () => {
    const parser = new LogParser()
    const lines = [
      makeEventLine(100, 'Tasker.Task.Starting', { task_id: 301, entry: 'StartUp', hash: 'h-main', uuid: 'u-main' }),
      makeEventLine(101, 'Node.PipelineNode.Starting', { task_id: 301, node_id: 3101, name: 'StartUp' }),
      makeEventLine(102, 'Node.NextList.Starting', {
        task_id: 301,
        name: 'StartUp',
        list: [{ name: 'StartUp', anchor: false, jump_back: false }],
      }),
      makeEventLine(103, 'Node.Recognition.Starting', { task_id: 301, reco_id: 4101, name: 'StartUp' }, '2026-04-06', {
        processId: 'Px1',
        threadId: 'Tx1',
      }),
      makeEventLine(115, 'Node.Recognition.Starting', { task_id: 301, reco_id: 4101, name: 'StartUp' }, '2026-04-06', {
        processId: 'Px2',
        threadId: 'Tx2',
      }),
      makeEventLine(120, 'Node.Recognition.Succeeded', {
        task_id: 301,
        reco_id: 4101,
        name: 'StartUp',
        reco_details: { algorithm: 'DirectHit', box: [0, 0, 0, 0], detail: null, name: 'StartUp', reco_id: 4101 },
      }, '2026-04-06', {
        processId: 'Px1',
        threadId: 'Tx1',
      }),
      makeEventLine(123, 'Node.Recognition.Succeeded', {
        task_id: 301,
        reco_id: 4101,
        name: 'StartUp',
        reco_details: { algorithm: 'DirectHit', box: [0, 0, 0, 0], detail: null, name: 'StartUp', reco_id: 4101 },
      }, '2026-04-06', {
        processId: 'Px2',
        threadId: 'Tx2',
      }),
      makeEventLine(124, 'Node.NextList.Succeeded', {
        task_id: 301,
        name: 'StartUp',
        list: [{ name: 'StartUp', anchor: false, jump_back: false }],
      }),
      makeEventLine(125, 'Node.Action.Starting', { task_id: 301, action_id: 5101, name: 'StartUp' }),
      makeEventLine(126, 'Tasker.Task.Starting', { task_id: 302, entry: 'ChildTask', hash: 'h-child', uuid: 'u-child' }),
      makeEventLine(127, 'Node.PipelineNode.Starting', { task_id: 302, node_id: 3201, name: 'ChildNode' }),
      makeEventLine(128, 'Node.PipelineNode.Succeeded', { task_id: 302, node_id: 3201, name: 'ChildNode' }),
      makeEventLine(129, 'Tasker.Task.Succeeded', { task_id: 302, entry: 'ChildTask', hash: 'h-child', uuid: 'u-child' }),
      makeEventLine(130, 'Node.Action.Succeeded', {
        task_id: 301,
        action_id: 5101,
        name: 'StartUp',
        action_details: makeActionDetails({ actionId: 5101, name: 'StartUp', success: true, action: 'DoNothing' }),
      }),
      makeEventLine(131, 'Node.PipelineNode.Succeeded', { task_id: 301, node_id: 3101, name: 'StartUp' }),
      makeEventLine(132, 'Tasker.Task.Succeeded', { task_id: 301, entry: 'StartUp', hash: 'h-main', uuid: 'u-main' }),
    ]

    await parser.parseFile(lines.join('\n'))

    const mainTask = findTask(parser.getTasksSnapshot(), 301)
    const mainNode = mainTask.nodes[0]

    const runningStartUpRecognitions = collectFlowItems(
      mainNode.node_flow,
      (item) =>
        item.type === 'recognition'
        && item.reco_id === 4101
        && item.status === 'running',
    )
    expect(runningStartUpRecognitions).toHaveLength(0)

    const childTaskItems = collectFlowItems(
      mainNode.node_flow,
      (item) => item.type === 'task' && item.task_id === 302,
    )
    expect(childTaskItems).toHaveLength(1)
    expect(childTaskItems[0]?.path.some((pathNode) =>
      pathNode.type === 'recognition' && pathNode.reco_id === 4101,
    )).toBe(false)
    expect(childTaskItems[0]?.path.some((pathNode) =>
      pathNode.type === 'action' && pathNode.action_id === 5101,
    )).toBe(true)
  })
})
