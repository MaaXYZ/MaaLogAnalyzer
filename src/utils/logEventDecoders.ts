export type EventDetails = Record<string, unknown>

export interface TaskLifecycleEventDetails {
  task_id?: number
  entry: string
  hash: string
  uuid: string
}

export const readNumberField = (
  details: EventDetails | undefined,
  field: string
): number | undefined => {
  if (!details) return undefined
  const value = details[field]
  return typeof value === 'number' ? value : undefined
}

export const readStringField = (
  details: EventDetails | undefined,
  field: string
): string | undefined => {
  if (!details) return undefined
  const value = details[field]
  return typeof value === 'string' ? value : undefined
}

export const decodeTaskLifecycleEventDetails = (
  details: EventDetails | undefined
): TaskLifecycleEventDetails => {
  return {
    task_id: readNumberField(details, 'task_id'),
    entry: readStringField(details, 'entry') ?? '',
    hash: readStringField(details, 'hash') ?? '',
    uuid: readStringField(details, 'uuid') ?? '',
  }
}
