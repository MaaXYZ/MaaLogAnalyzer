import type { EventNotification, NodeInfo, TaskInfo, UnifiedFlowItem } from '../types'
import { getKnowledgeCard, maaKnowledgePack, searchKnowledge } from './knowledge'
import {
  buildNodeActionFlowItems,
  buildNodeActionLevelRecognitionItems,
  buildNodeFlowItems,
  buildNodeRecognitionAttempts,
} from '../utils/nodeFlow'
import { getFlowItemShortLabel } from '../utils/flowLabels'

export interface AiLoadedTarget {
  id: string
  label: string
  fileName: string
  content: string
}

export interface BuildAiContextInput {
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  selectedNode?: NodeInfo | null
  selectedFlowItemId?: string | null
  question: string
  loadedTargets?: AiLoadedTarget[]
  loadedDefaultTargetId?: string
  includeKnowledgePack: boolean
  includeKnowledgeBootstrap?: boolean
  includeSignalLines: boolean
}

interface SignalLineItem {
  line: number
  text: string
}

interface TimelineRecoItem {
  reco_id: number
  name: string
  status: 'success' | 'failed' | 'running'
}

interface TimelineNextItem {
  name: string
  anchor: boolean
  jump_back: boolean
}

interface TimelineNodeItem {
  node_id: number
  name: string
  status: 'success' | 'failed' | 'running'
  ts: string
  action: string
  actionName: string
  nestedActionGroupCount: number
  nestedActionNodeCount: number
  nestedActionFailedNodeCount: number
  nestedRecognitionInActionCount: number
  nestedActionTopNames: Array<{ name: string; count: number }>
  nestedRecognitionTopNames: Array<{ name: string; count: number }>
  recognition: TimelineRecoItem[]
  next_list: TimelineNextItem[]
}

const truncate = (value: string, max = 260): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

const toTopNameCounts = (names: string[], limit = 3): Array<{ name: string; count: number }> => {
  const map = new Map<string, number>()
  for (const name of names) {
    if (!name) continue
    map.set(name, (map.get(name) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}

const pickBestTarget = (targets: AiLoadedTarget[], preferredId = ''): AiLoadedTarget | null => {
  if (targets.length === 0) return null
  if (preferredId) {
    const preferred = targets.find(item => item.id === preferredId)
    if (preferred) return preferred
  }

  const order = ['maafw.log', 'maa.log', 'maafw.bak.log', 'maa.bak.log']
  for (const key of order) {
    const found = targets.find(item => item.fileName.toLowerCase().endsWith(key) || item.label.toLowerCase().endsWith(key))
    if (found) return found
  }

  return targets[0]
}

const pickDetailsSubset = (details: Record<string, unknown>): Record<string, unknown> => {
  const keys = ['name', 'task_id', 'node_id', 'reco_id', 'action_id', 'entry', 'status', 'error', 'reason', 'uuid', 'hash', 'list', 'focus']
  const next: Record<string, unknown> = {}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(details, key)) {
      next[key] = details[key]
    }
  }
  return next
}

const summarizeEvent = (event: EventNotification) => ({
  time: event.timestamp,
  msg: event.message,
  details: pickDetailsSubset(event.details),
})

const findFlowItemPath = (
  items: UnifiedFlowItem[] | undefined,
  targetId: string,
  path: UnifiedFlowItem[] = []
): UnifiedFlowItem[] | null => {
  if (!items || items.length === 0) return null
  for (const item of items) {
    const nextPath = [...path, item]
    if (item.id === targetId) return nextPath
    const nested = findFlowItemPath(item.children, targetId, nextPath)
    if (nested) return nested
  }
  return null
}

const toFlowItemPromptLabel = (item: Pick<UnifiedFlowItem, 'type' | 'name'>): string => {
  const shortType = getFlowItemShortLabel(item.type)
  const name = item.name?.trim() ?? ''
  return name ? `[${shortType}] ${name}` : `[${shortType}]`
}

const FLOW_LABEL_LEGEND = {
  R: 'recognition',
  RN: 'recognition_node',
  A: 'action',
  AN: 'action_node',
  T: 'task',
  P: 'pipeline_node',
} as const

const ALWAYS_INCLUDE_KNOWLEDGE_CARD_IDS = ['ui.flow-item-short-labels'] as const

const collectFlowItems = (
  items: UnifiedFlowItem[] | undefined,
  predicate: (item: UnifiedFlowItem) => boolean,
  output: UnifiedFlowItem[] = []
): UnifiedFlowItem[] => {
  if (!items || items.length === 0) return output
  for (const item of items) {
    if (predicate(item)) output.push(item)
    if (item.children && item.children.length > 0) {
      collectFlowItems(item.children, predicate, output)
    }
  }
  return output
}

interface NodeActionFlowView {
  roots: UnifiedFlowItem[]
  actionLevelRecognitionItems: UnifiedFlowItem[]
  taskItems: UnifiedFlowItem[]
  nestedPipelineItems: UnifiedFlowItem[]
  nestedRecognitionItems: UnifiedFlowItem[]
}

const buildNodeActionFlowView = (node: NodeInfo): NodeActionFlowView => {
  const roots = buildNodeFlowItems(node)
  const actionLevelRecognitionItems = buildNodeActionLevelRecognitionItems(node)
  const taskItems = buildNodeActionFlowItems(node).filter(item => item.type === 'task')
  const nestedPipelineItems = taskItems.flatMap(task =>
    (task.children ?? []).filter(item => item.type === 'pipeline_node')
  )
  const nestedRecognitionItems = nestedPipelineItems.flatMap(item =>
    collectFlowItems(
      item.children,
      child => child.type === 'recognition' || child.type === 'recognition_node'
    )
  )
  return {
    roots,
    actionLevelRecognitionItems,
    taskItems,
    nestedPipelineItems,
    nestedRecognitionItems,
  }
}

const buildSelectedNodeFocus = (
  selectedNode: NodeInfo | null | undefined,
  selectedFlowItemId: string | null | undefined
): Record<string, unknown> | null => {
  if (!selectedNode) return null

  const actionFlowView = buildNodeActionFlowView(selectedNode)
  const nestedActions = actionFlowView.nestedPipelineItems
  const actionLevelReco = actionFlowView.actionLevelRecognitionItems
  const directReco = buildNodeRecognitionAttempts(selectedNode)
  const allNestedRecoNames = [
    ...actionLevelReco.map(item => item.name),
    ...actionFlowView.nestedRecognitionItems.map(item => item.name),
  ].filter(Boolean)
  const allDirectRecoNames = directReco.map(item => item.name).filter(Boolean)
  const selectedPath = selectedFlowItemId
    ? findFlowItemPath(actionFlowView.roots, selectedFlowItemId)
    : null
  const selectedFlowItem = selectedPath?.[selectedPath.length - 1] ?? null

  return {
    relationRule: '识别/动作/任务归属以解析顺序构建；时间戳主要用于展示排序，不用于推断父子归属。',
    node: {
      node_id: selectedNode.node_id,
      name: selectedNode.name,
      status: selectedNode.status,
      ts: selectedNode.ts,
      end_ts: selectedNode.end_ts ?? null,
      action: selectedNode.action_details?.action ?? '',
      actionName: selectedNode.action_details?.name ?? '',
      recognitionCount: directReco.length,
      actionLevelRecognitionCount: actionLevelReco.length,
      nestedActionGroupCount: actionFlowView.taskItems.length,
      nestedActionNodeCount: nestedActions.length,
      nestedActionFailedNodeCount: nestedActions.filter(item => item.status === 'failed').length,
      nextListCount: selectedNode.next_list.length,
      nextListPreview: selectedNode.next_list.slice(0, 8).map(item => ({
        name: item.name,
        anchor: item.anchor,
        jump_back: item.jump_back,
      })),
      topRecognitionNames: toTopNameCounts(allDirectRecoNames, 6),
      topNestedRecognitionNames: toTopNameCounts(allNestedRecoNames, 6),
      topNestedActionNames: toTopNameCounts(nestedActions.map(item => item.name).filter(Boolean) as string[], 6),
    },
    selectedFlowItem: selectedFlowItem
      ? {
          id: selectedFlowItem.id,
          type: selectedFlowItem.type,
          short_type: getFlowItemShortLabel(selectedFlowItem.type),
          name: selectedFlowItem.name,
          display_name: toFlowItemPromptLabel(selectedFlowItem),
          status: selectedFlowItem.status,
          ts: selectedFlowItem.ts,
          end_ts: selectedFlowItem.end_ts ?? null,
          task_id: selectedFlowItem.task_id ?? null,
          node_id: selectedFlowItem.node_id ?? null,
          reco_id: selectedFlowItem.reco_id ?? selectedFlowItem.reco_details?.reco_id ?? null,
          action_id: selectedFlowItem.action_id ?? selectedFlowItem.action_details?.action_id ?? null,
          childCount: selectedFlowItem.children?.length ?? 0,
          ancestry_path: (selectedPath ?? []).map(item => toFlowItemPromptLabel(item)).join(' > '),
          ancestry: (selectedPath ?? []).slice(0, -1).map(item => ({
            id: item.id,
            type: item.type,
            short_type: getFlowItemShortLabel(item.type),
            name: item.name,
            display_name: toFlowItemPromptLabel(item),
          })),
        }
      : null,
  }
}

type EventChainRiskLevel = 'high' | 'medium' | 'low'
type OnErrorTriggerType = 'action_failed' | 'reco_timeout_or_nohit' | 'error_handling_loop'
type StopConfidenceLevel = 'high' | 'medium' | 'low'
type NextCandidateFailureClass = 'likely_no_executable_candidate' | 'likely_timeout_or_nohit' | 'recovered_or_succeeded'
type AnchorResolutionClass = 'unresolved_anchor_candidate_likely' | 'failed_after_anchor_resolution' | 'recovered_or_succeeded'
type JumpBackFlowClass = 'not_hit' | 'hit_then_returned' | 'hit_then_failed_no_return' | 'hit_no_return_observed'

interface EventChainStep {
  index: number
  line: number | null
  time: string
  msg: string
  name: string
}

const toEventChainStep = (event: EventNotification, index: number): EventChainStep => ({
  index,
  line: typeof event._lineNumber === 'number' ? event._lineNumber : null,
  time: event.timestamp,
  msg: event.message,
  name: typeof event.details?.name === 'string' ? event.details.name : '',
})

const toEventName = (event: EventNotification | null): string => (event ? event.message : 'unknown')

const toEventNodeName = (event: EventNotification | null): string => {
  if (!event) return ''
  return typeof event.details?.name === 'string' ? event.details.name : ''
}

const rankRiskLevel = (risk: EventChainRiskLevel): number => {
  if (risk === 'high') return 3
  if (risk === 'medium') return 2
  return 1
}

export const buildEventChainDiagnostics = (events: EventNotification[]) => {
  const messageCounts = {
    nextListStarting: 0,
    nextListFailed: 0,
    nextListSucceeded: 0,
    recognitionFailed: 0,
    recognitionSucceeded: 0,
    actionFailed: 0,
    pipelineFailed: 0,
    pipelineSucceeded: 0,
    taskFailed: 0,
  }

  const nextRecognitionChains: Array<{
    startNode: string
    nextCandidates: Array<{ name: string; jump_back: boolean; anchor: boolean }>
    hasJumpBackCandidate: boolean
    recognitionFailed: number
    recognitionSucceeded: number
    outcomeEvent: string
    outcomeNode: string
    riskLevel: EventChainRiskLevel
    summary: string
    steps: EventChainStep[]
  }> = []

  const actionFailureChains: Array<{
    actionNode: string
    actionId: number | null
    hasPipelineFailed: boolean
    hasTaskFailed: boolean
    riskLevel: EventChainRiskLevel
    summary: string
    steps: EventChainStep[]
  }> = []

  const onErrorChains: Array<{
    triggerType: OnErrorTriggerType
    triggerEvent: string
    triggerNode: string
    triggerActionId: number | null
    triggerLine: number | null
    timeoutLikeFailureCount: number
    fallbackFirstNode: string
    fallbackListPreview: string[]
    hasRecovered: boolean
    hasTaskFailed: boolean
    outcomeEvent: string
    riskLevel: EventChainRiskLevel
    summary: string
    steps: EventChainStep[]
  }> = []

  const onErrorChainKeys = new Set<string>()

  const extractListNames = (event: EventNotification | null): string[] => {
    if (!event) return []
    const list = Array.isArray(event.details?.list) ? event.details.list : []
    return list
      .map((item: any) => (typeof item?.name === 'string' ? item.name : ''))
      .filter(Boolean)
  }

  const dedupeSteps = (steps: EventChainStep[], limit = 8): EventChainStep[] => {
    const out: EventChainStep[] = []
    const seen = new Set<number>()
    for (const step of steps) {
      if (seen.has(step.index)) continue
      seen.add(step.index)
      out.push(step)
      if (out.length >= limit) break
    }
    return out
  }

  const buildOnErrorFollowUp = (startIndex: number, seedSteps: EventChainStep[]) => {
    const steps = [...seedSteps]
    let fallbackFirstNode = ''
    let fallbackListPreview: string[] = []
    let hasRecovered = false
    let hasTaskFailed = false
    let outcomeEvent = 'unknown'

    for (let j = startIndex + 1; j < events.length && j <= startIndex + 96; j += 1) {
      const lookahead = events[j]

      if (lookahead.message === 'Node.NextList.Starting' && !fallbackFirstNode) {
        const names = extractListNames(lookahead)
        fallbackListPreview = names.slice(0, 5)
        fallbackFirstNode = fallbackListPreview[0] ?? ''
        if (steps.length < 10) steps.push(toEventChainStep(lookahead, j))
        continue
      }

      if (lookahead.message === 'Node.PipelineNode.Failed' && outcomeEvent === 'unknown') {
        outcomeEvent = lookahead.message
        if (steps.length < 10) steps.push(toEventChainStep(lookahead, j))
        continue
      }

      if (lookahead.message === 'Node.PipelineNode.Succeeded') {
        hasRecovered = true
        outcomeEvent = lookahead.message
        if (steps.length < 10) steps.push(toEventChainStep(lookahead, j))
        break
      }

      if (lookahead.message === 'Tasker.Task.Succeeded') {
        hasRecovered = true
        outcomeEvent = lookahead.message
        if (steps.length < 10) steps.push(toEventChainStep(lookahead, j))
        break
      }

      if (lookahead.message === 'Tasker.Task.Failed') {
        hasTaskFailed = true
        outcomeEvent = lookahead.message
        if (steps.length < 10) steps.push(toEventChainStep(lookahead, j))
        break
      }
    }

    const riskLevel: EventChainRiskLevel = hasTaskFailed
      ? 'high'
      : hasRecovered
        ? 'low'
        : outcomeEvent === 'Node.PipelineNode.Failed'
          ? 'medium'
          : 'low'

    return {
      fallbackFirstNode,
      fallbackListPreview,
      hasRecovered,
      hasTaskFailed,
      outcomeEvent,
      riskLevel,
      steps: dedupeSteps(steps),
    }
  }

  const findRecentActionFailed = (
    fromIndex: number,
    nodeName: string,
    expectedActionId: number | null,
    expectedTaskId: number | null,
    window = 10
  ): number => {
    let nearFallback = -1
    for (let j = fromIndex - 1; j >= 0 && fromIndex - j <= window; j -= 1) {
      const candidate = events[j]
      if (candidate.message !== 'Node.Action.Failed' && candidate.message !== 'Node.ActionNode.Failed') continue
      const candidateName = typeof candidate.details?.name === 'string' ? candidate.details.name : ''
      const candidateActionId = readActionId(candidate)
      const candidateTaskId = typeof candidate.details?.task_id === 'number' ? candidate.details.task_id : null
      const actionIdMatched = expectedActionId != null && candidateActionId != null && candidateActionId === expectedActionId
      const taskIdMatched = expectedTaskId != null && candidateTaskId != null && candidateTaskId === expectedTaskId
      const nameMatched = !nodeName || !candidateName || candidateName === nodeName

      if (actionIdMatched || (nameMatched && (taskIdMatched || expectedTaskId == null))) {
        return j
      }

      if (nearFallback < 0 && taskIdMatched && fromIndex - j <= 4) {
        nearFallback = j
      }
    }
    return nearFallback
  }

  const readActionId = (event: EventNotification | null): number | null => {
    if (!event) return null
    const details = event.details ?? {}
    if (typeof details.action_id === 'number') return details.action_id

    const actionDetails = typeof details.action_details === 'object' && details.action_details
      ? details.action_details as Record<string, unknown>
      : null
    if (actionDetails && typeof actionDetails.action_id === 'number') return actionDetails.action_id

    const nodeDetails = typeof details.node_details === 'object' && details.node_details
      ? details.node_details as Record<string, unknown>
      : null
    if (nodeDetails && typeof nodeDetails.action_id === 'number') return nodeDetails.action_id

    return null
  }

  const readActionName = (event: EventNotification | null): string => {
    if (!event) return ''
    const details = event.details ?? {}
    if (typeof details.action === 'string' && details.action.trim()) return details.action
    if (typeof details.name === 'string' && details.name.trim()) return details.name

    const actionDetails = typeof details.action_details === 'object' && details.action_details
      ? details.action_details as Record<string, unknown>
      : null
    if (actionDetails) {
      if (typeof actionDetails.action === 'string' && actionDetails.action.trim()) return actionDetails.action
      if (typeof actionDetails.name === 'string' && actionDetails.name.trim()) return actionDetails.name
    }
    return ''
  }

  const hasMeaningfulFailedActionDetails = (event: EventNotification): boolean => {
    if (event.message !== 'Node.PipelineNode.Failed') return false
    const actionDetails = typeof event.details?.action_details === 'object' && event.details.action_details
      ? event.details.action_details as Record<string, unknown>
      : null
    if (!actionDetails) return false
    if (actionDetails.success !== false) return false
    const actionId = typeof actionDetails.action_id === 'number' ? actionDetails.action_id : 0
    const action = typeof actionDetails.action === 'string' ? actionDetails.action.trim() : ''
    const name = typeof actionDetails.name === 'string' ? actionDetails.name.trim() : ''
    return actionId > 0 || Boolean(action) || Boolean(name)
  }

  const findRecentNextListFailed = (
    fromIndex: number,
    nodeName: string,
    window = 40
  ): { triggerIndex: number; count: number } => {
    let triggerIndex = -1
    let count = 0
    for (let j = fromIndex - 1; j >= 0 && fromIndex - j <= window; j -= 1) {
      const candidate = events[j]
      if (candidate.message !== 'Node.NextList.Failed') continue
      const candidateName = typeof candidate.details?.name === 'string' ? candidate.details.name : ''
      if (!nodeName || !candidateName || candidateName === nodeName) {
        if (triggerIndex < 0) triggerIndex = j
        count += 1
      }
    }
    return { triggerIndex, count }
  }

  const findRecentPipelineFailedWithoutSuccess = (fromIndex: number, nodeName: string, window = 36): number => {
    for (let j = fromIndex - 1; j >= 0 && fromIndex - j <= window; j -= 1) {
      const candidate = events[j]
      const candidateName = typeof candidate.details?.name === 'string' ? candidate.details.name : ''
      if (candidateName && nodeName && candidateName !== nodeName) continue

      if (candidate.message === 'Node.PipelineNode.Succeeded') {
        return -1
      }
      if (candidate.message === 'Node.PipelineNode.Failed') {
        return j
      }
    }
    return -1
  }

  const pushOnErrorChain = (
    triggerType: OnErrorTriggerType,
    triggerIndex: number,
    triggerEvent: string,
    triggerNode: string,
    triggerActionId: number | null,
    timeoutLikeFailureCount: number,
    summaryBuilder: (followUp: ReturnType<typeof buildOnErrorFollowUp>) => string
  ) => {
    if (triggerIndex < 0 || triggerIndex >= events.length) return
    const key = `${triggerType}:${triggerIndex}:${triggerNode}`
    if (onErrorChainKeys.has(key)) return
    onErrorChainKeys.add(key)

    const trigger = events[triggerIndex]
    const followUp = buildOnErrorFollowUp(triggerIndex, [toEventChainStep(trigger, triggerIndex)])
    onErrorChains.push({
      triggerType,
      triggerEvent,
      triggerNode,
      triggerActionId,
      triggerLine: typeof trigger._lineNumber === 'number' ? trigger._lineNumber : null,
      timeoutLikeFailureCount,
      fallbackFirstNode: followUp.fallbackFirstNode,
      fallbackListPreview: followUp.fallbackListPreview,
      hasRecovered: followUp.hasRecovered,
      hasTaskFailed: followUp.hasTaskFailed,
      outcomeEvent: followUp.outcomeEvent,
      riskLevel: followUp.riskLevel,
      summary: summaryBuilder(followUp),
      steps: followUp.steps,
    })
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    const message = event.message

    if (message === 'Node.NextList.Starting') messageCounts.nextListStarting += 1
    if (message === 'Node.NextList.Failed') messageCounts.nextListFailed += 1
    if (message === 'Node.NextList.Succeeded') messageCounts.nextListSucceeded += 1
    if (message === 'Node.Recognition.Failed') messageCounts.recognitionFailed += 1
    if (message === 'Node.Recognition.Succeeded') messageCounts.recognitionSucceeded += 1
    if (message === 'Node.Action.Failed' || message === 'Node.ActionNode.Failed') messageCounts.actionFailed += 1
    if (message === 'Node.PipelineNode.Failed') messageCounts.pipelineFailed += 1
    if (message === 'Node.PipelineNode.Succeeded') messageCounts.pipelineSucceeded += 1
    if (message === 'Tasker.Task.Failed') messageCounts.taskFailed += 1

    if (message === 'Node.NextList.Starting') {
      const rawList = Array.isArray(event.details?.list) ? event.details.list : []
      const nextCandidates = rawList
        .slice(0, 8)
        .map((item: any) => ({
          name: typeof item?.name === 'string' ? item.name : '',
          jump_back: item?.jump_back === true,
          anchor: item?.anchor === true,
        }))
      const hasJumpBackCandidate = nextCandidates.some(item => item.jump_back)

      let recognitionFailed = 0
      let recognitionSucceeded = 0
      const steps: EventChainStep[] = [toEventChainStep(event, i)]
      let outcomeEvent: EventNotification | null = null

      for (let j = i + 1; j < events.length && j <= i + 36; j += 1) {
        const lookahead = events[j]
        if (lookahead.message === 'Node.NextList.Starting') break

        if (lookahead.message === 'Node.Recognition.Failed') {
          recognitionFailed += 1
          if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
          continue
        }
        if (lookahead.message === 'Node.Recognition.Succeeded') {
          recognitionSucceeded += 1
          if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
          continue
        }
        if (
          lookahead.message === 'Node.NextList.Failed' ||
          lookahead.message === 'Node.NextList.Succeeded' ||
          lookahead.message === 'Node.PipelineNode.Failed' ||
          lookahead.message === 'Node.PipelineNode.Succeeded'
        ) {
          outcomeEvent = lookahead
          if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
          if (
            lookahead.message === 'Node.PipelineNode.Failed' ||
            lookahead.message === 'Node.PipelineNode.Succeeded'
          ) {
            break
          }
        }
      }

      const recognitionTotal = recognitionFailed + recognitionSucceeded
      const recognitionFailedRate = recognitionTotal > 0 ? recognitionFailed / recognitionTotal : 0
      const riskLevel: EventChainRiskLevel = (
        toEventName(outcomeEvent) === 'Node.PipelineNode.Failed' || toEventName(outcomeEvent) === 'Node.NextList.Failed'
      )
        ? 'high'
        : recognitionTotal >= 3 && recognitionFailedRate >= 0.75
          ? 'medium'
          : 'low'

      const startNode = typeof event.details?.name === 'string' ? event.details.name : ''
      nextRecognitionChains.push({
        startNode,
        nextCandidates,
        hasJumpBackCandidate,
        recognitionFailed,
        recognitionSucceeded,
        outcomeEvent: toEventName(outcomeEvent),
        outcomeNode: toEventNodeName(outcomeEvent),
        riskLevel,
        summary:
          `NextList from ${startNode || 'unknown'} => ${toEventName(outcomeEvent)}, ` +
          `reco failed/succeeded=${recognitionFailed}/${recognitionSucceeded}` +
          (hasJumpBackCandidate ? '，含 jump_back 候选。' : '。'),
        steps,
      })
      continue
    }

    if (message === 'Node.Action.Failed' || message === 'Node.ActionNode.Failed') {
      const steps: EventChainStep[] = [toEventChainStep(event, i)]
      const actionId = readActionId(event)
      const nodeId = typeof event.details?.node_id === 'number' ? event.details.node_id : null
      const nodeName = typeof event.details?.name === 'string' ? event.details.name : ''
      const triggerEventName = message

      let pipelineFailed: EventNotification | null = null
      for (let j = i + 1; j < events.length && j <= i + 24; j += 1) {
        const lookahead = events[j]
        if (lookahead.message !== 'Node.PipelineNode.Failed') continue

        const sameNodeId = nodeId != null && lookahead.details?.node_id === nodeId
        const sameName = nodeName && typeof lookahead.details?.name === 'string' && lookahead.details.name === nodeName
        if (sameNodeId || sameName || (nodeId == null && !nodeName)) {
          pipelineFailed = lookahead
          if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
          break
        }
      }

      let taskFailed: EventNotification | null = null
      for (let j = i + 1; j < events.length && j <= i + 72; j += 1) {
        const lookahead = events[j]
        if (lookahead.message !== 'Tasker.Task.Failed') continue
        taskFailed = lookahead
        if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
        break
      }

      const riskLevel: EventChainRiskLevel = taskFailed
        ? 'high'
        : pipelineFailed
          ? 'medium'
          : 'low'
      actionFailureChains.push({
        actionNode: nodeName,
        actionId,
        hasPipelineFailed: Boolean(pipelineFailed),
        hasTaskFailed: Boolean(taskFailed),
        riskLevel,
        summary:
          `${triggerEventName}(${nodeName || 'unknown'}) -> ` +
          `${pipelineFailed ? 'PipelineNode.Failed' : 'no PipelineNode.Failed'} -> ` +
          `${taskFailed ? 'Tasker.Task.Failed' : 'task not failed in lookahead'}`,
        steps,
      })

      pushOnErrorChain(
        'action_failed',
        i,
        triggerEventName,
        nodeName,
        actionId,
        0,
        followUp =>
          `on_error 触发源 ${triggerEventName}（${nodeName || 'unknown'}） -> ${followUp.outcomeEvent}` +
          (followUp.fallbackFirstNode ? `，fallback=${followUp.fallbackFirstNode}` : '')
      )
    }

    if (message === 'Node.PipelineNode.Failed') {
      const nodeName = typeof event.details?.name === 'string' ? event.details.name : ''
      const actionId = readActionId(event)
      const taskId = typeof event.details?.task_id === 'number' ? event.details.task_id : null
      const actionFailedIndex = findRecentActionFailed(i, nodeName, actionId, taskId, 10)
      if (actionFailedIndex >= 0) continue

      if (hasMeaningfulFailedActionDetails(event)) {
        const actionName = readActionName(event)
        const implicitSteps: EventChainStep[] = [toEventChainStep(event, i)]
        let taskFailed: EventNotification | null = null
        for (let j = i + 1; j < events.length && j <= i + 72; j += 1) {
          const lookahead = events[j]
          if (lookahead.message !== 'Tasker.Task.Failed') continue
          taskFailed = lookahead
          if (implicitSteps.length < 7) implicitSteps.push(toEventChainStep(lookahead, j))
          break
        }

        actionFailureChains.push({
          actionNode: nodeName || actionName,
          actionId,
          hasPipelineFailed: true,
          hasTaskFailed: Boolean(taskFailed),
          riskLevel: taskFailed ? 'high' : 'medium',
          summary:
            `PipelineNode.Failed(implicit_action_failed, node=${nodeName || 'unknown'}, action=${actionName || 'unknown'}) -> ` +
            `${taskFailed ? 'Tasker.Task.Failed' : 'task not failed in lookahead'}`,
          steps: implicitSteps,
        })

        pushOnErrorChain(
          'action_failed',
          i,
          'Node.PipelineNode.Failed',
          nodeName || actionName,
          actionId,
          0,
          followUp =>
            `on_error 触发源 PipelineNode.Failed(implicit action failure, node=${nodeName || 'unknown'}, action=${actionName || 'unknown'}) -> ${followUp.outcomeEvent}` +
            (followUp.fallbackFirstNode ? `，fallback=${followUp.fallbackFirstNode}` : '')
        )
        continue
      }

      const timeoutLike = findRecentNextListFailed(i, nodeName, 40)
      if (timeoutLike.triggerIndex >= 0) {
        pushOnErrorChain(
          'reco_timeout_or_nohit',
          timeoutLike.triggerIndex,
          'Node.NextList.Failed',
          nodeName,
          null,
          timeoutLike.count,
          followUp =>
            `on_error 触发源 NextList 失败/超时（node=${nodeName || 'unknown'}，failed_count=${timeoutLike.count}） -> ${followUp.outcomeEvent}` +
            (followUp.fallbackFirstNode ? `，fallback=${followUp.fallbackFirstNode}` : '')
        )
        continue
      }

      const prevPipelineFailedIndex = findRecentPipelineFailedWithoutSuccess(i, nodeName, 36)
      if (prevPipelineFailedIndex >= 0) {
        pushOnErrorChain(
          'error_handling_loop',
          i,
          'Node.PipelineNode.Failed',
          nodeName,
          null,
          0,
          followUp =>
            `on_error 处理链疑似循环（node=${nodeName || 'unknown'}） -> ${followUp.outcomeEvent}` +
            (followUp.fallbackFirstNode ? `，fallback=${followUp.fallbackFirstNode}` : '')
        )
      }
    }
  }

  nextRecognitionChains.sort((a, b) => {
    const riskDiff = rankRiskLevel(b.riskLevel) - rankRiskLevel(a.riskLevel)
    if (riskDiff !== 0) return riskDiff
    return b.steps[0]?.index - a.steps[0]?.index
  })

  actionFailureChains.sort((a, b) => {
    const riskDiff = rankRiskLevel(b.riskLevel) - rankRiskLevel(a.riskLevel)
    if (riskDiff !== 0) return riskDiff
    return b.steps[0]?.index - a.steps[0]?.index
  })

  onErrorChains.sort((a, b) => {
    const riskDiff = rankRiskLevel(b.riskLevel) - rankRiskLevel(a.riskLevel)
    if (riskDiff !== 0) return riskDiff
    const aIndex = a.steps[0]?.index ?? -1
    const bIndex = b.steps[0]?.index ?? -1
    return bIndex - aIndex
  })

  return {
    eventCount: events.length,
    messageCounts,
    nextRecognitionChains: nextRecognitionChains.slice(0, 10),
    actionFailureChains: actionFailureChains.slice(0, 8),
    onErrorChains: onErrorChains.slice(0, 10),
  }
}

export const buildStopTerminationDiagnostics = (
  events: EventNotification[],
  taskStatus: TaskInfo['status'] | null | undefined
) => {
  const stopRegex = /(?:^|[^a-z0-9])(stoptask|post_stop|need_to_stop|stop)(?:$|[^a-z0-9])/i
  const stopSignals: Array<{
    index: number
    line: number | null
    time: string
    msg: string
    node: string
    action: string
    keyword: string
  }> = []
  const stopSignalKeys = new Set<string>()

  let taskTerminalEvent = 'unknown'
  let taskTerminalIndex = -1
  let taskTerminalLine: number | null = null
  let implicitStopPatternDetected = false
  let implicitStopActionName = ''
  let implicitStopActionId: number | null = null
  let implicitStopActionLine: number | null = null

  const pushText = (bucket: string[], value: unknown) => {
    if (typeof value !== 'string') return
    const text = value.trim()
    if (!text) return
    bucket.push(text)
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    if (event.message === 'Tasker.Task.Succeeded' || event.message === 'Tasker.Task.Failed') {
      taskTerminalEvent = event.message
      taskTerminalIndex = i
      taskTerminalLine = typeof event._lineNumber === 'number' ? event._lineNumber : null
    }

    const textCandidates: string[] = [event.message]
    const details = event.details ?? {}
    pushText(textCandidates, details.action)
    pushText(textCandidates, details.reason)

    const actionDetails = typeof details.action_details === 'object' && details.action_details
      ? details.action_details as Record<string, unknown>
      : null
    if (actionDetails) {
      pushText(textCandidates, actionDetails.action)
    }

    let matchedKeyword = ''
    for (const text of textCandidates) {
      const matched = text.match(stopRegex)
      if (!matched) continue
      matchedKeyword = matched[1]?.toLowerCase() ?? 'stop'
      break
    }
    if (!matchedKeyword) continue

    const key = `${i}:${matchedKeyword}`
    if (stopSignalKeys.has(key)) continue
    stopSignalKeys.add(key)

    stopSignals.push({
      index: i,
      line: typeof event._lineNumber === 'number' ? event._lineNumber : null,
      time: event.timestamp,
      msg: event.message,
      node: typeof details.name === 'string' ? details.name : '',
      action: typeof details.action === 'string'
        ? details.action
        : (typeof actionDetails?.action === 'string' ? actionDetails.action : ''),
      keyword: matchedKeyword,
    })
  }

  let pipelineFailedNearTerminal = 0
  if (taskTerminalIndex >= 0) {
    const start = Math.max(0, taskTerminalIndex - 20)
    for (let i = start; i < taskTerminalIndex; i += 1) {
      if (events[i].message === 'Node.PipelineNode.Failed') {
        pipelineFailedNearTerminal += 1
      }
    }
  }

  if (taskTerminalEvent === 'Tasker.Task.Succeeded' && taskTerminalIndex >= 0) {
    const scanStart = Math.max(0, taskTerminalIndex - 24)
    let actionStartIndex = -1
    let actionStartId: number | null = null
    let actionStartAction = ''

    for (let i = taskTerminalIndex - 1; i >= scanStart; i -= 1) {
      const event = events[i]
      if (event.message !== 'Node.Action.Starting') continue
      actionStartIndex = i
      actionStartId = typeof event.details?.action_id === 'number' ? event.details.action_id : null
      actionStartAction = typeof event.details?.action === 'string' ? event.details.action : ''
      implicitStopActionLine = typeof event._lineNumber === 'number' ? event._lineNumber : null
      break
    }

    if (actionStartIndex >= 0) {
      let firstPipelineFailedIndex = -1
      let hasActionResultAfterStart = false
      const actionToTerminalGap = taskTerminalIndex - actionStartIndex

      for (let j = actionStartIndex + 1; j < taskTerminalIndex; j += 1) {
        const lookahead = events[j]
        if (lookahead.message === 'Node.PipelineNode.Failed' && firstPipelineFailedIndex < 0) {
          firstPipelineFailedIndex = j
          continue
        }
        if (lookahead.message === 'Node.Action.Succeeded' || lookahead.message === 'Node.Action.Failed') {
          const lookaheadActionId = typeof lookahead.details?.action_id === 'number' ? lookahead.details.action_id : null
          if (actionStartId == null || lookaheadActionId == null || lookaheadActionId === actionStartId) {
            hasActionResultAfterStart = true
          }
        }
      }

      const hasPipelineFailedAfterStart = firstPipelineFailedIndex >= 0
      const failedToTerminalGap = hasPipelineFailedAfterStart
        ? taskTerminalIndex - firstPipelineFailedIndex
        : Number.POSITIVE_INFINITY

      if (hasPipelineFailedAfterStart && !hasActionResultAfterStart && actionToTerminalGap <= 8 && failedToTerminalGap <= 4) {
        implicitStopPatternDetected = true
        implicitStopActionName = actionStartAction
        implicitStopActionId = actionStartId
      }
    }
  }

  const hasStrongStopSignal = stopSignals.some(item =>
    item.keyword === 'stoptask' || item.keyword === 'post_stop' || item.keyword === 'need_to_stop'
  )
  const taskSucceededAfterPipelineFailed = taskTerminalEvent === 'Tasker.Task.Succeeded' && pipelineFailedNearTerminal > 0
  const likelyActiveStop = taskTerminalEvent === 'Tasker.Task.Succeeded'
    && (hasStrongStopSignal || implicitStopPatternDetected || (stopSignals.length > 0 && taskSucceededAfterPipelineFailed))

  const confidence: StopConfidenceLevel = likelyActiveStop
    ? hasStrongStopSignal
      ? 'high'
      : implicitStopPatternDetected
        ? 'medium'
        : taskSucceededAfterPipelineFailed
          ? 'medium'
          : 'low'
    : stopSignals.length > 0
      ? 'low'
      : 'low'

  const summary = likelyActiveStop
    ? `检测到主动停止特征：task 终态=${taskTerminalEvent}，stop 信号 ${stopSignals.length} 条，隐式 stop 链路=${implicitStopPatternDetected ? '是' : '否'}，终态前 PipelineNode.Failed=${pipelineFailedNearTerminal}。`
    : stopSignals.length > 0
      ? `发现 stop 相关信号 ${stopSignals.length} 条，但终态=${taskTerminalEvent}，暂不足以判定主动停止。`
      : `未检测到 stop 相关信号（task 终态=${taskTerminalEvent}）。`

  return {
    taskStatus: taskStatus ?? null,
    taskTerminalEvent,
    taskTerminalLine,
    stopSignalCount: stopSignals.length,
    stopSignals: stopSignals.slice(0, 8),
    pipelineFailedNearTerminal,
    taskSucceededAfterPipelineFailed,
    implicitStopPatternDetected,
    implicitStopActionName,
    implicitStopActionId,
    implicitStopActionLine,
    likelyActiveStop,
    confidence,
    summary,
  }
}

export const buildNextCandidateAvailabilityDiagnostics = (events: EventNotification[]) => {
  const windows: Array<{
    startNode: string
    startLine: number | null
    candidateCount: number
    anchorCandidateCount: number
    recognitionAttemptCount: number
    recognitionFailedCount: number
    recognitionSucceededCount: number
    outcomeEvent: string
    outcomeLine: number | null
    classification: NextCandidateFailureClass
    summary: string
    steps: EventChainStep[]
  }> = []

  const rankClass = (value: NextCandidateFailureClass): number => {
    if (value === 'likely_no_executable_candidate') return 3
    if (value === 'likely_timeout_or_nohit') return 2
    return 1
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    if (event.message !== 'Node.NextList.Starting') continue

    const rawList = Array.isArray(event.details?.list) ? event.details.list : []
    const candidates = rawList.slice(0, 10).map((item: any) => ({
      name: typeof item?.name === 'string' ? item.name : '',
      anchor: item?.anchor === true,
      jump_back: item?.jump_back === true,
    }))
    const candidateCount = candidates.length
    const anchorCandidateCount = candidates.filter(item => item.anchor).length

    let recognitionStartingCount = 0
    let recognitionFailedCount = 0
    let recognitionSucceededCount = 0
    const steps: EventChainStep[] = [toEventChainStep(event, i)]
    let outcomeEvent = 'unknown'
    let outcomeLine: number | null = null

    for (let j = i + 1; j < events.length && j <= i + 56; j += 1) {
      const lookahead = events[j]
      if (lookahead.message === 'Node.NextList.Starting') break

      if (lookahead.message === 'Node.Recognition.Starting') {
        recognitionStartingCount += 1
        if (steps.length < 6) steps.push(toEventChainStep(lookahead, j))
        continue
      }
      if (lookahead.message === 'Node.Recognition.Failed') {
        recognitionFailedCount += 1
        if (steps.length < 6) steps.push(toEventChainStep(lookahead, j))
        continue
      }
      if (lookahead.message === 'Node.Recognition.Succeeded') {
        recognitionSucceededCount += 1
        if (steps.length < 6) steps.push(toEventChainStep(lookahead, j))
        continue
      }

      if (
        lookahead.message === 'Node.NextList.Failed' ||
        lookahead.message === 'Node.NextList.Succeeded' ||
        lookahead.message === 'Node.PipelineNode.Failed' ||
        lookahead.message === 'Node.PipelineNode.Succeeded' ||
        lookahead.message === 'Tasker.Task.Succeeded' ||
        lookahead.message === 'Tasker.Task.Failed'
      ) {
        outcomeEvent = lookahead.message
        outcomeLine = typeof lookahead._lineNumber === 'number' ? lookahead._lineNumber : null
        if (steps.length < 6) steps.push(toEventChainStep(lookahead, j))
        break
      }
    }

    const recognitionAttemptCount = Math.max(
      recognitionStartingCount,
      recognitionFailedCount + recognitionSucceededCount
    )

    let classification: NextCandidateFailureClass = 'recovered_or_succeeded'
    if (outcomeEvent === 'Node.NextList.Failed') {
      classification = recognitionAttemptCount === 0 && candidateCount > 0
        ? 'likely_no_executable_candidate'
        : 'likely_timeout_or_nohit'
    }

    const startNode = typeof event.details?.name === 'string' ? event.details.name : ''
    const summary = classification === 'likely_no_executable_candidate'
      ? `NextList(${startNode || 'unknown'}) 失败前无识别尝试，候选不可执行概率高。`
      : classification === 'likely_timeout_or_nohit'
        ? `NextList(${startNode || 'unknown'}) 出现识别尝试但未命中后失败，偏向 timeout/no-hit。`
        : `NextList(${startNode || 'unknown'}) 最终未落到失败。`

    windows.push({
      startNode,
      startLine: typeof event._lineNumber === 'number' ? event._lineNumber : null,
      candidateCount,
      anchorCandidateCount,
      recognitionAttemptCount,
      recognitionFailedCount,
      recognitionSucceededCount,
      outcomeEvent,
      outcomeLine,
      classification,
      summary,
      steps,
    })
  }

  const failedNoExecutable = windows.filter(item => item.classification === 'likely_no_executable_candidate')
  const failedTimeoutLike = windows.filter(item => item.classification === 'likely_timeout_or_nohit')
  const failedNoExecutableWithAnchor = failedNoExecutable.filter(item => item.anchorCandidateCount > 0)
  const recoveredAfterPartialMiss = windows.filter(item =>
    item.classification === 'recovered_or_succeeded'
    && item.recognitionFailedCount > 0
    && item.recognitionSucceededCount > 0
  )
  const noHitFailureByNode = new Map<string, number>()
  const partialMissRecoveredByNode = new Map<string, number>()
  for (const item of failedTimeoutLike) {
    const key = item.startNode || 'unknown'
    noHitFailureByNode.set(key, (noHitFailureByNode.get(key) ?? 0) + 1)
  }
  for (const item of recoveredAfterPartialMiss) {
    const key = item.startNode || 'unknown'
    partialMissRecoveredByNode.set(key, (partialMissRecoveredByNode.get(key) ?? 0) + 1)
  }
  const suspiciousCases = windows
    .filter(item => item.classification !== 'recovered_or_succeeded')
    .sort((a, b) => {
      const classDiff = rankClass(b.classification) - rankClass(a.classification)
      if (classDiff !== 0) return classDiff
      if (b.anchorCandidateCount !== a.anchorCandidateCount) return b.anchorCandidateCount - a.anchorCandidateCount
      return (b.startLine ?? -1) - (a.startLine ?? -1)
    })

  return {
    windowCount: windows.length,
    failedNoExecutableCount: failedNoExecutable.length,
    failedNoExecutableWithAnchorCount: failedNoExecutableWithAnchor.length,
    failedTimeoutLikeCount: failedTimeoutLike.length,
    recoveredAfterPartialMissCount: recoveredAfterPartialMiss.length,
    recoveredAfterPartialMissRatio: windows.length > 0 ? recoveredAfterPartialMiss.length / windows.length : 0,
    noHitFailureByNode: Array.from(noHitFailureByNode.entries())
      .map(([node, count]) => ({ node, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    partialMissRecoveredByNode: Array.from(partialMissRecoveredByNode.entries())
      .map(([node, count]) => ({ node, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    suspiciousCases: suspiciousCases.slice(0, 10),
    summary:
      `NextList窗口=${windows.length}，无可执行候选失败=${failedNoExecutable.length}（其中含 anchor 候选=${failedNoExecutableWithAnchor.length}），` +
      `整轮无命中并失败(timeout/no-hit)=${failedTimeoutLike.length}，前段未命中但后续命中恢复=${recoveredAfterPartialMiss.length}。`,
  }
}

export const buildAnchorResolutionDiagnostics = (events: EventNotification[]) => {
  const windows: Array<{
    startNode: string
    startLine: number | null
    anchorCandidates: string[]
    candidateCount: number
    recognitionAttemptCount: number
    outcomeEvent: string
    outcomeLine: number | null
    classification: AnchorResolutionClass
    summary: string
    steps: EventChainStep[]
  }> = []

  const dedupeSteps = (steps: EventChainStep[], limit = 6): EventChainStep[] => {
    const out: EventChainStep[] = []
    const seen = new Set<number>()
    for (const step of steps) {
      if (seen.has(step.index)) continue
      seen.add(step.index)
      out.push(step)
      if (out.length >= limit) break
    }
    return out
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    if (event.message !== 'Node.NextList.Starting') continue

    const rawList = Array.isArray(event.details?.list) ? event.details.list : []
    const anchorCandidates = rawList
      .filter((item: any) => item?.anchor === true)
      .map((item: any) => (typeof item?.name === 'string' ? item.name : ''))
      .filter(Boolean)
      .slice(0, 8)
    if (anchorCandidates.length === 0) continue

    let recognitionAttemptCount = 0
    let outcomeEvent = 'unknown'
    let outcomeLine: number | null = null
    const steps: EventChainStep[] = [toEventChainStep(event, i)]

    for (let j = i + 1; j < events.length && j <= i + 56; j += 1) {
      const lookahead = events[j]
      if (lookahead.message === 'Node.NextList.Starting') break

      if (lookahead.message === 'Node.Recognition.Starting') {
        recognitionAttemptCount += 1
        if (steps.length < 6) steps.push(toEventChainStep(lookahead, j))
        continue
      }

      if (
        lookahead.message === 'Node.NextList.Failed' ||
        lookahead.message === 'Node.NextList.Succeeded' ||
        lookahead.message === 'Node.PipelineNode.Failed' ||
        lookahead.message === 'Node.PipelineNode.Succeeded' ||
        lookahead.message === 'Tasker.Task.Succeeded' ||
        lookahead.message === 'Tasker.Task.Failed'
      ) {
        outcomeEvent = lookahead.message
        outcomeLine = typeof lookahead._lineNumber === 'number' ? lookahead._lineNumber : null
        if (steps.length < 6) steps.push(toEventChainStep(lookahead, j))
        break
      }
    }

    const classification: AnchorResolutionClass = outcomeEvent === 'Node.NextList.Failed'
      ? recognitionAttemptCount === 0
        ? 'unresolved_anchor_candidate_likely'
        : 'failed_after_anchor_resolution'
      : 'recovered_or_succeeded'

    const startNode = typeof event.details?.name === 'string' ? event.details.name : ''
    const summary = classification === 'unresolved_anchor_candidate_likely'
      ? `Anchor候选在 NextList(${startNode || 'unknown'}) 中未进入识别即失败，疑似锚点未解析/已清除。`
      : classification === 'failed_after_anchor_resolution'
        ? `Anchor候选在 NextList(${startNode || 'unknown'}) 已进入识别但仍失败，疑似后续识别或规则问题。`
        : `Anchor候选在 NextList(${startNode || 'unknown'}) 未导致失败。`

    windows.push({
      startNode,
      startLine: typeof event._lineNumber === 'number' ? event._lineNumber : null,
      anchorCandidates,
      candidateCount: anchorCandidates.length,
      recognitionAttemptCount,
      outcomeEvent,
      outcomeLine,
      classification,
      summary,
      steps: dedupeSteps(steps),
    })
  }

  const unresolved = windows.filter(item => item.classification === 'unresolved_anchor_candidate_likely')
  const failedAfterResolved = windows.filter(item => item.classification === 'failed_after_anchor_resolution')
  const suspiciousCases = unresolved
    .sort((a, b) => {
      if (b.candidateCount !== a.candidateCount) return b.candidateCount - a.candidateCount
      return (b.startLine ?? -1) - (a.startLine ?? -1)
    })
    .slice(0, 10)

  return {
    windowCount: windows.length,
    unresolvedAnchorLikelyCount: unresolved.length,
    failedAfterAnchorResolvedCount: failedAfterResolved.length,
    suspiciousCases,
    summary: `Anchor窗口=${windows.length}，疑似锚点未解析=${unresolved.length}，已解析但失败=${failedAfterResolved.length}。`,
  }
}

export const buildJumpBackFlowDiagnostics = (events: EventNotification[]) => {
  const cases: Array<{
    startNode: string
    startLine: number | null
    jumpBackCandidates: string[]
    jumpBackHit: boolean
    hitCandidate: string
    hitLine: number | null
    failureAfterHit: string
    failureLine: number | null
    returnObserved: boolean
    returnLine: number | null
    hitNodeNextListStarted: boolean
    terminalBounceLikely: boolean
    terminalEvent: string
    terminalLine: number | null
    classification: JumpBackFlowClass
    summary: string
    steps: EventChainStep[]
  }> = []

  const dedupeSteps = (steps: EventChainStep[], limit = 7): EventChainStep[] => {
    const out: EventChainStep[] = []
    const seen = new Set<number>()
    for (const step of steps) {
      if (seen.has(step.index)) continue
      seen.add(step.index)
      out.push(step)
      if (out.length >= limit) break
    }
    return out
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    if (event.message !== 'Node.NextList.Starting') continue

    const rawList = Array.isArray(event.details?.list) ? event.details.list : []
    const jumpBackCandidates = rawList
      .filter((item: any) => item?.jump_back === true)
      .map((item: any) => (typeof item?.name === 'string' ? item.name : ''))
      .filter(Boolean)
      .slice(0, 8)
    if (jumpBackCandidates.length === 0) continue
    const jumpBackNameSet = new Set(jumpBackCandidates)

    const startNode = typeof event.details?.name === 'string' ? event.details.name : ''
    const steps: EventChainStep[] = [toEventChainStep(event, i)]
    let hitCandidate = ''
    let hitLine: number | null = null
    let failureAfterHit = ''
    let failureLine: number | null = null
    let returnLine: number | null = null
    let hitNodeNextListStarted = false
    let terminalEvent = 'unknown'
    let terminalLine: number | null = null

    for (let j = i + 1; j < events.length && j <= i + 140; j += 1) {
      const lookahead = events[j]
      const lookaheadName = typeof lookahead.details?.name === 'string' ? lookahead.details.name : ''

      if (!hitCandidate && lookahead.message === 'Node.Recognition.Succeeded' && jumpBackNameSet.has(lookaheadName)) {
        hitCandidate = lookaheadName
        hitLine = typeof lookahead._lineNumber === 'number' ? lookahead._lineNumber : null
        if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
        continue
      }

      if (hitCandidate && !failureAfterHit && (lookahead.message === 'Node.NextList.Failed' || lookahead.message === 'Node.PipelineNode.Failed')) {
        failureAfterHit = lookahead.message
        failureLine = typeof lookahead._lineNumber === 'number' ? lookahead._lineNumber : null
        if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
        continue
      }

      if (hitCandidate && lookahead.message === 'Node.NextList.Starting' && lookaheadName === hitCandidate) {
        hitNodeNextListStarted = true
        if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
      }

      if (hitCandidate && returnLine == null && lookahead.message === 'Node.NextList.Starting' && lookaheadName === startNode) {
        returnLine = typeof lookahead._lineNumber === 'number' ? lookahead._lineNumber : null
        if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
        break
      }

      if (terminalEvent === 'unknown' && (lookahead.message === 'Tasker.Task.Succeeded' || lookahead.message === 'Tasker.Task.Failed')) {
        terminalEvent = lookahead.message
        terminalLine = typeof lookahead._lineNumber === 'number' ? lookahead._lineNumber : null
        if (steps.length < 7) steps.push(toEventChainStep(lookahead, j))
        if (hitCandidate) break
      }
    }

    const terminalBounceLikely = Boolean(hitCandidate && returnLine != null && !hitNodeNextListStarted)
    const classification: JumpBackFlowClass = !hitCandidate
      ? 'not_hit'
      : returnLine != null
        ? 'hit_then_returned'
        : failureAfterHit
          ? 'hit_then_failed_no_return'
          : 'hit_no_return_observed'

    const summary = classification === 'not_hit'
      ? `jump_back 候选在 ${startNode || 'unknown'} 未命中。`
      : classification === 'hit_then_returned'
        ? terminalBounceLikely
          ? `jump_back 候选命中后回到父节点（${startNode || 'unknown'}），但命中节点未观察到 NextList.Starting，疑似无后继/终止节点导致回跳复检。`
          : `jump_back 候选命中后观察到父节点回到 NextList（${startNode || 'unknown'}）。`
        : classification === 'hit_then_failed_no_return'
          ? `jump_back 候选命中后出现失败链路（${failureAfterHit}），未观察到父节点回跳继续识别。`
          : `jump_back 候选命中后未观察到回跳，且未见明确失败信号。`

    cases.push({
      startNode,
      startLine: typeof event._lineNumber === 'number' ? event._lineNumber : null,
      jumpBackCandidates,
      jumpBackHit: Boolean(hitCandidate),
      hitCandidate,
      hitLine,
      failureAfterHit,
      failureLine,
      returnObserved: returnLine != null,
      returnLine,
      hitNodeNextListStarted,
      terminalBounceLikely,
      terminalEvent,
      terminalLine,
      classification,
      summary,
      steps: dedupeSteps(steps),
    })
  }

  const hitThenFailedNoReturn = cases.filter(item => item.classification === 'hit_then_failed_no_return')
  const hitThenReturned = cases.filter(item => item.classification === 'hit_then_returned')
  const hitNoReturnObserved = cases.filter(item => item.classification === 'hit_no_return_observed')
  const terminalBounceCases = hitThenReturned.filter(item => item.terminalBounceLikely)
  const terminalBounceByPair = new Map<string, {
    startNode: string
    hitCandidate: string
    count: number
    firstLine: number | null
    lastLine: number | null
  }>()
  for (const item of terminalBounceCases) {
    const key = `${item.startNode}@@${item.hitCandidate}`
    const current = terminalBounceByPair.get(key) ?? {
      startNode: item.startNode,
      hitCandidate: item.hitCandidate,
      count: 0,
      firstLine: item.startLine,
      lastLine: item.startLine,
    }
    current.count += 1
    if (item.startLine != null) {
      if (current.firstLine == null || item.startLine < current.firstLine) current.firstLine = item.startLine
      if (current.lastLine == null || item.startLine > current.lastLine) current.lastLine = item.startLine
    }
    terminalBounceByPair.set(key, current)
  }

  const pairStatsMap = new Map<string, {
    startNode: string
    hitCandidate: string
    totalHitCount: number
    hitThenReturnedCount: number
    hitThenFailedNoReturnCount: number
    hitNoReturnObservedCount: number
    terminalBounceCount: number
    latestLine: number | null
  }>()
  for (const item of cases) {
    if (!item.hitCandidate) continue
    const key = `${item.startNode}@@${item.hitCandidate}`
    const current = pairStatsMap.get(key) ?? {
      startNode: item.startNode,
      hitCandidate: item.hitCandidate,
      totalHitCount: 0,
      hitThenReturnedCount: 0,
      hitThenFailedNoReturnCount: 0,
      hitNoReturnObservedCount: 0,
      terminalBounceCount: 0,
      latestLine: item.startLine,
    }
    current.totalHitCount += 1
    if (item.classification === 'hit_then_returned') current.hitThenReturnedCount += 1
    if (item.classification === 'hit_then_failed_no_return') current.hitThenFailedNoReturnCount += 1
    if (item.classification === 'hit_no_return_observed') current.hitNoReturnObservedCount += 1
    if (item.terminalBounceLikely) current.terminalBounceCount += 1
    if (item.startLine != null && (current.latestLine == null || item.startLine > current.latestLine)) {
      current.latestLine = item.startLine
    }
    pairStatsMap.set(key, current)
  }

  const suspiciousCases = [...hitThenFailedNoReturn, ...terminalBounceCases]
    .sort((a, b) => {
      const rank = (item: typeof a) => item.classification === 'hit_then_failed_no_return' ? 2 : 1
      const rankDiff = rank(b) - rank(a)
      if (rankDiff !== 0) return rankDiff
      return (b.startLine ?? -1) - (a.startLine ?? -1)
    })
    .slice(0, 10)

  return {
    caseCount: cases.length,
    hitThenReturnedCount: hitThenReturned.length,
    hitThenFailedNoReturnCount: hitThenFailedNoReturn.length,
    hitNoReturnObservedCount: hitNoReturnObserved.length,
    terminalBounceCount: terminalBounceCases.length,
    terminalBounceCases: Array.from(terminalBounceByPair.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return (b.lastLine ?? -1) - (a.lastLine ?? -1)
      })
      .slice(0, 8),
    pairStats: Array.from(pairStatsMap.values())
      .sort((a, b) => {
        if (b.totalHitCount !== a.totalHitCount) return b.totalHitCount - a.totalHitCount
        if (b.terminalBounceCount !== a.terminalBounceCount) return b.terminalBounceCount - a.terminalBounceCount
        return (b.latestLine ?? -1) - (a.latestLine ?? -1)
      })
      .slice(0, 24),
    suspiciousCases,
    summary: `jump_back窗口=${cases.length}，命中并回跳=${hitThenReturned.length}，命中后失败且未回跳=${hitThenFailedNoReturn.length}，命中后未观察到回跳=${hitNoReturnObserved.length}，命中后回跳且命中节点疑似无后继=${terminalBounceCases.length}。`,
  }
}

const extractQuestionIdentifiers = (question: string): string[] => {
  const tokens = question.match(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g) ?? []
  const stopWords = new Set([
    'json',
    'answer',
    'memory',
    'update',
    'task',
    'node',
    'next',
    'list',
    'jump',
    'back',
    'failed',
    'succeeded',
    'pipeline',
    'action',
    'recognition',
    'error',
  ])
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (stopWords.has(lower)) continue
    if (seen.has(lower)) continue
    seen.add(lower)
    out.push(token)
    if (out.length >= 6) break
  }
  return out
}

const buildQuestionNodeDiagnostics = (
  question: string,
  task: TaskInfo | null,
  jumpBackFlowDiagnostics: ReturnType<typeof buildJumpBackFlowDiagnostics>
) => {
  if (!task) return []
  const identifiers = extractQuestionIdentifiers(question)
  if (identifiers.length === 0) return []

  const allNodeNames = Array.from(new Set(task.nodes.map(item => item.name)))
  const pairStats = Array.isArray(jumpBackFlowDiagnostics?.pairStats)
    ? jumpBackFlowDiagnostics.pairStats
    : []

  const diagnostics: Array<Record<string, unknown>> = []
  for (const identifier of identifiers) {
    const lower = identifier.toLowerCase()
    const exact = allNodeNames.filter(name => name.toLowerCase() === lower)
    const fuzzy = exact.length > 0
      ? []
      : allNodeNames.filter(name => lower.length >= 6 && name.toLowerCase().includes(lower))
    const matchedNames = [...exact, ...fuzzy].slice(0, 2)

    if (matchedNames.length === 0) {
      diagnostics.push({
        query: identifier,
        matched: false,
      })
      continue
    }

    for (const nodeName of matchedNames) {
      const nodeRows = task.nodes.filter(item => item.name === nodeName)
      const timestamps = nodeRows
        .map(item => toTimestampMs(item.ts))
        .filter((value): value is number => value != null)
      const firstTs = timestamps.length > 0 ? Math.min(...timestamps) : null
      const lastTs = timestamps.length > 0 ? Math.max(...timestamps) : null
      const spanMs = firstTs != null && lastTs != null ? Math.max(0, lastTs - firstTs) : 0
      const failedNodeCount = nodeRows.filter(item => item.status === 'failed').length
      const failedRecoCount = nodeRows.reduce(
        (sum, item) => sum + buildNodeRecognitionAttempts(item).filter(reco => reco.status === 'failed').length,
        0
      )
      const successRecoCount = nodeRows.reduce(
        (sum, item) => sum + buildNodeRecognitionAttempts(item).filter(reco => reco.status === 'success').length,
        0
      )

      const recoStats = new Map<string, { failed: number; success: number; total: number }>()
      const jumpBackCandidateStats = new Map<string, { referencedCount: number; anchorCount: number }>()
      const actionKindStats = new Map<string, number>()
      const nestedRecognitionNodeNames: string[] = []
      let nestedActionGroupCount = 0
      let nestedActionNodeCount = 0
      let nestedActionFailedNodeCount = 0
      let nestedRecognitionInActionCount = 0

      for (const row of nodeRows) {
        const actionKindRaw = row.action_details?.action || row.action_details?.name || ''
        const actionKind = typeof actionKindRaw === 'string' ? actionKindRaw.trim() : ''
        if (actionKind) actionKindStats.set(actionKind, (actionKindStats.get(actionKind) ?? 0) + 1)

        for (const reco of buildNodeRecognitionAttempts(row)) {
          const current = recoStats.get(reco.name) ?? { failed: 0, success: 0, total: 0 }
          current.total += 1
          if (reco.status === 'failed') current.failed += 1
          if (reco.status === 'success') current.success += 1
          recoStats.set(reco.name, current)
        }

        for (const nextItem of row.next_list) {
          if (!nextItem.jump_back) continue
          const current = jumpBackCandidateStats.get(nextItem.name) ?? { referencedCount: 0, anchorCount: 0 }
          current.referencedCount += 1
          if (nextItem.anchor) current.anchorCount += 1
          jumpBackCandidateStats.set(nextItem.name, current)
        }

        const actionFlowView = buildNodeActionFlowView(row)
        const nestedRecognitionNodes = actionFlowView.actionLevelRecognitionItems
        nestedRecognitionInActionCount += nestedRecognitionNodes.length
        for (const nestedReco of nestedRecognitionNodes) {
          if (nestedReco?.name) nestedRecognitionNodeNames.push(nestedReco.name)
        }
        nestedActionGroupCount += actionFlowView.taskItems.length
        nestedActionNodeCount += actionFlowView.nestedPipelineItems.length
        nestedActionFailedNodeCount += actionFlowView.nestedPipelineItems.filter(item => item.status === 'failed').length
        nestedRecognitionInActionCount += actionFlowView.nestedRecognitionItems.length
      }

      const jumpBackCandidates = Array.from(jumpBackCandidateStats.entries())
        .map(([name, stat]) => {
          const candidateNodes = task.nodes.filter(item => item.name === name)
          const candidateWithNextListCount = candidateNodes.filter(item => item.next_list.length > 0).length
          const candidateWithoutNextListCount = candidateNodes.length - candidateWithNextListCount
          const candidateActionKinds = Array.from(
            new Set(
              candidateNodes
                .map(item => item.action_details?.action || item.action_details?.name || '')
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            )
          ).slice(0, 4)
          const pair = pairStats.find(
            item => item.startNode === nodeName && item.hitCandidate === name
          ) as Record<string, unknown> | undefined
          return {
            name,
            referencedCount: stat.referencedCount,
            anchorCount: stat.anchorCount,
            hitCount: Number(pair?.totalHitCount ?? 0),
            terminalBounceCount: Number(pair?.terminalBounceCount ?? 0),
            candidateNodeOccurrences: candidateNodes.length,
            candidateWithNextListCount,
            candidateWithoutNextListCount,
            candidateActionKinds,
            candidateNestedActionGroupCount: candidateNodes.reduce(
              (sum, item) => sum + buildNodeActionFlowView(item).taskItems.length,
              0
            ),
          }
        })
        .sort((a, b) => {
          if (b.referencedCount !== a.referencedCount) return b.referencedCount - a.referencedCount
          if (b.terminalBounceCount !== a.terminalBounceCount) return b.terminalBounceCount - a.terminalBounceCount
          return b.hitCount - a.hitCount
        })
        .slice(0, 6)

      const hitAsJumpBackTargetStats = pairStats
        .filter(item => item.hitCandidate === nodeName)
        .reduce(
          (acc, item) => {
            acc.totalHitCount += Number(item.totalHitCount ?? 0)
            acc.terminalBounceCount += Number(item.terminalBounceCount ?? 0)
            acc.fromNodes.push(String(item.startNode ?? ''))
            return acc
          },
          {
            totalHitCount: 0,
            terminalBounceCount: 0,
            fromNodes: [] as string[],
          }
        )

      diagnostics.push({
        query: identifier,
        matched: true,
        node: nodeName,
        occurrences: nodeRows.length,
        spanMs,
        failedNodeCount,
        failedRecoCount,
        successRecoCount,
        topFailedRecognition: Array.from(recoStats.entries())
          .map(([name, stat]) => ({
            name,
            failed: stat.failed,
            success: stat.success,
            total: stat.total,
          }))
          .filter(item => item.failed > 0)
          .sort((a, b) => {
            if (b.failed !== a.failed) return b.failed - a.failed
            return b.total - a.total
          })
          .slice(0, 6),
        jumpBackCandidates,
        actionKinds: Array.from(actionKindStats.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4),
        nestedActionGroupCount,
        nestedActionNodeCount,
        nestedActionFailedNodeCount,
        nestedRecognitionInActionCount,
        nestedRecognitionNodeTopNames: toTopNameCounts(nestedRecognitionNodeNames, 6),
        hitAsJumpBackTargetTotalCount: hitAsJumpBackTargetStats.totalHitCount,
        hitAsJumpBackTargetTerminalBounceCount: hitAsJumpBackTargetStats.terminalBounceCount,
        hitAsJumpBackTargetFromNodes: Array.from(new Set(hitAsJumpBackTargetStats.fromNodes.filter(Boolean))).slice(0, 6),
      })
    }
  }

  return diagnostics.slice(0, 8)
}

const buildNestedActionDiagnostics = (
  task: TaskInfo | null,
  jumpBackFlowDiagnostics?: ReturnType<typeof buildJumpBackFlowDiagnostics>
) => {
  if (!task) {
    return {
      parentNodeWithNestedCount: 0,
      parentNodeWithNestedFailureCount: 0,
      nestedGroupCount: 0,
      nestedGroupFailedCount: 0,
      nestedActionCount: 0,
      nestedActionFailedCount: 0,
      topParentNodes: [] as Array<{
        node: string
        nodeId: number
        ts: string
        nestedGroupCount: number
        nestedGroupFailedCount: number
        nestedActionCount: number
        nestedActionFailedCount: number
        upstreamJumpBackHitCount: number
        upstreamJumpBackTerminalBounceCount: number
        upstreamJumpBackSources: Array<{ fromNode: string; hitCount: number; terminalBounceCount: number }>
        topFailedNestedActionNames: Array<{ name: string; count: number }>
      }>,
      summary: '当前任务无 nested action 数据。',
    }
  }

  const withNested = task.nodes.filter(node => buildNodeActionFlowView(node).taskItems.length > 0)
  const pairStats = Array.isArray(jumpBackFlowDiagnostics?.pairStats)
    ? jumpBackFlowDiagnostics.pairStats as Array<Record<string, unknown>>
    : []

  const toNonEmpty = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  const resolveDirectParentName = (node: NodeInfo): string => {
    const actionName = toNonEmpty(node.action_details?.name)
    if (actionName) return actionName
    const actionKind = toNonEmpty(node.action_details?.action)
    if (actionKind) return actionKind
    return toNonEmpty(node.name) || 'unknown'
  }

  const byParent: Array<{
    node: string
    nodeId: number
    ts: string
    nestedGroupCount: number
    nestedGroupFailedCount: number
    nestedActionCount: number
    nestedActionFailedCount: number
    upstreamJumpBackHitCount: number
    upstreamJumpBackTerminalBounceCount: number
    upstreamJumpBackSources: Array<{ fromNode: string; hitCount: number; terminalBounceCount: number }>
    topFailedNestedActionNames: Array<{ name: string; count: number }>
  }> = []

  let nestedGroupCount = 0
  let nestedGroupFailedCount = 0
  let nestedActionCount = 0
  let nestedActionFailedCount = 0

  for (const node of withNested) {
    const actionFlowView = buildNodeActionFlowView(node)
    const groups = actionFlowView.taskItems
    const nestedActions = actionFlowView.nestedPipelineItems
    let groupFailed = groups.filter(group => group.status === 'failed').length
    let actionCount = nestedActions.length
    let actionFailed = nestedActions.filter(action => action.status === 'failed').length
    const failedNames: string[] = []

    nestedGroupCount += groups.length
    nestedGroupFailedCount += groupFailed
    nestedActionCount += actionCount
    nestedActionFailedCount += actionFailed
    for (const action of nestedActions) {
      if (action.status === 'failed' && action.name) {
        failedNames.push(action.name)
      }
    }

    if (groupFailed > 0 || actionFailed > 0) {
      const directParentName = resolveDirectParentName(node)
      const upstreamSources = pairStats
        .filter(item => String(item.hitCandidate ?? '') === directParentName || String(item.hitCandidate ?? '') === node.name)
        .map(item => ({
          fromNode: String(item.startNode ?? ''),
          hitCount: Number(item.totalHitCount ?? 0),
          terminalBounceCount: Number(item.terminalBounceCount ?? 0),
        }))
        .filter(item => item.fromNode)
        .sort((a, b) => {
          if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount
          return b.terminalBounceCount - a.terminalBounceCount
        })
        .slice(0, 6)
      const upstreamHitCount = upstreamSources.reduce((sum, item) => sum + item.hitCount, 0)
      const upstreamTerminalBounceCount = upstreamSources.reduce((sum, item) => sum + item.terminalBounceCount, 0)
      byParent.push({
        node: directParentName,
        nodeId: node.node_id,
        ts: node.ts,
        nestedGroupCount: groups.length,
        nestedGroupFailedCount: groupFailed,
        nestedActionCount: actionCount,
        nestedActionFailedCount: actionFailed,
        upstreamJumpBackHitCount: upstreamHitCount,
        upstreamJumpBackTerminalBounceCount: upstreamTerminalBounceCount,
        upstreamJumpBackSources: upstreamSources,
        topFailedNestedActionNames: toTopNameCounts(failedNames, 4),
      })
    }
  }

  byParent.sort((a, b) => {
    if (b.nestedActionFailedCount !== a.nestedActionFailedCount) return b.nestedActionFailedCount - a.nestedActionFailedCount
    if (b.nestedGroupFailedCount !== a.nestedGroupFailedCount) return b.nestedGroupFailedCount - a.nestedGroupFailedCount
    return b.nestedActionCount - a.nestedActionCount
  })

  return {
    parentNodeWithNestedCount: withNested.length,
    parentNodeWithNestedFailureCount: byParent.length,
    nestedGroupCount,
    nestedGroupFailedCount,
    nestedActionCount,
    nestedActionFailedCount,
    topParentNodes: byParent.slice(0, 10),
    summary:
      nestedActionFailedCount > 0
        ? `检测到 nested action 失败 ${nestedActionFailedCount} 次（直接父节点 ${byParent.length} 个），主要集中在 ${byParent[0]?.node || 'unknown'}。` +
          (byParent[0]?.upstreamJumpBackSources?.[0]?.fromNode
            ? ` 典型链路为 ${byParent[0].upstreamJumpBackSources[0].fromNode} -> ${byParent[0].node}（jump_back 命中后进入）。`
            : '')
        : withNested.length > 0
          ? `存在 nested action（父节点 ${withNested.length} 个），但未检测到失败。`
          : '当前任务无 nested action 数据。',
  }
}

const collectFailureNodes = (task: TaskInfo | null, limit = 0) => {
  if (!task) return []

  const rows: Array<Record<string, unknown>> = []
  for (const node of task.nodes) {
    const nodeRecognitions = buildNodeRecognitionAttempts(node)
    let reason = ''
    if (node.status === 'failed') {
      reason = 'node_failed'
    } else if (nodeRecognitions.some(item => item.status === 'failed')) {
      reason = 'recognition_failed'
    }

    if (!reason) continue

    const lastReco = [...nodeRecognitions].reverse().find(item => item.status === 'failed')
    rows.push({
      node_id: node.node_id,
      node: node.name,
      ts: node.ts,
      status: node.status,
      reason,
      reco: lastReco ? { name: lastReco.name, reco_id: lastReco.reco_id, status: lastReco.status } : null,
      next_list: node.next_list.map(item => ({
        name: item.name,
        anchor: item.anchor,
        jump_back: item.jump_back,
      })),
    })

    if (limit > 0 && rows.length >= limit) break
  }

  return rows
}

const forEachLine = (content: string, onLine: (line: string, lineNo: number) => boolean | void) => {
  let cursor = 0
  let lineNo = 1
  while (cursor <= content.length) {
    const lf = content.indexOf('\n', cursor)
    let raw: string
    if (lf < 0) {
      raw = content.slice(cursor)
      cursor = content.length + 1
    } else {
      raw = content.slice(cursor, lf)
      cursor = lf + 1
    }
    if (raw.endsWith('\r')) {
      raw = raw.slice(0, -1)
    }
    const shouldContinue = onLine(raw, lineNo)
    if (shouldContinue === false) break
    lineNo += 1
    if (lf < 0) break
  }
}

const collectSignalLines = (target: AiLoadedTarget, maxHits = 24, maxOutput = 60): SignalLineItem[] => {
  // Avoid split(/\r?\n/) on very large logs: it creates massive transient strings.
  const hitLines: number[] = []
  forEachLine(target.content, (line, lineNo) => {
    if (/\[(ERR|WRN)\]/.test(line)) {
      hitLines.push(lineNo)
      if (hitLines.length > maxHits) {
        hitLines.shift()
      }
    }
  })

  if (hitLines.length === 0) return []

  const neededLines = new Set<number>()
  for (const lineNo of hitLines) {
    if (lineNo > 1) neededLines.add(lineNo - 1)
    neededLines.add(lineNo)
    neededLines.add(lineNo + 1)
  }

  const output: SignalLineItem[] = []
  forEachLine(target.content, (line, lineNo) => {
    if (!neededLines.has(lineNo)) return
    output.push({
      line: lineNo,
      text: truncate(line),
    })
    if (output.length >= maxOutput) {
      return false
    }
  })

  return output
}

const normalizeKnowledgeToken = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

const pushKnowledgeToken = (
  token: unknown,
  output: string[],
  seen: Set<string>,
  maxCount = 64
) => {
  if (output.length >= maxCount) return
  const normalized = normalizeKnowledgeToken(token)
  if (!normalized) return
  const key = normalized.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  output.push(normalized)
}

const buildKnowledgeTokens = (question: string, task: TaskInfo | null): string[] => {
  const tokens: string[] = []
  const seen = new Set<string>()

  pushKnowledgeToken(question, tokens, seen)

  if (!task) return tokens

  pushKnowledgeToken(task.entry, tokens, seen)

  const recentEvents = task.events.slice(-160)
  for (const event of recentEvents) {
    if (
      event.message.includes('Failed')
      || event.message.includes('on_error')
      || event.message.includes('Jump')
      || event.message.includes('Stop')
    ) {
      pushKnowledgeToken(event.message, tokens, seen)
      pushKnowledgeToken(event.details?.name as string | undefined, tokens, seen)
      pushKnowledgeToken(event.details?.entry as string | undefined, tokens, seen)
      pushKnowledgeToken(event.details?.action as string | undefined, tokens, seen)
    }
    if (tokens.length >= 64) break
  }

  if (task) {
    for (const node of task.nodes) {
      if (node.status === 'failed') {
        pushKnowledgeToken(node.name, tokens, seen)
        pushKnowledgeToken(node.action_details?.name, tokens, seen)
        pushKnowledgeToken(node.action_details?.action, tokens, seen)
        for (const nextItem of node.next_list) {
          if (nextItem.jump_back || nextItem.anchor) {
            pushKnowledgeToken(nextItem.name, tokens, seen)
          }
        }
      }
      for (const attempt of buildNodeRecognitionAttempts(node)) {
        if (attempt.status === 'failed') {
          pushKnowledgeToken(attempt.name, tokens, seen)
          pushKnowledgeToken(attempt.reco_details?.algorithm, tokens, seen)
        }
      }
      if (tokens.length >= 64) break
    }
  }

  return tokens
}

const buildRelatedMatchTerms = (knowledgeTokens: string[]): string[] => {
  const terms: string[] = []
  const seen = new Set<string>()

  const push = (value: unknown) => {
    if (terms.length >= 64) return
    const normalized = normalizeKnowledgeToken(value).toLowerCase()
    if (!normalized || normalized.length < 2) return
    if (seen.has(normalized)) return
    seen.add(normalized)
    terms.push(normalized)
  }

  for (const token of knowledgeTokens) {
    push(token)
    for (const piece of token.split(/[^A-Za-z0-9_\u4e00-\u9fff.-]+/).filter(Boolean)) {
      push(piece)
    }
  }

  return terms
}

const scoreTextByTerms = (
  text: string,
  terms: string[],
  exactWeight = 8,
  includeWeight = 3,
  scoreCap = 120
): number => {
  if (!text || terms.length === 0) return 0
  const normalized = text.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (!term) continue
    if (normalized === term) {
      score += exactWeight
      continue
    }
    if (normalized.includes(term)) {
      score += includeWeight
    }
    if (score >= scoreCap) return scoreCap
  }
  return score
}

const selectRelevantTimelineItems = (
  timeline: TimelineNodeItem[],
  terms: string[],
  selectedNode: NodeInfo | null | undefined,
  maxItems = 140
): TimelineNodeItem[] => {
  if (timeline.length === 0) return []
  const total = timeline.length
  const selectedNodeName = selectedNode?.name ?? ''
  const selectedNodeId = selectedNode?.node_id ?? -1

  const ranked = timeline.map((item, index) => {
    const matchText = [
      item.name,
      item.action,
      item.actionName,
      ...item.recognition.map(rec => rec.name),
      ...item.next_list.map(next => next.name),
      ...item.nestedActionTopNames.map(n => n.name),
      ...item.nestedRecognitionTopNames.map(n => n.name),
    ].join(' ')

    let score = 0
    score += scoreTextByTerms(matchText, terms, 14, 5, 140)
    if (item.status === 'failed') score += 48
    if (item.recognition.some(rec => rec.status === 'failed')) score += 24
    if (selectedNodeId > 0 && item.node_id === selectedNodeId) score += 120
    else if (selectedNodeName && item.name === selectedNodeName) score += 34
    score += Math.floor((index / Math.max(1, total)) * 26)
    return { index, score }
  })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.index - a.index
    })

  const limit = Math.min(maxItems, timeline.length)
  const selectedIndexes = new Set<number>(ranked.slice(0, limit).map(item => item.index))
  for (let i = Math.max(0, timeline.length - 8); i < timeline.length; i += 1) {
    if (selectedIndexes.size >= limit) break
    selectedIndexes.add(i)
  }

  return Array.from(selectedIndexes)
    .sort((a, b) => a - b)
    .map(index => timeline[index])
}

const selectRelevantEvents = (
  events: EventNotification[],
  terms: string[],
  selectedNode: NodeInfo | null | undefined,
  maxItems = 220
): Array<ReturnType<typeof summarizeEvent>> => {
  if (events.length === 0) return []
  const pool = events.slice(-1500)
  const total = pool.length
  const selectedNodeName = selectedNode?.name ?? ''

  const ranked = pool.map((event, index) => {
    const details = event.details ?? {}
    const detailName = typeof details.name === 'string' ? details.name : ''
    const text = [
      event.message,
      detailName,
      typeof details.entry === 'string' ? details.entry : '',
      typeof details.action === 'string' ? details.action : '',
      typeof details.reason === 'string' ? details.reason : '',
      typeof details.error === 'string' ? details.error : '',
    ].join(' ')

    let score = 0
    score += scoreTextByTerms(text, terms, 12, 4, 120)
    if (event.message.includes('Failed')) score += 44
    if (event.level === 'ERR') score += 38
    if (event.level === 'WRN') score += 26
    if (selectedNodeName && detailName === selectedNodeName) score += 46
    score += Math.floor((index / Math.max(1, total)) * 22)
    return { index, score }
  })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.index - a.index
    })

  const limit = Math.min(maxItems, pool.length)
  const selectedIndexes = new Set<number>(ranked.slice(0, limit).map(item => item.index))
  for (let i = Math.max(0, pool.length - 12); i < pool.length; i += 1) {
    if (selectedIndexes.size >= limit) break
    selectedIndexes.add(i)
  }

  return Array.from(selectedIndexes)
    .sort((a, b) => a - b)
    .map(index => summarizeEvent(pool[index]))
}

const selectRelevantFailureRows = (
  rows: Array<Record<string, unknown>>,
  terms: string[],
  selectedNode: NodeInfo | null | undefined,
  maxItems = 96
): Array<Record<string, unknown>> => {
  if (rows.length === 0) return []
  const selectedNodeName = selectedNode?.name ?? ''

  return rows
    .map((row, index) => {
      const nodeName = typeof row.node === 'string' ? row.node : ''
      const reason = typeof row.reason === 'string' ? row.reason : ''
      const recoName = typeof (row.reco as Record<string, unknown> | null)?.name === 'string'
        ? String((row.reco as Record<string, unknown>).name)
        : ''
      const text = [nodeName, reason, recoName].join(' ')

      let score = 0
      score += scoreTextByTerms(text, terms, 14, 5, 120)
      if (reason === 'node_failed') score += 40
      else if (reason === 'recognition_failed') score += 22
      if (selectedNodeName && nodeName === selectedNodeName) score += 52
      score += Math.floor((index / Math.max(1, rows.length)) * 14)
      return { row, score, index }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.index - a.index
    })
    .slice(0, Math.min(maxItems, rows.length))
    .map(item => item.row)
}

const selectRelevantSignalLines = (
  lines: SignalLineItem[],
  terms: string[],
  maxItems = 220
): SignalLineItem[] => {
  if (lines.length === 0) return []
  const total = lines.length

  return lines
    .map((item, index) => {
      let score = scoreTextByTerms(item.text, terms, 12, 4, 120)
      if (/\[(ERR|WRN)\]/.test(item.text)) score += 18
      if (/Failed|failed|timeout|on_error|jump_back/.test(item.text)) score += 12
      score += Math.floor((index / Math.max(1, total)) * 8)
      return { item, score, index }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.index - a.index
    })
    .slice(0, Math.min(maxItems, lines.length))
    .sort((a, b) => a.index - b.index)
    .map(entry => entry.item)
}

const buildKnowledgeDigest = (knowledgeTokens: string[]) => {
  const tokens = knowledgeTokens.slice(0, 48)
  const query = tokens.join(' ')
  const digest = searchKnowledge(query, 12).map(card => ({
    id: card.id,
    topic: card.topic,
    title: card.title,
    rule: card.rule,
    keywords: card.keywords.slice(0, 8),
    details: card.details.slice(0, 2),
    evidence: card.evidence.slice(0, 3),
  }))

  for (const cardId of ALWAYS_INCLUDE_KNOWLEDGE_CARD_IDS) {
    const card = getKnowledgeCard(cardId)
    if (!card) continue
    if (digest.some(item => item.id === card.id)) continue
    digest.unshift({
      id: card.id,
      topic: card.topic,
      title: card.title,
      rule: card.rule,
      keywords: card.keywords.slice(0, 8),
      details: card.details.slice(0, 2),
      evidence: card.evidence.slice(0, 3),
    })
  }

  return digest
}

const buildKnowledgeBootstrap = (knowledgeTokens: string[]) => {
  const query = knowledgeTokens.slice(0, 48).join(' ')
  const ranked = query ? searchKnowledge(query, maaKnowledgePack.cards.length) : []
  const rankedIds = new Set(ranked.map(card => card.id))
  const ordered = [
    ...ranked,
    ...maaKnowledgePack.cards.filter(card => !rankedIds.has(card.id)),
  ]

  return ordered.map(card => ({
    id: card.id,
    topic: card.topic,
    title: card.title,
    rule: card.rule,
    keywords: card.keywords.slice(0, 6),
    evidence: card.evidence.slice(0, 2),
  }))
}

const toTimestampMs = (timestamp: string): number | null => {
  if (!timestamp) return null
  const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T')
  const value = new Date(normalized).getTime()
  return Number.isNaN(value) ? null : value
}

const extractRecoId = (text: string): number | null => {
  const match = text.match(/reco_id[=:" ]+(\d+)/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

const buildTimelineDiagnostics = (timeline: TimelineNodeItem[]) => {
  const byNodeName = new Map<string, {
    name: string
    occurrences: number
    firstTs: number | null
    lastTs: number | null
    failedRecoCount: number
    successRecoCount: number
    failedNodeCount: number
    jumpBackBranches: number
    totalBranches: number
    terminalCount: number
  }>()

  const recoByName = new Map<string, {
    name: string
    total: number
    failed: number
    success: number
    nodes: Set<string>
  }>()

  const failedRecoByNodeAndName = new Map<string, {
    node: string
    reco: string
    failed: number
    total: number
  }>()

  const recoIdToName = new Map<number, string>()

  for (const node of timeline) {
    const ts = toTimestampMs(node.ts)
    const nodeStats = byNodeName.get(node.name) ?? {
      name: node.name,
      occurrences: 0,
      firstTs: ts,
      lastTs: ts,
      failedRecoCount: 0,
      successRecoCount: 0,
      failedNodeCount: 0,
      jumpBackBranches: 0,
      totalBranches: 0,
      terminalCount: 0,
    }

    nodeStats.occurrences += 1
    if (ts != null) {
      if (nodeStats.firstTs == null || ts < nodeStats.firstTs) nodeStats.firstTs = ts
      if (nodeStats.lastTs == null || ts > nodeStats.lastTs) nodeStats.lastTs = ts
    }

    if (node.status === 'failed') nodeStats.failedNodeCount += 1
    nodeStats.totalBranches += node.next_list.length
    nodeStats.jumpBackBranches += node.next_list.filter(item => item.jump_back).length
    if (node.next_list.length === 0) nodeStats.terminalCount += 1

    for (const reco of node.recognition) {
      if (reco.status === 'failed') nodeStats.failedRecoCount += 1
      if (reco.status === 'success') nodeStats.successRecoCount += 1
      recoIdToName.set(reco.reco_id, reco.name)

      const recoStats = recoByName.get(reco.name) ?? {
        name: reco.name,
        total: 0,
        failed: 0,
        success: 0,
        nodes: new Set<string>(),
      }

      recoStats.total += 1
      if (reco.status === 'failed') recoStats.failed += 1
      if (reco.status === 'success') recoStats.success += 1
      recoStats.nodes.add(node.name)
      recoByName.set(reco.name, recoStats)

      const pairKey = `${node.name}@@${reco.name}`
      const pairStats = failedRecoByNodeAndName.get(pairKey) ?? {
        node: node.name,
        reco: reco.name,
        failed: 0,
        total: 0,
      }
      pairStats.total += 1
      if (reco.status === 'failed') pairStats.failed += 1
      failedRecoByNodeAndName.set(pairKey, pairStats)
    }

    byNodeName.set(node.name, nodeStats)
  }

  const longStayNodes = Array.from(byNodeName.values())
    .map(item => {
      const spanMs = item.firstTs != null && item.lastTs != null ? Math.max(0, item.lastTs - item.firstTs) : 0
      return {
        node: item.name,
        occurrences: item.occurrences,
        spanMs,
        failedRecoCount: item.failedRecoCount,
        successRecoCount: item.successRecoCount,
        failedNodeCount: item.failedNodeCount,
        avgJumpBackBranches: item.totalBranches > 0 ? item.jumpBackBranches / item.occurrences : 0,
        terminalCount: item.terminalCount,
      }
    })
    .sort((a, b) => {
      if (b.spanMs !== a.spanMs) return b.spanMs - a.spanMs
      return b.occurrences - a.occurrences
    })

  const recoFailuresByName = Array.from(recoByName.values())
    .map(item => ({
      name: item.name,
      failed: item.failed,
      success: item.success,
      total: item.total,
      failedRate: item.total > 0 ? item.failed / item.total : 0,
      inNodes: Array.from(item.nodes).sort(),
    }))
    .sort((a, b) => {
      if (b.failed !== a.failed) return b.failed - a.failed
      return b.total - a.total
    })

  const hotspotRecoPairs = Array.from(failedRecoByNodeAndName.values())
    .map(item => ({
      node: item.node,
      reco: item.reco,
      failed: item.failed,
      total: item.total,
      failedRate: item.total > 0 ? item.failed / item.total : 0,
    }))
    .sort((a, b) => {
      if (b.failed !== a.failed) return b.failed - a.failed
      return b.total - a.total
    })

  const repeatedRuns: Array<{
    node: string
    count: number
    spanMs: number
    fromNodeId: number
    toNodeId: number
    fromTs: string
    toTs: string
  }> = []

  if (timeline.length > 0) {
    let runStart = 0
    for (let i = 1; i <= timeline.length; i += 1) {
      const same = i < timeline.length && timeline[i].name === timeline[runStart].name
      if (same) continue

      const runEnd = i - 1
      const count = runEnd - runStart + 1
      if (count >= 2) {
        const startTs = toTimestampMs(timeline[runStart].ts)
        const endTs = toTimestampMs(timeline[runEnd].ts)
        const spanMs = startTs != null && endTs != null ? Math.max(0, endTs - startTs) : 0
        repeatedRuns.push({
          node: timeline[runStart].name,
          count,
          spanMs,
          fromNodeId: timeline[runStart].node_id,
          toNodeId: timeline[runEnd].node_id,
          fromTs: timeline[runStart].ts,
          toTs: timeline[runEnd].ts,
        })
      }
      runStart = i
    }
  }

  repeatedRuns.sort((a, b) => {
    if (b.spanMs !== a.spanMs) return b.spanMs - a.spanMs
    return b.count - a.count
  })

  return {
    longStayNodes: longStayNodes.slice(0, 12),
    recoFailuresByName: recoFailuresByName.slice(0, 20),
    recoFailuresByNameAll: recoFailuresByName,
    repeatedRuns: repeatedRuns.slice(0, 12),
    hotspotRecoPairs: hotspotRecoPairs.slice(0, 20),
    recoIdToName,
  }
}

const buildFocusedSummary = (
  timeline: TimelineNodeItem[],
  failureRows: Array<Record<string, unknown>>,
  signalLines: SignalLineItem[],
  terms: string[]
) => {
  const failedNodes = timeline.filter(item => item.status === 'failed')
  const failedRecoCount = timeline.reduce(
    (sum, item) => sum + item.recognition.filter(rec => rec.status === 'failed').length,
    0
  )
  const jumpBackCount = timeline.reduce(
    (sum, item) => sum + item.next_list.filter(next => next.jump_back).length,
    0
  )

  const reasonStats = new Map<string, number>()
  for (const row of failureRows) {
    const reason = typeof row.reason === 'string' ? row.reason : 'unknown'
    reasonStats.set(reason, (reasonStats.get(reason) ?? 0) + 1)
  }

  const topFailedNodes = timeline
    .filter(item => item.status === 'failed')
    .reduce((map, item) => {
      map.set(item.name, (map.get(item.name) ?? 0) + 1)
      return map
    }, new Map<string, number>())

  const topFailedReco = timeline
    .flatMap(item => item.recognition.filter(rec => rec.status === 'failed'))
    .reduce((map, rec) => {
      map.set(rec.name, (map.get(rec.name) ?? 0) + 1)
      return map
    }, new Map<string, number>())

  const matchedSignalCount = signalLines.filter(item =>
    terms.some(term => term.length >= 2 && item.text.toLowerCase().includes(term))
  ).length

  return {
    timelineCount: timeline.length,
    failedNodeCount: failedNodes.length,
    failedRecoCount,
    jumpBackCandidateCount: jumpBackCount,
    failureCandidateCount: failureRows.length,
    signalLineCount: signalLines.length,
    signalLineMatchedByTerms: matchedSignalCount,
    topFailureReasons: Array.from(reasonStats.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
    topFailedNodes: Array.from(topFailedNodes.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    topFailedRecognition: Array.from(topFailedReco.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    matchTerms: terms.slice(0, 16),
  }
}

export const buildSignalDiagnostics = (
  lines: SignalLineItem[],
  recoIdToName: Map<number, string>,
  recoFailuresByName: Array<{ name: string; failed: number }>
) => {
  const failedRecoResultByName = new Map<string, number>()
  let unknownRecoNameCount = 0

  for (const item of lines) {
    if (!/failed to get_reco_result/i.test(item.text)) continue
    const recoId = extractRecoId(item.text)
    if (recoId == null) {
      unknownRecoNameCount += 1
      continue
    }

    const name = recoIdToName.get(recoId)
    if (!name) {
      unknownRecoNameCount += 1
      continue
    }

    failedRecoResultByName.set(name, (failedRecoResultByName.get(name) ?? 0) + 1)
  }

  const topFailedRecoResult = Array.from(failedRecoResultByName.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const timelineFailedMap = new Map<string, number>()
  for (const item of recoFailuresByName) {
    timelineFailedMap.set(item.name, item.failed)
  }

  const breakdownNames = new Set<string>([
    ...Array.from(timelineFailedMap.keys()),
    ...Array.from(failedRecoResultByName.keys()),
  ])

  const failureTypeBreakdown = Array.from(breakdownNames).map(name => {
    const totalFailed = timelineFailedMap.get(name) ?? 0
    const recoResultFailed = failedRecoResultByName.get(name) ?? 0
    const recognitionMissOrRuleFailed = Math.max(0, totalFailed - recoResultFailed)
    const dominantType = recoResultFailed > recognitionMissOrRuleFailed
      ? 'reco_result_fetch_failed'
      : recognitionMissOrRuleFailed > 0
        ? 'recognition_miss_or_rule_failed'
        : 'unknown'

    return {
      name,
      totalFailed,
      recoResultFailed,
      recognitionMissOrRuleFailed,
      dominantType,
    }
  }).sort((a, b) => {
    if (b.totalFailed !== a.totalFailed) return b.totalFailed - a.totalFailed
    return b.recoResultFailed - a.recoResultFailed
  })

  const totalRecoResultFailed = topFailedRecoResult.reduce((acc, item) => acc + item.count, 0)
  const totalTimelineFailed = recoFailuresByName.reduce((acc, item) => acc + item.failed, 0)
  const recoResultFailureRatio = totalTimelineFailed > 0 ? totalRecoResultFailed / totalTimelineFailed : 0

  return {
    failedRecoResultByName: topFailedRecoResult.slice(0, 20),
    failureTypeBreakdown: failureTypeBreakdown.slice(0, 24),
    totalRecoResultFailed,
    totalTimelineFailed,
    recoResultFailureRatio,
    unknownRecoNameCount,
    lineCount: lines.length,
  }
}

export const buildDeterministicFindings = (
  timelineDiagnostics: {
    longStayNodes: Array<{
      node: string
      occurrences: number
      spanMs: number
      failedRecoCount: number
      successRecoCount: number
      failedNodeCount?: number
      avgJumpBackBranches?: number
    }>
    repeatedRuns: Array<{
      node: string
      count: number
      spanMs: number
    }>
    hotspotRecoPairs: Array<{
      node: string
      reco: string
      failed: number
      total: number
      failedRate: number
    }>
  },
  signalDiagnostics: null | {
    failureTypeBreakdown: Array<{
      name: string
      totalFailed: number
      recoResultFailed: number
      recognitionMissOrRuleFailed: number
      dominantType: string
    }>
    recoResultFailureRatio: number
    totalRecoResultFailed: number
    totalTimelineFailed: number
  },
  behaviorContext?: {
    taskStatus?: 'running' | 'succeeded' | 'failed' | null
    pipelineFailedCount?: number
    actionFailureCount?: number
    actionFailureOnErrorChainCount?: number
    jumpBackHotNodes?: string[]
    stopTerminationDiagnostics?: ReturnType<typeof buildStopTerminationDiagnostics>
    nextCandidateAvailabilityDiagnostics?: ReturnType<typeof buildNextCandidateAvailabilityDiagnostics>
    anchorResolutionDiagnostics?: ReturnType<typeof buildAnchorResolutionDiagnostics>
    jumpBackFlowDiagnostics?: ReturnType<typeof buildJumpBackFlowDiagnostics>
    nestedActionDiagnostics?: ReturnType<typeof buildNestedActionDiagnostics>
  }
) => {
  const findings: Array<{
    id: string
    confidence: number
    causeType: 'loop_or_rule' | 'reco_result_fetch' | 'mixed'
    summary: string
    evidencePaths: string[]
  }> = []

  const unknowns: string[] = []
  const taskSucceededWithoutPipelineFailure = behaviorContext?.taskStatus === 'succeeded'
    && (behaviorContext.pipelineFailedCount ?? 0) === 0
  const actionFailureCount = behaviorContext?.actionFailureCount ?? 0
  const actionFailureOnErrorChainCount = behaviorContext?.actionFailureOnErrorChainCount ?? 0
  const jumpBackHotNodes = new Set(behaviorContext?.jumpBackHotNodes ?? [])
  const stopTerminationDiagnostics = behaviorContext?.stopTerminationDiagnostics
  const nextCandidateAvailabilityDiagnostics = behaviorContext?.nextCandidateAvailabilityDiagnostics
  const anchorResolutionDiagnostics = behaviorContext?.anchorResolutionDiagnostics
  const jumpBackFlowDiagnostics = behaviorContext?.jumpBackFlowDiagnostics
  const nestedActionDiagnostics = behaviorContext?.nestedActionDiagnostics

  const tuneLoopConfidence = (base: number, nodeName?: string) => {
    let next = base
    if (taskSucceededWithoutPipelineFailure) next -= 16
    if (nodeName && jumpBackHotNodes.has(nodeName)) next -= 12
    return Math.max(taskSucceededWithoutPipelineFailure ? 38 : 48, next)
  }

  const noHitFailureCount = nextCandidateAvailabilityDiagnostics?.failedTimeoutLikeCount ?? 0
  const nextWindowCount = nextCandidateAvailabilityDiagnostics?.windowCount ?? 0
  const partialMissRecoveredCount = nextCandidateAvailabilityDiagnostics?.recoveredAfterPartialMissCount ?? 0
  const noHitPressure = nextWindowCount > 0 ? noHitFailureCount / nextWindowCount : 0
  const partialRecoverPressure = nextWindowCount > 0 ? partialMissRecoveredCount / nextWindowCount : 0

  const loopCauseType: 'loop_or_rule' | 'mixed' = taskSucceededWithoutPipelineFailure ? 'mixed' : 'loop_or_rule'

  const topStay = timelineDiagnostics.longStayNodes[0]
  if (topStay) {
    const jumpBackHint = jumpBackHotNodes.has(topStay.node)
      ? ' 该节点包含 jump_back 分支，可能是预期回跳。'
      : ''
    const taskHint = taskSucceededWithoutPipelineFailure
      ? ' 任务整体成功且无节点失败，优先判定为现象而非根因。'
      : ''
    findings.push({
      id: 'long_stay_hotspot',
      confidence: tuneLoopConfidence(topStay.spanMs >= 30000 || topStay.occurrences >= 8 ? 80 : 68, topStay.node),
      causeType: loopCauseType,
      summary:
        `长停留热点节点 ${topStay.node}（occurrences=${topStay.occurrences}, spanMs=${topStay.spanMs}, failedReco=${topStay.failedRecoCount}）。` +
        taskHint +
        jumpBackHint,
      evidencePaths: ['timelineDiagnostics.longStayNodes[0]'],
    })
  } else {
    unknowns.push('longStayNodes 为空，无法识别长停留热点。')
  }

  const topPair = timelineDiagnostics.hotspotRecoPairs[0]
  if (topPair && topPair.failed > 0) {
    const jumpBackHint = jumpBackHotNodes.has(topPair.node)
      ? ' 节点存在 jump_back 候选，需先排除流程型回跳。'
      : ''
    const lowNoHitHint = noHitPressure <= 0.1 && partialRecoverPressure >= 0.2
      ? ' 但该任务“整轮无命中并失败”占比不高，更多是前段 miss 后恢复，不宜单独作为主因。'
      : ''
    findings.push({
      id: 'reco_pair_hotspot',
      confidence: tuneLoopConfidence(
        (topPair.failed >= 8 || topPair.failedRate >= 0.8 ? 82 : 70) - (lowNoHitHint ? 14 : 0),
        topPair.node
      ),
      causeType: loopCauseType,
      summary:
        `高失败识别对 ${topPair.node}/${topPair.reco}（failed=${topPair.failed}, total=${topPair.total}, failedRate=${topPair.failedRate.toFixed(3)}）。` +
        (taskSucceededWithoutPipelineFailure ? ' 任务仍成功，可能是可恢复识别抖动。' : '') +
        lowNoHitHint +
        jumpBackHint,
      evidencePaths: ['timelineDiagnostics.hotspotRecoPairs[0]'],
    })
  }

  const topRun = timelineDiagnostics.repeatedRuns[0]
  if (topRun) {
    const jumpBackHint = jumpBackHotNodes.has(topRun.node)
      ? ' 该节点可能通过 jump_back 回跳复检。'
      : ''
    findings.push({
      id: 'repeated_run_hotspot',
      confidence: tuneLoopConfidence(topRun.count >= 5 ? 78 : 64, topRun.node),
      causeType: loopCauseType,
      summary:
        `最长连续重复节点 ${topRun.node}（count=${topRun.count}, spanMs=${topRun.spanMs}）。` +
        (taskSucceededWithoutPipelineFailure ? ' 任务成功时该信号优先视为流程现象。' : '') +
        jumpBackHint,
      evidencePaths: ['timelineDiagnostics.repeatedRuns[0]'],
    })
  }

  if ((nextCandidateAvailabilityDiagnostics?.failedNoExecutableCount ?? 0) > 0) {
    const noExecutableCount = nextCandidateAvailabilityDiagnostics?.failedNoExecutableCount ?? 0
    const anchorCount = nextCandidateAvailabilityDiagnostics?.failedNoExecutableWithAnchorCount ?? 0
    findings.push({
      id: 'next_no_executable_candidate',
      confidence: anchorCount > 0 ? 86 : 76,
      causeType: 'loop_or_rule',
      summary:
        `检测到 ${noExecutableCount} 次 NextList 失败前无识别尝试（anchor 候选相关 ${anchorCount} 次），优先排查候选不可执行（锚点未解析/节点不可用）而非 timeout。`,
      evidencePaths: [
        'nextCandidateAvailabilityDiagnostics.failedNoExecutableCount',
        'nextCandidateAvailabilityDiagnostics.failedNoExecutableWithAnchorCount',
        'nextCandidateAvailabilityDiagnostics.suspiciousCases[0]',
      ],
    })
  }

  if (noHitFailureCount > 0) {
    findings.push({
      id: 'next_round_nohit_timeout',
      confidence: noHitPressure >= 0.2 ? 88 : noHitPressure >= 0.1 ? 80 : 72,
      causeType: 'loop_or_rule',
      summary:
        `检测到“整轮 next 候选均未命中并失败/超时” ${noHitFailureCount} 次（窗口总数 ${nextWindowCount}，占比 ${(noHitPressure * 100).toFixed(1)}%）。` +
        ' 该信号比“前几个候选未命中但后续命中”更能代表真实识别问题。',
      evidencePaths: [
        'nextCandidateAvailabilityDiagnostics.failedTimeoutLikeCount',
        'nextCandidateAvailabilityDiagnostics.windowCount',
        'nextCandidateAvailabilityDiagnostics.noHitFailureByNode[0]',
      ],
    })
  }

  if (partialMissRecoveredCount > 0) {
    findings.push({
      id: 'next_partial_miss_recovered',
      confidence: 58,
      causeType: 'mixed',
      summary:
        `存在 ${partialMissRecoveredCount} 次“前段候选未命中但后续命中恢复”的 NextList 轮次（占比 ${(partialRecoverPressure * 100).toFixed(1)}%）。` +
        ' 这类首轮 miss 通常属于流程现象，不宜直接判定为根因。',
      evidencePaths: [
        'nextCandidateAvailabilityDiagnostics.recoveredAfterPartialMissCount',
        'nextCandidateAvailabilityDiagnostics.partialMissRecoveredByNode[0]',
      ],
    })
  }

  if (stopTerminationDiagnostics?.likelyActiveStop) {
    const confidence = stopTerminationDiagnostics.confidence === 'high'
      ? 90
      : stopTerminationDiagnostics.confidence === 'medium'
        ? 78
        : 64
    const implicitHint = stopTerminationDiagnostics.implicitStopPatternDetected
      ? `，检测到隐式 stop 动作链（${stopTerminationDiagnostics.implicitStopActionName || 'unknown'}）`
      : ''
    findings.push({
      id: 'active_stop_termination',
      confidence,
      causeType: 'mixed',
      summary:
        `任务终态 ${stopTerminationDiagnostics.taskTerminalEvent} 且存在停止链路特征（stop 信号 ${stopTerminationDiagnostics.stopSignalCount} 条${implicitHint}，终态前 PipelineNode.Failed=${stopTerminationDiagnostics.pipelineFailedNearTerminal}），优先判定为主动停止流程。`,
      evidencePaths: [
        'stopTerminationDiagnostics.likelyActiveStop',
        'stopTerminationDiagnostics.stopSignalCount',
        'stopTerminationDiagnostics.implicitStopPatternDetected',
        'stopTerminationDiagnostics.pipelineFailedNearTerminal',
      ],
    })
  }

  if ((anchorResolutionDiagnostics?.unresolvedAnchorLikelyCount ?? 0) > 0) {
    findings.push({
      id: 'anchor_candidate_unresolved',
      confidence: 84,
      causeType: 'loop_or_rule',
      summary:
        `检测到 ${anchorResolutionDiagnostics?.unresolvedAnchorLikelyCount ?? 0} 次 anchor 候选未进入识别即 NextList 失败，优先排查锚点未解析或被清除。`,
      evidencePaths: [
        'anchorResolutionDiagnostics.unresolvedAnchorLikelyCount',
        'anchorResolutionDiagnostics.suspiciousCases[0]',
      ],
    })
  }

  if ((nestedActionDiagnostics?.nestedActionFailedCount ?? 0) > 0) {
    const topNode = nestedActionDiagnostics?.topParentNodes?.[0]
    const topNodeName = typeof topNode?.node === 'string' ? topNode.node : ''
    const topNodeFailed = typeof topNode?.nestedActionFailedCount === 'number' ? topNode.nestedActionFailedCount : 0
    const upstream = Array.isArray(topNode?.upstreamJumpBackSources) ? topNode.upstreamJumpBackSources[0] : null
    const upstreamFromNode = upstream && typeof upstream.fromNode === 'string' ? upstream.fromNode : ''
    const upstreamHitCount = upstream && typeof upstream.hitCount === 'number' ? upstream.hitCount : 0
    findings.push({
      id: 'nested_action_failure_hotspot',
      confidence: Math.max(
        actionFailureCount > 0 || actionFailureOnErrorChainCount > 0 ? 92 : 84,
        (nestedActionDiagnostics?.nestedActionFailedCount ?? 0) >= 8 ? 90 : 84
      ),
      causeType: 'loop_or_rule',
      summary:
        `检测到 nested/custom action 失败 ${(nestedActionDiagnostics?.nestedActionFailedCount ?? 0)} 次，涉及父节点 ${(nestedActionDiagnostics?.parentNodeWithNestedFailureCount ?? 0)} 个。` +
        (topNodeName ? ` 直接父节点热点为 ${topNodeName}（failed=${topNodeFailed}）。` : '') +
        (topNodeName && upstreamFromNode ? ` 上游链路主要是 ${upstreamFromNode} -> ${topNodeName}（hit=${upstreamHitCount}）。` : '') +
        ' 动作链失败通常不是正常现象，默认优先级高于“可恢复首轮 miss”。',
      evidencePaths: [
        'nestedActionDiagnostics.nestedActionFailedCount',
        'nestedActionDiagnostics.topParentNodes[0]',
        'jumpBackFlowDiagnostics.pairStats',
      ],
    })
  }

  if ((jumpBackFlowDiagnostics?.terminalBounceCount ?? 0) > 0) {
    const topCase = jumpBackFlowDiagnostics?.terminalBounceCases?.[0]
    const topStartNode = typeof topCase?.startNode === 'string' ? topCase.startNode : ''
    const topHitCandidate = typeof topCase?.hitCandidate === 'string' ? topCase.hitCandidate : ''
    const topCount = typeof topCase?.count === 'number' ? topCase.count : 0
    const baseConfidence = (jumpBackFlowDiagnostics?.terminalBounceCount ?? 0) >= 20
      ? 88
      : (jumpBackFlowDiagnostics?.terminalBounceCount ?? 0) >= 8
        ? 80
        : 68
    findings.push({
      id: 'jumpback_terminal_bounce_loop',
      confidence: tuneLoopConfidence(baseConfidence, topStartNode || undefined),
      causeType: loopCauseType,
      summary:
        `检测到 ${(jumpBackFlowDiagnostics?.terminalBounceCount ?? 0)} 条 jump_back“命中后回跳且命中节点疑似无后继”链路。` +
        (topCount > 0
          ? ` 高频组合为 ${topStartNode || 'unknown'} -> ${topHitCandidate || 'unknown'}（count=${topCount}）。`
          : '') +
        (taskSucceededWithoutPipelineFailure ? ' 在任务成功场景下更可能是流程耗时放大点。' : ' 这类链路容易导致同一父节点长时间复检。'),
      evidencePaths: [
        'jumpBackFlowDiagnostics.terminalBounceCount',
        'jumpBackFlowDiagnostics.terminalBounceCases[0]',
      ],
    })
  }

  if ((jumpBackFlowDiagnostics?.hitThenFailedNoReturnCount ?? 0) > 0) {
    const confidence = taskSucceededWithoutPipelineFailure ? 64 : 76
    findings.push({
      id: 'jumpback_hit_failed_no_return',
      confidence,
      causeType: taskSucceededWithoutPipelineFailure ? 'mixed' : 'loop_or_rule',
      summary:
        `检测到 ${jumpBackFlowDiagnostics?.hitThenFailedNoReturnCount ?? 0} 条 jump_back“命中后失败且未回跳”链路，需结合 on_error 判断是否属于错误路径下的预期不回跳。`,
      evidencePaths: [
        'jumpBackFlowDiagnostics.hitThenFailedNoReturnCount',
        'jumpBackFlowDiagnostics.suspiciousCases[0]',
      ],
    })
  }

  if (signalDiagnostics) {
    const ratio = signalDiagnostics.recoResultFailureRatio
    findings.push({
      id: 'reco_result_fetch_ratio',
      confidence: ratio >= 0.25 ? 84 : 58,
      causeType: ratio >= 0.25 ? 'reco_result_fetch' : 'mixed',
      summary: `failed_to_get_reco_result 占比 ${(ratio * 100).toFixed(1)}%（${signalDiagnostics.totalRecoResultFailed}/${signalDiagnostics.totalTimelineFailed || 0}）。`,
      evidencePaths: [
        'signalDiagnostics.recoResultFailureRatio',
        'signalDiagnostics.totalRecoResultFailed',
        'signalDiagnostics.totalTimelineFailed',
      ],
    })

    const topType = signalDiagnostics.failureTypeBreakdown[0]
    if (topType) {
      findings.push({
        id: 'top_failure_type',
        confidence: 74,
        causeType: topType.dominantType === 'reco_result_fetch_failed' ? 'reco_result_fetch' : 'loop_or_rule',
        summary: `失败热点识别项 ${topType.name}（total=${topType.totalFailed}, reco_result_failed=${topType.recoResultFailed}, recognition_miss_or_rule_failed=${topType.recognitionMissOrRuleFailed}）。`,
        evidencePaths: ['signalDiagnostics.failureTypeBreakdown[0]'],
      })
    }
  } else {
    unknowns.push('未注入 signalLines，无法判定失败分型占比。')
  }

  return {
    findings,
    unknowns,
  }
}
export function buildAiAnalysisContext(input: BuildAiContextInput): Record<string, unknown> {
  const selectedTask = input.selectedTask
  const selectedNodeFocus = buildSelectedNodeFocus(input.selectedNode, input.selectedFlowItemId)

  const taskOverview = input.tasks.slice(-16).map(task => ({
    task_id: task.task_id,
    entry: task.entry,
    status: task.status,
    duration: task.duration,
    nodeCount: task.nodes.length,
    start: task.start_time,
    end: task.end_time,
  }))

  const selectedTaskSummary = selectedTask
    ? {
        task_id: selectedTask.task_id,
        entry: selectedTask.entry,
        status: selectedTask.status,
        duration: selectedTask.duration,
        nodeCount: selectedTask.nodes.length,
        start: selectedTask.start_time,
        end: selectedTask.end_time,
      }
    : null

  const fullTaskTimeline: TimelineNodeItem[] = selectedTask
    ? selectedTask.nodes.map(node => ({
      ...(() => {
        const actionFlowView = buildNodeActionFlowView(node)
        const nestedActions = actionFlowView.nestedPipelineItems
        const nestedRecognitionNodes = actionFlowView.actionLevelRecognitionItems
        const nestedActionNames = nestedActions.map(item => item.name).filter(Boolean) as string[]
        const nestedRecognitionNames = [
          ...actionFlowView.nestedRecognitionItems.map(item => item.name).filter(Boolean),
          ...nestedRecognitionNodes.map(item => item.name).filter(Boolean),
        ]
        return {
          action: node.action_details?.action || '',
          actionName: node.action_details?.name || '',
          nestedActionGroupCount: actionFlowView.taskItems.length,
          nestedActionNodeCount: nestedActions.length,
          nestedActionFailedNodeCount: nestedActions.filter(item => item.status === 'failed').length,
          nestedRecognitionInActionCount: actionFlowView.nestedRecognitionItems.length + nestedRecognitionNodes.length,
          nestedActionTopNames: toTopNameCounts(nestedActionNames),
          nestedRecognitionTopNames: toTopNameCounts(nestedRecognitionNames),
        }
      })(),
      node_id: node.node_id,
      name: node.name,
      status: node.status,
      ts: node.ts,
      recognition: buildNodeRecognitionAttempts(node).map(item => ({
        reco_id: item.reco_id,
        name: item.name,
        status: item.status,
      })),
      next_list: node.next_list.map(item => ({
        name: item.name,
        anchor: item.anchor,
        jump_back: item.jump_back,
      })),
    }))
    : []

  const knowledgeTokens = buildKnowledgeTokens(input.question, selectedTask)
  const relatedMatchTerms = buildRelatedMatchTerms(knowledgeTokens)

  const selectedNodeTimelineFull = selectRelevantTimelineItems(
    fullTaskTimeline,
    relatedMatchTerms,
    input.selectedNode,
    140
  )
  const selectedEventTailFull = selectedTask
    ? selectRelevantEvents(selectedTask.events, relatedMatchTerms, input.selectedNode, 180)
    : []

  const failureRowsFull = collectFailureNodes(selectedTask, 0)
  const failureCandidatesFull = selectRelevantFailureRows(
    failureRowsFull,
    relatedMatchTerms,
    input.selectedNode,
    96
  )

  const bestTarget = input.includeSignalLines ? pickBestTarget(input.loadedTargets ?? [], input.loadedDefaultTargetId) : null
  const rawSignalLineItems = bestTarget ? collectSignalLines(bestTarget, 96, 260) : []
  const signalLineItemsFull = selectRelevantSignalLines(rawSignalLineItems, relatedMatchTerms, 220)

  const timelineDiagnostics = buildTimelineDiagnostics(fullTaskTimeline)
  const focusedTimelineDiagnostics = buildTimelineDiagnostics(selectedNodeTimelineFull)
  const signalDiagnostics = bestTarget
    ? buildSignalDiagnostics(signalLineItemsFull, timelineDiagnostics.recoIdToName, timelineDiagnostics.recoFailuresByNameAll)
    : null
  const eventChainDiagnostics = buildEventChainDiagnostics(selectedTask?.events ?? [])
  const stopTerminationDiagnostics = buildStopTerminationDiagnostics(selectedTask?.events ?? [], selectedTask?.status ?? null)
  const nextCandidateAvailabilityDiagnostics = buildNextCandidateAvailabilityDiagnostics(selectedTask?.events ?? [])
  const anchorResolutionDiagnostics = buildAnchorResolutionDiagnostics(selectedTask?.events ?? [])
  const jumpBackFlowDiagnostics = buildJumpBackFlowDiagnostics(selectedTask?.events ?? [])
  const nestedActionDiagnostics = buildNestedActionDiagnostics(selectedTask, jumpBackFlowDiagnostics)
  const questionNodeDiagnostics = buildQuestionNodeDiagnostics(input.question, selectedTask, jumpBackFlowDiagnostics)
  const pipelineFailedCount = fullTaskTimeline.filter(item => item.status === 'failed').length
  const pipelineFailedCountFocused = selectedNodeTimelineFull.filter(item => item.status === 'failed').length
  const jumpBackHotNodes = timelineDiagnostics.longStayNodes
    .filter(item => (item.avgJumpBackBranches ?? 0) > 0)
    .map(item => item.node)
  const jumpBackHotNodesFocused = focusedTimelineDiagnostics.longStayNodes
    .filter(item => (item.avgJumpBackBranches ?? 0) > 0)
    .map(item => item.node)
  const useFocusedDeterministic = selectedNodeTimelineFull.length >= Math.min(28, Math.max(12, Math.floor(fullTaskTimeline.length * 0.3)))
  const deterministicTimelineSource = useFocusedDeterministic ? focusedTimelineDiagnostics : timelineDiagnostics
  const deterministicPipelineFailedCount = useFocusedDeterministic ? pipelineFailedCountFocused : pipelineFailedCount
  const deterministicJumpBackHotNodes = useFocusedDeterministic ? jumpBackHotNodesFocused : jumpBackHotNodes

  const deterministicFindings = buildDeterministicFindings(
    {
      longStayNodes: deterministicTimelineSource.longStayNodes,
      repeatedRuns: deterministicTimelineSource.repeatedRuns,
      hotspotRecoPairs: deterministicTimelineSource.hotspotRecoPairs,
    },
    signalDiagnostics,
    {
      taskStatus: selectedTask?.status ?? null,
      pipelineFailedCount: deterministicPipelineFailedCount,
      actionFailureCount: eventChainDiagnostics.messageCounts.actionFailed,
      actionFailureOnErrorChainCount: eventChainDiagnostics.onErrorChains.filter(item => item.triggerType === 'action_failed').length,
      jumpBackHotNodes: deterministicJumpBackHotNodes,
      stopTerminationDiagnostics,
      nextCandidateAvailabilityDiagnostics,
      anchorResolutionDiagnostics,
      jumpBackFlowDiagnostics,
      nestedActionDiagnostics,
    }
  )

  const knowledgeFull = !input.includeKnowledgePack
    ? []
    : input.includeKnowledgeBootstrap
      ? buildKnowledgeBootstrap(knowledgeTokens)
      : buildKnowledgeDigest(knowledgeTokens)
  const relatedExtraction = {
    matchTerms: relatedMatchTerms.slice(0, 24),
    timelineScope: fullTaskTimeline.length,
    timelinePicked: selectedNodeTimelineFull.length,
    eventScope: selectedTask?.events.length ?? 0,
    eventPicked: selectedEventTailFull.length,
    failureScope: failureRowsFull.length,
    failurePicked: failureCandidatesFull.length,
    signalScope: rawSignalLineItems.length,
    signalPicked: signalLineItemsFull.length,
    deterministicScope: useFocusedDeterministic ? 'focused' : 'global',
  }
  const questionFocusedSummary = buildFocusedSummary(
    selectedNodeTimelineFull,
    failureCandidatesFull,
    signalLineItemsFull,
    relatedMatchTerms
  )
  const knowledgeMeta = {
    enabled: input.includeKnowledgePack,
    mode: input.includeKnowledgeBootstrap ? 'bootstrap' : 'digest',
    queryTokens: knowledgeTokens.slice(0, 24),
    totalMatched: knowledgeFull.length,
  }

  const contextTargetChars = 52000
  const slicePlan = {
    nodeLimit: Math.min(selectedNodeTimelineFull.length, 96),
    eventLimit: Math.min(selectedEventTailFull.length, 52),
    failureLimit: Math.min(failureCandidatesFull.length, 32),
    signalLimit: Math.min(signalLineItemsFull.length, 70),
    knowledgeLimit: Math.min(knowledgeFull.length, 18),
  }
  const sliceMin = {
    nodeLimit: Math.min(selectedNodeTimelineFull.length, 18),
    eventLimit: Math.min(selectedEventTailFull.length, 10),
    failureLimit: Math.min(failureCandidatesFull.length, 8),
    signalLimit: Math.min(signalLineItemsFull.length, 18),
    knowledgeLimit: Math.min(knowledgeFull.length, 4),
  }

  const applySlicePlan = () => ({
    selectedNodeTimeline: selectedNodeTimelineFull.slice(0, slicePlan.nodeLimit),
    selectedEventTail: selectedEventTailFull.slice(0, slicePlan.eventLimit),
    failureCandidates: failureCandidatesFull.slice(0, slicePlan.failureLimit),
    signalLines: bestTarget
      ? {
          target: bestTarget.fileName || bestTarget.label,
          lines: signalLineItemsFull.slice(0, slicePlan.signalLimit),
        }
      : null,
    knowledge: knowledgeFull.slice(0, slicePlan.knowledgeLimit),
  })

  const estimateContextChars = () => {
    const sliced = applySlicePlan()
    return JSON.stringify({
      generatedAt: 'x',
      question: input.question,
      selectedTask: selectedTaskSummary,
      selectedNodeFocus,
      taskOverview,
      selectedNodeTimeline: sliced.selectedNodeTimeline,
      selectedEventTail: sliced.selectedEventTail,
      failureCandidates: sliced.failureCandidates,
      timelineDiagnostics: {
        scopeNodeCount: fullTaskTimeline.length,
        pipelineFailedCount,
        jumpBackHotNodes: jumpBackHotNodes.slice(0, 10),
        longStayNodes: timelineDiagnostics.longStayNodes,
        recoFailuresByName: timelineDiagnostics.recoFailuresByName,
        repeatedRuns: timelineDiagnostics.repeatedRuns,
        hotspotRecoPairs: timelineDiagnostics.hotspotRecoPairs,
      },
      signalLines: sliced.signalLines,
      signalDiagnostics,
      eventChainDiagnostics,
      stopTerminationDiagnostics,
      nextCandidateAvailabilityDiagnostics,
      anchorResolutionDiagnostics,
      jumpBackFlowDiagnostics,
      nestedActionDiagnostics,
      questionNodeDiagnostics,
      deterministicFindings,
      questionFocusedSummary,
      relatedExtraction,
      knowledgeMeta,
      knowledge: sliced.knowledge,
    }).length
  }

  const reduceOneStep = (): boolean => {
    const candidates = [
      { key: 'nodeLimit', score: slicePlan.nodeLimit * 170, step: 12 },
      { key: 'signalLimit', score: slicePlan.signalLimit * 140, step: 8 },
      { key: 'failureLimit', score: slicePlan.failureLimit * 140, step: 5 },
      { key: 'eventLimit', score: slicePlan.eventLimit * 95, step: 6 },
      { key: 'knowledgeLimit', score: slicePlan.knowledgeLimit * 180, step: 2 },
    ]
      .filter(item => slicePlan[item.key as keyof typeof slicePlan] > sliceMin[item.key as keyof typeof sliceMin])
      .sort((a, b) => b.score - a.score)

    if (candidates.length === 0) return false

    const target = candidates[0]
    const key = target.key as keyof typeof slicePlan
    const next = Math.max(
      sliceMin[key],
      slicePlan[key] - target.step
    )
    if (next >= slicePlan[key]) return false
    slicePlan[key] = next
    return true
  }

  let estimatedChars = estimateContextChars()
  let guard = 0
  while (estimatedChars > contextTargetChars && guard < 28) {
    const changed = reduceOneStep()
    if (!changed) break
    estimatedChars = estimateContextChars()
    guard += 1
  }

  const sliced = applySlicePlan()

  return {
    generatedAt: new Date().toISOString(),
    question: input.question,
    flowLabelLegend: FLOW_LABEL_LEGEND,
    selectedTask: selectedTaskSummary,
    selectedNodeFocus,
    taskOverview,
    selectedNodeTimeline: sliced.selectedNodeTimeline,
    selectedEventTail: sliced.selectedEventTail,
    failureCandidates: sliced.failureCandidates,
    timelineDiagnostics: {
      scopeNodeCount: fullTaskTimeline.length,
      pipelineFailedCount,
      jumpBackHotNodes: jumpBackHotNodes.slice(0, 10),
      longStayNodes: timelineDiagnostics.longStayNodes,
      recoFailuresByName: timelineDiagnostics.recoFailuresByName,
      repeatedRuns: timelineDiagnostics.repeatedRuns,
      hotspotRecoPairs: timelineDiagnostics.hotspotRecoPairs,
    },
    signalLines: sliced.signalLines,
    signalDiagnostics,
    eventChainDiagnostics,
    stopTerminationDiagnostics,
    nextCandidateAvailabilityDiagnostics,
    anchorResolutionDiagnostics,
    jumpBackFlowDiagnostics,
    nestedActionDiagnostics,
    questionNodeDiagnostics,
    deterministicFindings,
    questionFocusedSummary,
    relatedExtraction,
    knowledgeMeta,
    knowledge: sliced.knowledge,
    contextBudget: {
      targetChars: contextTargetChars,
      estimatedChars,
      nodeLimit: slicePlan.nodeLimit,
      eventLimit: slicePlan.eventLimit,
      failureLimit: slicePlan.failureLimit,
      signalLimit: slicePlan.signalLimit,
      knowledgeLimit: slicePlan.knowledgeLimit,
    },
  }
}
