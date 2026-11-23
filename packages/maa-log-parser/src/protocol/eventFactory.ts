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
  /**
   * 共享重复的识别明细对象。
   *
   * 同一次识别（`processId + reco_id`）的 `reco_details` 会被多个事件重复携带
   * （识别事件、识别节点事件、流水线节点事件等），内容完全相同。提供该钩子后，
   * 相同 key 的明细复用同一个对象，避免重复分配整棵 matcher 调试树。
   */
  internRecoDetails?: (
    processId: string,
    recoId: number,
    details: EventDetails,
  ) => EventDetails
  /** 同 `internRecoDetails`，作用于 `action_details`（按 `processId + action_id`）。 */
  internActionDetails?: (
    processId: string,
    actionId: number,
    details: EventDetails,
  ) => EventDetails
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

const readUnknownField = (details: EventDetails, field: string): unknown => details[field]

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

const readPositiveSafeIntegerField = (details: EventDetails, field: string): number | undefined => {
  const value = readNumberField(details, field)
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * 取出并（可选地）共享 `reco_details`，**同时把 `rawDetails.reco_details` 也指向共享对象**。
 *
 * 为什么必须回写：`rawDetails` 是整条事件的原始 JSON 对象，重复的 matcher 调试树主要就挂在
 * 它的 `reco_details` 子对象上。只改事件上的 `recoDetails` 字段的话，rawDetails 里那棵树仍然
 * 每事件一份，内存一点没省（实测 A/B 差值为 0）。
 *
 * `reco_id` 优先用事件自身字段；流水线节点事件没有 `reco_id` 时从明细里读。
 * 同一 (processId, reco_id) 的明细在日志里内容一致（实测 0 例冲突），因此可以安全共享；
 * 回写后 rawDetails 的 JSON 序列化结果不变（内容本来就相同）。
 */
const readRecoDetails = (
  event: ParsedEventLine,
  options: CreateProtocolEventOptions,
  details: EventDetails,
  eventRecoId?: number,
): EventDetails | undefined => {
  const record = readRecord(readUnknownField(details, 'reco_details'))
  if (!record || !options.internRecoDetails) return record
  const recoId = eventRecoId ?? readPositiveSafeIntegerField(record, 'reco_id')
  if (recoId === undefined) return record
  const shared = options.internRecoDetails(event.processId, recoId, record)
  if (shared !== record) details.reco_details = shared
  return shared
}

/** 取出并（可选地）共享 `action_details`（按 `processId + action_id`），同样回写 rawDetails。 */
const readActionDetails = (
  event: ParsedEventLine,
  options: CreateProtocolEventOptions,
  details: EventDetails,
  eventActionId?: number,
): EventDetails | undefined => {
  const record = readRecord(readUnknownField(details, 'action_details'))
  if (!record || !options.internActionDetails) return record
  const actionId = eventActionId ?? readPositiveSafeIntegerField(record, 'action_id')
  if (actionId === undefined) return record
  const shared = options.internActionDetails(event.processId, actionId, record)
  if (shared !== record) details.action_details = shared
  return shared
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
    const taskId = readPositiveSafeIntegerField(details, 'task_id')
    if (taskId === undefined) return null

    const protocolEvent: TaskEvent = {
      ...buildBase(event, options, 'task', phase),
      taskId,
      entry: readStringField(details, 'entry'),
      uuid: readStringField(details, 'uuid'),
      hash: readStringField(details, 'hash'),
    }
    return protocolEvent
  }

  if (meta.domain !== 'Node') return null

  switch (meta.nodeKind) {
    case 'PipelineNode': {
      const taskId = readPositiveSafeIntegerField(details, 'task_id')
      const nodeId = readPositiveSafeIntegerField(details, 'node_id')
      if (taskId === undefined || nodeId === undefined) return null

      const protocolEvent: PipelineNodeEvent = {
        ...buildBase(event, options, 'pipeline_node', phase),
        taskId,
        nodeId,
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        nodeDetails: readRecord(readUnknownField(details, 'node_details')),
        recoDetails: readRecoDetails(event, options, details),
        actionDetails: readActionDetails(event, options, details),
      }
      return protocolEvent
    }
    case 'RecognitionNode': {
      const taskId = readPositiveSafeIntegerField(details, 'task_id')
      const nodeId = readPositiveSafeIntegerField(details, 'node_id')
      if (taskId === undefined || nodeId === undefined) return null

      const protocolEvent: RecognitionNodeEvent = {
        ...buildBase(event, options, 'recognition_node', phase),
        taskId,
        nodeId,
        recoId: readPositiveSafeIntegerField(details, 'reco_id'),
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        nodeDetails: readRecord(readUnknownField(details, 'node_details')),
        recoDetails: readRecoDetails(
          event,
          options,
          details,
          readPositiveSafeIntegerField(details, 'reco_id'),
        ),
      }
      return protocolEvent
    }
    case 'ActionNode': {
      const taskId = readPositiveSafeIntegerField(details, 'task_id')
      const nodeId = readPositiveSafeIntegerField(details, 'node_id')
      if (taskId === undefined || nodeId === undefined) return null

      const protocolEvent: ActionNodeEvent = {
        ...buildBase(event, options, 'action_node', phase),
        taskId,
        nodeId,
        actionId: readPositiveSafeIntegerField(details, 'action_id'),
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        nodeDetails: readRecord(readUnknownField(details, 'node_details')),
        actionDetails: readActionDetails(
          event,
          options,
          details,
          readPositiveSafeIntegerField(details, 'action_id'),
        ),
      }
      return protocolEvent
    }
    case 'NextList': {
      const taskId = readPositiveSafeIntegerField(details, 'task_id')
      if (taskId === undefined) return null

      const protocolEvent: NextListEvent = {
        ...buildBase(event, options, 'next_list', phase),
        taskId,
        name: readStringField(details, 'name'),
        list: readNextList(readUnknownField(details, 'list')),
        focus: readUnknownField(details, 'focus'),
      }
      return protocolEvent
    }
    case 'Recognition': {
      const taskId = readPositiveSafeIntegerField(details, 'task_id')
      const recoId = readPositiveSafeIntegerField(details, 'reco_id')
      if (taskId === undefined || recoId === undefined) return null

      const protocolEvent: RecognitionEvent = {
        ...buildBase(event, options, 'recognition', phase),
        taskId,
        recoId,
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        anchor: readStringField(details, 'anchor'),
        recoDetails: readRecoDetails(event, options, details, recoId),
      }
      return protocolEvent
    }
    case 'Action': {
      const taskId = readPositiveSafeIntegerField(details, 'task_id')
      const actionId = readPositiveSafeIntegerField(details, 'action_id')
      if (taskId === undefined || actionId === undefined) return null

      const protocolEvent: ActionEvent = {
        ...buildBase(event, options, 'action', phase),
        taskId,
        actionId,
        name: readStringField(details, 'name'),
        focus: readUnknownField(details, 'focus'),
        actionDetails: readActionDetails(event, options, details, actionId),
      }
      return protocolEvent
    }
    case 'WaitFreezes': {
      const taskId = readPositiveSafeIntegerField(details, 'task_id')
      const wfId = readPositiveSafeIntegerField(details, 'wf_id')
      if (taskId === undefined || wfId === undefined) return null

      const protocolEvent: WaitFreezesEvent = {
        ...buildBase(event, options, 'wait_freezes', phase),
        taskId,
        wfId,
        name: readStringField(details, 'name'),
        waitPhase: readStringField(details, 'phase'),
        roi: parseRoi(readUnknownField(details, 'roi')),
        param: parseWaitFreezesParam(readUnknownField(details, 'param')),
        recoIds: parseNumericArray(readUnknownField(details, 'reco_ids')),
        elapsed: readNumberField(details, 'elapsed'),
        focus: readUnknownField(details, 'focus'),
      }
      return protocolEvent
    }
    default:
      return null
  }
}
