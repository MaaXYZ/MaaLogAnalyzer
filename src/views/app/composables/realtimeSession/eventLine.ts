import type { RealtimeEventItem } from './types'

const toRealtimeProcessId = (details: Record<string, unknown>): string => {
  const candidates = [details.process_id, details.processId, details.pid]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.startsWith('Px') ? candidate : `Px${candidate}`
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return `Px${candidate}`
    }
  }
  return 'Px0'
}

const toRealtimeThreadId = (details: Record<string, unknown>): string => {
  const candidates = [details.thread_id, details.threadId, details.tid]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.startsWith('Tx') ? candidate : `Tx${candidate}`
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return `Tx${candidate}`
    }
  }
  return 'Tx0'
}

const toRealtimeTimestamp = (at: number): string => {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

export const createRealtimeEventLineBuilder = () => {
  const unknownMessages = new Set<string>()

  const normalizeRealtimeMessage = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const msg = value.trim()
    if (!msg) return null
    if (msg.startsWith('Tasker.Task.') || msg.startsWith('Node.')) return msg
    if (msg.startsWith('Task.')) return `Tasker.${msg}`
    if (msg.startsWith('PipelineNode.')) return `Node.${msg}`
    if (msg.startsWith('RecognitionNode.')) return `Node.${msg}`
    if (msg.startsWith('ActionNode.')) return `Node.${msg}`
    if (msg.startsWith('NextList.')) return `Node.${msg}`
    if (msg.startsWith('Recognition.')) return `Node.${msg}`
    if (msg.startsWith('Action.')) return `Node.${msg}`
    if (!unknownMessages.has(msg)) {
      unknownMessages.add(msg)
      console.warn('[realtime] unsupported event message ignored:', msg)
    }
    return null
  }

  const toSyntheticEventLine = (event: RealtimeEventItem): string | null => {
    const normalizedMsg = normalizeRealtimeMessage(event.msg)
    if (!normalizedMsg) return null

    let detailsText = '{}'
    try {
      detailsText = JSON.stringify(event.details)
    } catch {
      return null
    }

    return `[${toRealtimeTimestamp(event.at)}][INF][${toRealtimeProcessId(event.details)}][${toRealtimeThreadId(event.details)}][realtime][0][on_event_notify] !!!OnEventNotify!!! [handle=realtime] [msg=${normalizedMsg}] [details=${detailsText}]`
  }

  const clearUnknownMessages = () => {
    unknownMessages.clear()
  }

  return {
    toSyntheticEventLine,
    clearUnknownMessages,
  }
}
