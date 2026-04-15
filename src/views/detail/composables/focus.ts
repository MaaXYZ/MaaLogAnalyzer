import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import type { FocusCardData, FocusCardEntry, FocusSourceKind } from './types'

const DEFAULT_FOCUS_DISPLAY = ['log']

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const stringifyFocusValue = (
  value: unknown,
): string => {
  if (typeof value === 'string') return value
  if (
    typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  ) {
    return String(value)
  }
  if (value == null) return 'null'

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const normalizeDisplay = (
  value: unknown,
): string[] => {
  if (typeof value === 'string' && value.trim()) {
    return [value]
  }

  if (Array.isArray(value)) {
    const normalized = value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .filter((entry, index, items) => items.indexOf(entry) === index)
    return normalized.length > 0 ? normalized : DEFAULT_FOCUS_DISPLAY
  }

  return DEFAULT_FOCUS_DISPLAY
}

const readTemplateEntry = (
  value: unknown,
): { content: unknown; display: string[] } | null => {
  if (value == null) return null

  if (isRecord(value) && (
    Object.prototype.hasOwnProperty.call(value, 'content')
    || Object.prototype.hasOwnProperty.call(value, 'display')
  )) {
    if (!Object.prototype.hasOwnProperty.call(value, 'content')) return null
    return {
      content: value.content,
      display: normalizeDisplay(value.display),
    }
  }

  return {
    content: value,
    display: DEFAULT_FOCUS_DISPLAY,
  }
}

const getValueByPath = (
  details: Record<string, unknown>,
  path: string,
): unknown => {
  if (Object.prototype.hasOwnProperty.call(details, path)) {
    return details[path]
  }

  const segments = path.split(/[\.\[\]]+/).filter(Boolean)
  let current: unknown = details

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return undefined
      current = current[index]
      continue
    }

    if (isRecord(current)) {
      current = current[segment]
      continue
    }

    return undefined
  }

  return current
}

const resolveContent = (
  content: unknown,
  details: Record<string, unknown>,
): string => {
  if (typeof content !== 'string') {
    return stringifyFocusValue(content)
  }

  return content.replace(/\{([^{}]+)\}/g, (match, rawToken: string) => {
    const token = rawToken.trim()
    if (!token) return match

    const value = getValueByPath(details, token)
    if (value === undefined) return match
    return stringifyFocusValue(value)
  })
}

const createEntry = (
  template: { content: unknown; display: string[] } | null,
  details: Record<string, unknown>,
  options: {
    message?: string
    phase?: FocusCardEntry['phase']
  } = {},
): FocusCardEntry | null => {
  if (!template || template.content == null) return null

  return {
    message: options.message,
    phase: options.phase,
    display: template.display,
    resolvedContent: resolveContent(template.content, details),
  }
}

const createMappedEntries = (
  focus: Record<string, unknown>,
  candidates: Array<{
    message: string
    phase: FocusCardEntry['phase']
    details: Record<string, unknown>
  }>,
): FocusCardEntry[] => {
  return candidates
    .map((candidate) => createEntry(
      readTemplateEntry(focus[candidate.message]),
      candidate.details,
      {
        message: candidate.message,
        phase: candidate.phase,
      },
    ))
    .filter((entry): entry is FocusCardEntry => !!entry)
}

const resolveFocusCardData = (
  sourceKind: FocusSourceKind,
  focus: unknown,
  candidates: Array<{
    message: string
    phase: FocusCardEntry['phase']
    details: Record<string, unknown>
  }>,
): FocusCardData | null => {
  if (focus == null) return null

  if (isRecord(focus)) {
    if (
      Object.prototype.hasOwnProperty.call(focus, 'content')
      || Object.prototype.hasOwnProperty.call(focus, 'display')
    ) {
      const genericEntry = createEntry(
        readTemplateEntry(focus),
        candidates[candidates.length - 1]?.details ?? candidates[0]?.details ?? {},
      )
      return genericEntry
        ? { sourceKind, entries: [genericEntry], rawFocus: focus }
        : null
    }

    const mappedEntries = createMappedEntries(focus, candidates)
    return mappedEntries.length > 0
      ? { sourceKind, entries: mappedEntries, rawFocus: focus }
      : null
  }

  const genericEntry = createEntry(
    readTemplateEntry(focus),
    candidates[candidates.length - 1]?.details ?? candidates[0]?.details ?? {},
  )
  return genericEntry
    ? { sourceKind, entries: [genericEntry], rawFocus: focus }
    : null
}

const buildTerminalPhase = (
  status: UnifiedFlowItem['status'] | NodeInfo['status'],
): FocusCardEntry['phase'] | null => {
  if (status === 'success') return 'succeeded'
  if (status === 'failed') return 'failed'
  return null
}

const buildMessageCandidates = (
  messageBase: string,
  status: UnifiedFlowItem['status'] | NodeInfo['status'],
  details: {
    starting: Record<string, unknown>
    terminal?: Record<string, unknown>
  },
): Array<{
  message: string
  phase: FocusCardEntry['phase']
  details: Record<string, unknown>
}> => {
  const candidates: Array<{
    message: string
    phase: FocusCardEntry['phase']
    details: Record<string, unknown>
  }> = [{
    message: `${messageBase}.Starting`,
    phase: 'starting',
    details: details.starting,
  }]

  const terminalPhase = buildTerminalPhase(status)
  if (!terminalPhase) return candidates

  const terminalSuffix = terminalPhase === 'succeeded' ? 'Succeeded' : 'Failed'
  candidates.push({
    message: `${messageBase}.${terminalSuffix}`,
    phase: terminalPhase,
    details: details.terminal ?? details.starting,
  })

  return candidates
}

export const buildNodeFocusCardData = (
  node: NodeInfo,
): FocusCardData | null => {
  return resolveFocusCardData(
    'node',
    node.focus,
    buildMessageCandidates('Node.PipelineNode', node.status, {
      starting: {
        task_id: node.task_id,
        node_id: node.node_id,
        name: node.name,
        focus: node.focus,
      },
      terminal: {
        task_id: node.task_id,
        node_id: node.node_id,
        name: node.name,
        focus: node.focus,
        node_details: node.node_details,
        reco_details: node.reco_details,
        action_details: node.action_details,
      },
    }),
  )
}

export const buildRecognitionFocusCardData = (
  item: UnifiedFlowItem,
  selectedNode?: NodeInfo | null,
): FocusCardData | null => {
  const messageBase = item.type === 'recognition_node'
    ? 'Node.RecognitionNode'
    : 'Node.Recognition'
  const recoDetails = item.reco_details ?? selectedNode?.reco_details
  const name = item.name || recoDetails?.name || selectedNode?.name || ''
  const focus = item.focus
  const sharedDetails: Record<string, unknown> = {
    task_id: item.task_id ?? selectedNode?.task_id,
    node_id: item.node_id ?? selectedNode?.node_id,
    reco_id: item.reco_id ?? recoDetails?.reco_id,
    name,
    focus,
    ...(item.anchor_name ? { anchor: item.anchor_name } : {}),
  }

  return resolveFocusCardData(
    'recognition',
    focus,
    buildMessageCandidates(messageBase, item.status, {
      starting: sharedDetails,
      terminal: {
        ...sharedDetails,
        reco_details: recoDetails,
      },
    }),
  )
}

export const buildActionFocusCardData = (
  item: UnifiedFlowItem,
  selectedNode?: NodeInfo | null,
): FocusCardData | null => {
  const messageBase = item.type === 'action_node'
    ? 'Node.ActionNode'
    : 'Node.Action'
  const actionDetails = item.action_details ?? selectedNode?.action_details
  const name = item.name || actionDetails?.name || selectedNode?.name || ''
  const focus = item.focus
  const sharedDetails: Record<string, unknown> = {
    task_id: item.task_id ?? selectedNode?.task_id,
    node_id: item.node_id ?? selectedNode?.node_id,
    action_id: item.action_id ?? actionDetails?.action_id,
    name,
    focus,
  }

  return resolveFocusCardData(
    'action',
    focus,
    buildMessageCandidates(messageBase, item.status, {
      starting: sharedDetails,
      terminal: {
        ...sharedDetails,
        action_details: actionDetails,
      },
    }),
  )
}
