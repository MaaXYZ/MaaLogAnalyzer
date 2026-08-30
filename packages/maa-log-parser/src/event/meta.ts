export type MaaDomain = 'Resource' | 'Controller' | 'Tasker' | 'Node' | 'Unknown'
export type MaaPhase = 'Starting' | 'Succeeded' | 'Failed' | 'Unknown'
export type MaaTaskerKind = 'Task' | 'Unknown'
export type MaaNodeKind =
  | 'PipelineNode'
  | 'RecognitionNode'
  | 'ActionNode'
  | 'NextList'
  | 'Recognition'
  | 'Action'
  | 'WaitFreezes'
  | 'Unknown'
export type KnownMaaPhase = Exclude<MaaPhase, 'Unknown'>
export type TaskTerminalPhase = Exclude<KnownMaaPhase, 'Starting'>

export interface MaaMessageMeta {
  domain: MaaDomain
  phase: MaaPhase
  taskerKind: MaaTaskerKind
  nodeKind: MaaNodeKind
}

const normalizeMaaDomain = (value: string): MaaDomain => {
  switch (value) {
    case 'Resource':
    case 'Controller':
    case 'Tasker':
    case 'Node':
      return value
    default:
      return 'Unknown'
  }
}

const normalizeMaaPhase = (value: string): MaaPhase => {
  switch (value) {
    case 'Starting':
    case 'Succeeded':
    case 'Failed':
      return value
    default:
      return 'Unknown'
  }
}

const normalizeMaaTaskerKind = (value: string): MaaTaskerKind => {
  return value === 'Task' ? 'Task' : 'Unknown'
}

const normalizeMaaNodeKind = (value: string): MaaNodeKind => {
  switch (value) {
    case 'PipelineNode':
    case 'RecognitionNode':
    case 'ActionNode':
    case 'NextList':
    case 'Recognition':
    case 'Action':
    case 'WaitFreezes':
      return value
    default:
      return 'Unknown'
  }
}

export const parseMaaMessageMeta = (message: string): MaaMessageMeta => {
  const firstDot = message.indexOf('.')
  if (firstDot < 0) {
    return { domain: 'Unknown', phase: 'Unknown', taskerKind: 'Unknown', nodeKind: 'Unknown' }
  }
  const secondDot = message.indexOf('.', firstDot + 1)
  if (secondDot < 0) {
    return { domain: 'Unknown', phase: 'Unknown', taskerKind: 'Unknown', nodeKind: 'Unknown' }
  }

  const domainRaw = message.slice(0, firstDot)
  const kindRaw = message.slice(firstDot + 1, secondDot)
  const phaseRaw = message.slice(secondDot + 1)

  const domain = normalizeMaaDomain(domainRaw)
  const phase = normalizeMaaPhase(phaseRaw)
  const taskerKind = domain === 'Tasker' ? normalizeMaaTaskerKind(kindRaw) : 'Unknown'
  const nodeKind = domain === 'Node' ? normalizeMaaNodeKind(kindRaw) : 'Unknown'

  return {
    domain,
    phase,
    taskerKind,
    nodeKind,
  }
}

export const toKnownMaaPhase = (phase: MaaPhase): KnownMaaPhase | null => {
  if (phase === 'Unknown') return null
  return phase
}

export const resolveTaskLifecyclePhase = (meta: MaaMessageMeta): KnownMaaPhase | null => {
  if (meta.domain !== 'Tasker' || meta.taskerKind !== 'Task') return null
  return toKnownMaaPhase(meta.phase)
}

export const isTaskTerminalPhase = (phase: KnownMaaPhase): phase is TaskTerminalPhase => {
  return phase !== 'Starting'
}

export const resolveTaskTerminalStatus = (phase: TaskTerminalPhase): 'succeeded' | 'failed' => {
  return phase === 'Succeeded' ? 'succeeded' : 'failed'
}

export const resolveCompletionStatus = (phase: KnownMaaPhase): 'success' | 'failed' => {
  return phase === 'Succeeded' ? 'success' : 'failed'
}

export const resolveTerminalCompletionStatus = (phase: TaskTerminalPhase): 'success' | 'failed' => {
  return resolveCompletionStatus(phase)
}

export const parseEventTimestampMs = (timestamp: string): number => {
  const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T')
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

const pad2 = (value: number) => String(value).padStart(2, '0')
const pad3 = (value: number) => String(value).padStart(3, '0')

export const formatEventTimestampMs = (timestampMs: number): string => {
  const date = new Date(timestampMs)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`
}

/** FNV-1a hash maps a string to a 32-bit integer string for dedup signatures. */
const fnv1aHash = (str: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36)
}

export const buildEventDedupSignature = (message: string, detailsJson: string): string => {
  return `${message}|${fnv1aHash(detailsJson)}`
}
