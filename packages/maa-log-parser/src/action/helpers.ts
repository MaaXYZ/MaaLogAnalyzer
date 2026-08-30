import { readNumberField } from '../shared/logEventDecoders'
import { resolveCompletionStatus, type KnownMaaPhase } from '../event/meta'

export const resolveRuntimeStatusFromPhase = (
  phase: KnownMaaPhase,
): 'running' | 'success' | 'failed' => {
  if (phase === 'Starting') return 'running'
  return resolveCompletionStatus(phase)
}

const readNestedNumberField = (
  details: Record<string, any>,
  nestedField: string,
  field: string,
): number | undefined => {
  const nested = details[nestedField]
  if (!nested || typeof nested !== 'object') return undefined
  return readNumberField(nested as Record<string, any>, field)
}

export const resolveActionDetailsActionId = (details: Record<string, any>): number | undefined => {
  return (
    readNestedNumberField(details, 'action_details', 'action_id') ??
    readNestedNumberField(details, 'node_details', 'action_id')
  )
}

export const resolveActionNodeEventId = (details: Record<string, any>): number | undefined => {
  return (
    readNestedNumberField(details, 'action_details', 'action_id') ??
    readNumberField(details, 'action_id') ??
    readNumberField(details, 'node_id')
  )
}

export const resolveSubTaskActionKey = (
  subTaskId: number,
  actionId: number | null | undefined,
): string | null => {
  return actionId != null ? `${subTaskId}:${actionId}` : null
}

export const resolveActionEventName = (
  details: Record<string, any>,
  options: {
    fallbackName?: string
    intern?: (value: string) => string
  } = {},
): string => {
  const rawName = details.name || details.action_details?.name || options.fallbackName || ''
  return options.intern ? options.intern(rawName) : rawName
}
