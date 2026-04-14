import { parseMaaMessageMeta } from '../event/meta'
import type { ParsedEventLine } from '../event/line'
import {
  parseNumericArray,
  parseRoi,
  parseWaitFreezesParam,
  readNumberField,
  readStringField,
  type EventDetails,
} from '../shared/logEventDecoders'
import type {
  ActionEvent,
  ActionNodeEvent,
  ControllerActionEvent,
  NextListEvent,
  PipelineNodeEvent,
  ProtocolEvent,
  ProtocolEventBase,
  ProtocolNextListItem,
  ProtocolPhase,
  RecognitionEvent,
  RecognitionNodeEvent,
  ResourceLoadingEvent,
  SourceRef,
  TaskEvent,
  WaitFreezesEvent,
} from './types'

export interface CreateSourceRefOptions {
  sourceKey?: string
  sourcePath?: string
  inputIndex?: number
  line?: number
}

export interface CreateProtocolEventOptions extends CreateSourceRefOptions {
  seq: number
}

const toProtocolPhase = (phase: string): ProtocolPhase | null => {
  switch (phase) {
    case 'Starting':
      return 'starting'
    case 'Succeeded':
      return 'succeeded'
    case 'Failed':
      return 'failed'
    default:
      return null
  }
}

const readRecord = (value: unknown): EventDetails | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as EventDetails
}

const readUnknownField = (
  details: EventDetails,
  field: string,
): unknown => details[field]

const readNextList = (value: unknown): ProtocolNextListItem[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const items = value.map((entry: unknown) => {
    const raw = readRecord(entry)
    if (!raw) {
      return {}
    }

    return {
      name: readStringField(raw, 'name'),
      anchor: typeof raw.anchor === 'boolean' ? raw.anchor : undefined,
      jumpBack: typeof raw.jump_back === 'boolean' ? raw.jump_back : undefined,
    }
  })

  return items
}

const requireTaskId = <T extends { taskId?: number }>(
  event: T,
): T | null => {
  return event.taskId != null ? event : null
}

const buildBase = <TKind extends ProtocolEvent['kind']>(
  event: ParsedEventLine,
  options: CreateProtocolEventOptions,
  kind: TKind,
  phase: ProtocolPhase,
): ProtocolEventBase<TKind> => ({
  kind,
  seq: options.seq,
  ts: event.timestamp,
  tsMs: event._timestampMs,
  processId: event.processId,
  threadId: event.threadId,
  source: createSourceRef(event, options),
  rawMessage: event.message,
  phase,
  rawDetails: event.details,
})

export const createSourceRef = (
  event: Pick<ParsedEventLine, '_lineNumber'>,
  options: CreateSourceRefOptions = {},
): SourceRef => {
  const inputIndex = options.inputIndex ?? 0
  return {
    sourceKey: options.sourceKey ?? options.sourcePath ?? `input:${inputIndex}`,
    sourcePath: options.sourcePath,
    inputIndex,
    line: options.line ?? event._lineNumber ?? 0,
  }
}

export const createProtocolEvent = (
  event: ParsedEventLine,
  options: CreateProtocolEventOptions,
): ProtocolEvent | null => {
  const meta = parseMaaMessageMeta(event.message)
  const phase = toProtocolPhase(meta.phase)
  if (!phase) return null

  const details = event.details

  if (event.message.startsWith('Resource.Loading.')) {
    const protocolEvent: ResourceLoadingEvent = {
      ...buildBase(event, options, 'resource_loading', phase),
      resId: readNumberField(details, 'res_id'),
      path: readStringField(details, 'path'),
      resourceType: readStringField(details, 'type'),
      hash: readStringField(details, 'hash'),
    }
    return protocolEvent
  }

  if (event.message.startsWith('Controller.Action.')) {
    const protocolEvent: ControllerActionEvent = {
      ...buildBase(event, options, 'controller_action', phase),
      ctrlId: readNumberField(details, 'ctrl_id'),
      uuid: readStringField(details, 'uuid'),
      action: readStringField(details, 'action'),
      param: readRecord(readUnknownField(details, 'param')),
      info: readRecord(readUnknownField(details, 'info')),
    }
    return protocolEvent
  }

  if (meta.domain === 'Tasker' && meta.taskerKind === 'Task') {
    const protocolEvent: TaskEvent = {
      ...buildBase(event, options, 'task', phase),
      taskId: readNumberField(details, 'task_id'),
      entry: readStringField(details, 'entry'),
      uuid: readStringField(details, 'uuid'),
      hash: readStringField(details, 'hash'),
    }
    return requireTaskId(protocolEvent)
  }

  if (meta.domain !== 'Node') return null

  switch (meta.nodeKind) {
    case 'PipelineNode': {
      const protocolEvent: PipelineNodeEvent = {
        ...buildBase(event, options, 'pipeline_node', phase),
        taskId: readNumberField(details, 'task_id'),
        nodeId: readNumberField(details, 'node_id'),
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        nodeDetails: readRecord(readUnknownField(details, 'node_details')),
        recoDetails: readRecord(readUnknownField(details, 'reco_details')),
        actionDetails: readRecord(readUnknownField(details, 'action_details')),
      }
      return requireTaskId(protocolEvent)
    }
    case 'RecognitionNode': {
      const protocolEvent: RecognitionNodeEvent = {
        ...buildBase(event, options, 'recognition_node', phase),
        taskId: readNumberField(details, 'task_id'),
        nodeId: readNumberField(details, 'node_id'),
        recoId: readNumberField(details, 'reco_id'),
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        nodeDetails: readRecord(readUnknownField(details, 'node_details')),
        recoDetails: readRecord(readUnknownField(details, 'reco_details')),
      }
      return requireTaskId(protocolEvent)
    }
    case 'ActionNode': {
      const protocolEvent: ActionNodeEvent = {
        ...buildBase(event, options, 'action_node', phase),
        taskId: readNumberField(details, 'task_id'),
        nodeId: readNumberField(details, 'node_id'),
        actionId: readNumberField(details, 'action_id'),
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        nodeDetails: readRecord(readUnknownField(details, 'node_details')),
        actionDetails: readRecord(readUnknownField(details, 'action_details')),
      }
      return requireTaskId(protocolEvent)
    }
    case 'NextList': {
      const protocolEvent: NextListEvent = {
        ...buildBase(event, options, 'next_list', phase),
        taskId: readNumberField(details, 'task_id'),
        name: readStringField(details, 'name'),
        list: readNextList(readUnknownField(details, 'list')),
        focus: readUnknownField(details, 'focus'),
      }
      return requireTaskId(protocolEvent)
    }
    case 'Recognition': {
      const protocolEvent: RecognitionEvent = {
        ...buildBase(event, options, 'recognition', phase),
        taskId: readNumberField(details, 'task_id'),
        recoId: readNumberField(details, 'reco_id'),
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        anchor: readStringField(details, 'anchor'),
        recoDetails: readRecord(readUnknownField(details, 'reco_details')),
      }
      return requireTaskId(protocolEvent)
    }
    case 'Action': {
      const protocolEvent: ActionEvent = {
        ...buildBase(event, options, 'action', phase),
        taskId: readNumberField(details, 'task_id'),
        actionId: readNumberField(details, 'action_id'),
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        actionDetails: readRecord(readUnknownField(details, 'action_details')),
      }
      return requireTaskId(protocolEvent)
    }
    case 'WaitFreezes': {
      const protocolEvent: WaitFreezesEvent = {
        ...buildBase(event, options, 'wait_freezes', phase),
        taskId: readNumberField(details, 'task_id'),
        wfId: readNumberField(details, 'wf_id'),
        name: readStringField(details, 'name'),
        waitPhase: readStringField(details, 'phase'),
        roi: parseRoi(readUnknownField(details, 'roi')),
        param: parseWaitFreezesParam(readUnknownField(details, 'param')),
        recoIds: parseNumericArray(readUnknownField(details, 'reco_ids')),
        elapsed: readNumberField(details, 'elapsed'),
        focus: readUnknownField(details, 'focus'),
      }
      return requireTaskId(protocolEvent)
    }
    default:
      return null
  }
}
