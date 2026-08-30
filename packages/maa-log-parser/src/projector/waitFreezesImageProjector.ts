import { toTimestampMs } from '../shared/timestamp'
import type { ScopeNode } from '../trace/scopeTypes'

interface TimeWindow {
  startMs: number
  endMs: number
}

interface TraceContext {
  taskId?: number
  nodeId?: number
  sourceKey?: string
  hasTaskScope?: boolean
  hasNodeScope?: boolean
  taskWindow?: TimeWindow
  nodeWindow?: TimeWindow
}

interface WaitFreezesOccurrence {
  scopeId: string
  name: string
  seq: number
  taskId?: number
  nodeId?: number
  sourceKey?: string
  startMs: number
  endMs: number
}

interface WaitFreezesImage {
  key: string
  name: string
  path: string
  timestampMs: number
}

const readRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

const readString = (
  record: Record<string, unknown>,
  camelField: string,
  snakeField?: string,
): string | undefined => {
  const camelValue = record[camelField]
  if (typeof camelValue === 'string') return camelValue
  if (!snakeField) return undefined
  const snakeValue = record[snakeField]
  return typeof snakeValue === 'string' ? snakeValue : undefined
}

const readNumber = (
  record: Record<string, unknown>,
  camelField: string,
  snakeField?: string,
): number | undefined => {
  const camelValue = record[camelField]
  if (typeof camelValue === 'number') return camelValue
  if (!snakeField) return undefined
  const snakeValue = record[snakeField]
  return typeof snakeValue === 'number' ? snakeValue : undefined
}

const parseScopeWindow = (scope: ScopeNode, fallbackEndMs: number): TimeWindow | undefined => {
  const startMs = toTimestampMs(scope.ts)
  const parsedEndMs = toTimestampMs(scope.endTs)
  const endMs = Number.isFinite(parsedEndMs) ? parsedEndMs : fallbackEndMs
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return undefined
  }
  return { startMs, endMs }
}

const intersectWindows = (first?: TimeWindow, second?: TimeWindow): TimeWindow | undefined => {
  if (!first || !second) return undefined
  const startMs = Math.max(first.startMs, second.startMs)
  const endMs = Math.min(first.endMs, second.endMs)
  return endMs >= startMs ? { startMs, endMs } : undefined
}

const readScopeSourceKey = (payload: Record<string, unknown>): string | undefined => {
  const source = readRecord(payload.source)
  return source ? readString(source, 'sourceKey', 'source_key') : undefined
}

const isNodeScope = (scope: ScopeNode): boolean => {
  return (
    scope.kind === 'pipeline_node' ||
    scope.kind === 'recognition_node' ||
    scope.kind === 'action_node'
  )
}

const collectWaitFreezesOccurrences = (
  scope: ScopeNode,
  fallbackEndMs: number,
  context: TraceContext,
  output: WaitFreezesOccurrence[],
): void => {
  const payload = readRecord(scope.payload) ?? {}
  const scopeWindow = parseScopeWindow(scope, fallbackEndMs)
  const taskId = scope.taskId ?? readNumber(payload, 'taskId', 'task_id') ?? context.taskId
  const sourceKey = readScopeSourceKey(payload) ?? context.sourceKey

  let taskWindow = context.taskWindow
  let hasTaskScope = context.hasTaskScope ?? false
  let hasNodeScope = context.hasNodeScope ?? false
  let nodeId = context.nodeId
  let nodeWindow = context.nodeWindow
  if (scope.kind === 'task') {
    hasTaskScope = true
    taskWindow = scopeWindow
    hasNodeScope = false
    nodeId = undefined
    nodeWindow = undefined
  }

  if (isNodeScope(scope)) {
    hasNodeScope = true
    nodeId = readNumber(payload, 'nodeId', 'node_id') ?? context.nodeId
    const parentWindow = context.hasNodeScope ? context.nodeWindow : taskWindow
    nodeWindow = intersectWindows(parentWindow, scopeWindow)
  }

  if (scope.kind === 'wait_freezes') {
    let occurrenceWindow = scopeWindow
    if (hasTaskScope) {
      occurrenceWindow = intersectWindows(occurrenceWindow, taskWindow)
    }
    if (hasNodeScope) {
      occurrenceWindow = intersectWindows(occurrenceWindow, nodeWindow)
    }
    if (occurrenceWindow) {
      output.push({
        scopeId: scope.id,
        name: readString(payload, 'name') ?? scope.kind,
        seq: scope.seq,
        taskId,
        nodeId,
        sourceKey,
        ...occurrenceWindow,
      })
    }
  }

  const childContext: TraceContext = {
    taskId,
    nodeId,
    sourceKey,
    hasTaskScope,
    hasNodeScope,
    taskWindow,
    nodeWindow,
  }
  for (const child of scope.children) {
    collectWaitFreezesOccurrences(child, fallbackEndMs, childContext, output)
  }
}

const parseWaitFreezesImage = (key: string, path: string): WaitFreezesImage | undefined => {
  const match = key.match(
    /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d{1,3})_(.+)_wait_freezes$/,
  )
  if (!match) return undefined

  const [, year, month, day, hour, minute, second, milliseconds, name] = match
  const timestampMs = toTimestampMs(
    `${year}-${month}-${day} ${hour}:${minute}:${second}.${milliseconds.padEnd(3, '0')}`,
  )
  if (!Number.isFinite(timestampMs)) return undefined

  return { key, name, path, timestampMs }
}

const compareText = (left: string, right: string): number => {
  if (left === right) return 0
  return left < right ? -1 : 1
}

const compareImages = (left: WaitFreezesImage, right: WaitFreezesImage): number => {
  return (
    left.timestampMs - right.timestampMs ||
    compareText(left.key, right.key) ||
    compareText(left.path, right.path)
  )
}

const compareOccurrenceForImage = (
  left: WaitFreezesOccurrence,
  right: WaitFreezesOccurrence,
): number => {
  const leftNodeSpecificity = left.nodeId == null ? 0 : 1
  const rightNodeSpecificity = right.nodeId == null ? 0 : 1
  const leftTaskSpecificity = left.taskId == null ? 0 : 1
  const rightTaskSpecificity = right.taskId == null ? 0 : 1

  return (
    right.startMs - left.startMs ||
    rightNodeSpecificity - leftNodeSpecificity ||
    rightTaskSpecificity - leftTaskSpecificity ||
    left.endMs - right.endMs ||
    right.seq - left.seq ||
    compareText(left.sourceKey ?? '', right.sourceKey ?? '') ||
    (left.taskId ?? Number.MAX_SAFE_INTEGER) - (right.taskId ?? Number.MAX_SAFE_INTEGER) ||
    (left.nodeId ?? Number.MAX_SAFE_INTEGER) - (right.nodeId ?? Number.MAX_SAFE_INTEGER) ||
    compareText(left.scopeId, right.scopeId)
  )
}

const selectOccurrence = (
  image: WaitFreezesImage,
  occurrences: readonly WaitFreezesOccurrence[],
): WaitFreezesOccurrence | undefined => {
  let selected: WaitFreezesOccurrence | undefined
  for (const occurrence of occurrences) {
    if (occurrence.name !== image.name) continue
    if (image.timestampMs < occurrence.startMs || image.timestampMs > occurrence.endMs) continue
    if (!selected || compareOccurrenceForImage(occurrence, selected) < 0) {
      selected = occurrence
    }
  }
  return selected
}

/**
 * Assign each wait_freezes screenshot to exactly one trace occurrence.
 *
 * Filenames do not contain task or node ids, so the trace's task/node windows
 * provide the ownership boundary. Overlapping malformed/concurrent windows are
 * resolved deterministically in favor of the most recently started occurrence.
 */
export const buildWaitFreezesImageAssignments = (
  root: ScopeNode,
  source: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> => {
  if (source.size === 0) return new Map()

  const fallbackEndMs = toTimestampMs(root.endTs)

  const occurrences: WaitFreezesOccurrence[] = []
  collectWaitFreezesOccurrences(root, fallbackEndMs, {}, occurrences)
  if (occurrences.length === 0) return new Map()

  const occurrencesByName = new Map<string, WaitFreezesOccurrence[]>()
  for (const occurrence of occurrences) {
    const matching = occurrencesByName.get(occurrence.name)
    if (matching) {
      matching.push(occurrence)
    } else {
      occurrencesByName.set(occurrence.name, [occurrence])
    }
  }

  const images = [...source.entries()]
    .map(([key, path]) => parseWaitFreezesImage(key, path))
    .filter((image): image is WaitFreezesImage => !!image)
    .sort(compareImages)
  const assignments = new Map<string, string[]>()

  for (const image of images) {
    const matchingOccurrences = occurrencesByName.get(image.name)
    if (!matchingOccurrences) continue
    const occurrence = selectOccurrence(image, matchingOccurrences)
    if (!occurrence) continue
    const assigned = assignments.get(occurrence.scopeId)
    if (assigned) {
      assigned.push(image.path)
    } else {
      assignments.set(occurrence.scopeId, [image.path])
    }
  }

  return assignments
}
